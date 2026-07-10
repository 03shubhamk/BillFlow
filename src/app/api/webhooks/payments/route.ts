import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PLANS } from "@/lib/constants";
import { sendEmail, getSubscriptionConfirmedTemplate, getInvoiceGeneratedTemplate, getPaymentFailedTemplate } from "@/lib/mailer";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_2026_billflow";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: Request) {
  const rawBody = await request.text();
  let event: { id: string; type: string; data: any } | null = null;
  let isMock = false;

  // 1. Signature Verification
  const stripeSignature = request.headers.get("stripe-signature");
  const mockSignature = request.headers.get("x-mock-signature");

  if (stripeSignature && STRIPE_WEBHOOK_SECRET) {
    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {} as any);

      const stripeEvent = stripe.webhooks.constructEvent(
        rawBody,
        stripeSignature,
        STRIPE_WEBHOOK_SECRET
      );

      // Convert Stripe event to unified schema
      let eventType = stripeEvent.type;
      if (stripeEvent.type === "checkout.session.completed") {
        eventType = "payment.succeeded";
      } else if (stripeEvent.type === "checkout.session.async_payment_failed") {
        eventType = "payment.failed";
      }

      event = {
        id: stripeEvent.id,
        type: eventType,
        data: stripeEvent.data.object,
      };
    } catch (err: any) {
      console.error("Stripe signature validation failed:", err);
      return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
    }
  } else if (mockSignature) {
    // Validate Mock signature using HMAC
    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(rawBody)
      .digest("hex");

    if (mockSignature !== expectedSignature) {
      console.error("Mock signature validation failed");
      return NextResponse.json({ error: "Invalid Mock signature" }, { status: 400 });
    }

    try {
      event = JSON.parse(rawBody);
      isMock = true;
    } catch (err) {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
  } else {
    return NextResponse.json(
      { error: "Missing signature headers" },
      { status: 400 }
    );
  }

  if (!event || !event.id || !event.type) {
    return NextResponse.json({ error: "Malformed event payload" }, { status: 400 });
  }

  const eventId = event.id;

  // 2. Strict Idempotency Check
  try {
    const payload = event?.data;
    const userId = payload ? (payload.userId || payload.metadata?.userId || payload.client_reference_id) : null;

    // Attempt to register the event as "processing"
    // Prisma doesn't have an easy UPSERT that fails on exists, so we try creating it.
    await prisma.webhookEvent.create({
      data: {
        id: eventId,
        status: "processing",
        userId: userId || null,
      },
    });
  } catch (dbErr: any) {
    // If insertion failed due to unique constraint, check the event's current status
    if (dbErr.code === "P2002") {
      const existingEvent = await prisma.webhookEvent.findUnique({
        where: { id: eventId },
      });

      if (existingEvent) {
        if (existingEvent.status === "processed") {
          console.log(`Idempotent hit: Webhook event ${eventId} already processed.`);
          return NextResponse.json(
            { message: "Event already processed (idempotent skip)", eventId },
            { status: 200 }
          );
        } else if (existingEvent.status === "processing") {
          console.log(`Conflict: Webhook event ${eventId} is currently processing.`);
          return NextResponse.json(
            { error: "Event processing in progress" },
            { status: 409 } // Conflict - indicates retry later
          );
        } else {
          // If status is failed, we allow processing again. Let's update it to processing.
          await prisma.webhookEvent.update({
            where: { id: eventId },
            data: { status: "processing", error: null },
          });
        }
      }
    } else {
      console.error("Database error during idempotency check:", dbErr);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
  }

  // 3. Process the Event in a Transaction
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (event.type === "payment.succeeded") {
      const payload = event.data;
      let userId = payload.userId || payload.metadata?.userId;
      let planId = payload.planId || payload.metadata?.planId;
      let amount = parseFloat(payload.amount || payload.amount_total || "0");
      let providerPaymentId = payload.providerPaymentId || payload.id;

      // Handle Stripe amounts (which are in cents)
      if (!isMock) {
        amount = amount / 100;
      }

      if (!userId || !planId) {
        throw new Error("Missing userId or planId in webhook event data");
      }

      const plan = PLANS.find((p) => p.id === planId);
      if (!plan) {
        throw new Error(`Plan ${planId} not found`);
      }

      const now = new Date();
      const periodStart = now;
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const invoiceNumber = `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`;

      await prisma.$transaction(async (tx) => {
        // Find if user already has a subscription
        const existingSub = await tx.subscription.findUnique({
          where: { userId },
        });

        let subId = "";

        if (existingSub) {
          const updatedSub = await tx.subscription.update({
            where: { id: existingSub.id },
            data: {
              planId: plan.id,
              price: plan.price,
              status: "active",
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: false,
              pendingDowngradePlanId: null,
            },
          });
          subId = updatedSub.id;
        } else {
          const newSub = await tx.subscription.create({
            data: {
              userId,
              planId: plan.id,
              price: plan.price,
              status: "active",
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
            },
          });
          subId = newSub.id;
        }

        // Record successful payment attempt
        if (payload.attemptId) {
          await tx.paymentAttempt.update({
            where: { id: payload.attemptId },
            data: { status: "successful", providerPaymentId },
          });
        } else {
          await tx.paymentAttempt.create({
            data: {
              userId,
              planId: plan.id,
              amount,
              status: "successful",
              provider: isMock ? "mock" : "stripe",
              providerPaymentId,
            },
          });
        }

        // Create Invoice
        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber,
            userId,
            subscriptionId: subId,
            amount,
            status: "paid",
            billingDate: now,
          },
        });

        // Record successful Payment
        await tx.payment.create({
          data: {
            userId,
            subscriptionId: subId,
            invoiceId: invoice.id,
            amount,
            status: "successful",
            provider: isMock ? "mock" : "stripe",
            providerPaymentId,
          },
        });
      });

      // Get user email
      const userObj = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (userObj) {
        // Send email notifications asynchronously (non-blocking)
        sendEmail({
          to: userObj.email,
          subject: "Subscription Confirmed!",
          body: getSubscriptionConfirmedTemplate(
            userObj.email,
            plan.name,
            periodEnd.toLocaleDateString(),
            plan.price
          ),
          type: "subscription_confirmed",
        }).catch(err => console.error("Webhook confirm email failed:", err));

        const sig = crypto
          .createHmac("sha256", JWT_SECRET)
          .update(invoiceNumber)
          .digest("hex");

        sendEmail({
          to: userObj.email,
          subject: `Invoice Paid - ${invoiceNumber}`,
          body: getInvoiceGeneratedTemplate(
            userObj.email,
            invoiceNumber,
            amount,
            now.toLocaleDateString(),
            `${appUrl}/api/invoices/${invoiceNumber}/download?sig=${sig}`
          ),
          type: "invoice_generated",
        }).catch(err => console.error("Webhook invoice email failed:", err));
      }
    } else if (event.type === "payment.failed") {
      const payload = event.data;
      const userId = payload.userId || payload.metadata?.userId;
      const planId = payload.planId || payload.metadata?.planId;
      const amount = parseFloat(payload.amount || payload.amount_total || "0") / (isMock ? 1 : 100);
      const providerPaymentId = payload.providerPaymentId || payload.id;

      if (userId && planId) {
        const plan = PLANS.find((p) => p.id === planId);

        await prisma.$transaction(async (tx) => {
          if (payload.attemptId) {
            await tx.paymentAttempt.update({
              where: { id: payload.attemptId },
              data: { status: "failed", providerPaymentId },
            });
          } else {
            await tx.paymentAttempt.create({
              data: {
                userId,
                planId,
                amount,
                status: "failed",
                provider: isMock ? "mock" : "stripe",
                providerPaymentId,
              },
            });
          }

          // If they have a pending subscription, we mark it expired or inactive
          const sub = await tx.subscription.findUnique({ where: { userId } });
          
          // Record failed Payment
          await tx.payment.create({
            data: {
              userId,
              subscriptionId: sub ? sub.id : null,
              amount,
              status: "failed",
              provider: isMock ? "mock" : "stripe",
              providerPaymentId,
            },
          });

          if (sub && sub.status === "pending") {
            await tx.subscription.update({
              where: { id: sub.id },
              data: { status: "expired" },
            });
          }
        });

        const userObj = await prisma.user.findUnique({ where: { id: userId } });
        if (userObj && plan) {
          sendEmail({
            to: userObj.email,
            subject: "Subscription Payment Failed",
            body: getPaymentFailedTemplate(
              userObj.email,
              plan.name,
              amount,
              `${appUrl}/pricing`
            ),
            type: "payment_failed",
          }).catch(err => console.error("Webhook payment failed email failed:", err));
        }
      }
    }

    // 4. Mark Event as Processed
    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        status: "processed",
      },
    });

    return NextResponse.json({ success: true, eventId });
  } catch (err: any) {
    console.error(`Error processing webhook event ${eventId}:`, err);

    // Rollback event state to failed so it can be retried
    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        status: "failed",
        error: err.message || "Unknown processing error",
      },
    });

    return NextResponse.json(
      { error: "Webhook processing failed", message: err.message },
      { status: 500 }
    );
  }
}
