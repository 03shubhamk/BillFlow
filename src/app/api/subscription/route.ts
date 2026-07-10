import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PLANS } from "@/lib/constants";
import { sendEmail, getCancellationConfirmedTemplate, getInvoiceGeneratedTemplate, getSubscriptionConfirmedTemplate } from "@/lib/mailer";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_2026_billflow";

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { action, planId } = await request.json();
    const sub = user.subscription;

    if (!sub) {
      return NextResponse.json({ error: "No subscription found for this user" }, { status: 400 });
    }

    // Ensure state is not expired/pending for modifying actions
    if (sub.status !== "active" && action !== "reactivate") {
      return NextResponse.json({ error: "Subscription must be active to modify" }, { status: 400 });
    }

    const now = new Date();

    if (action === "cancel") {
      const updatedSub = await prisma.subscription.update({
        where: { id: sub.id },
        data: { cancelAtPeriodEnd: true },
      });

      const plan = PLANS.find((p) => p.id === sub.planId);
      const accessEndDate = sub.currentPeriodEnd.toLocaleDateString();

      // Trigger Email Notification
      await sendEmail({
        to: user.email,
        subject: "Subscription Cancellation Confirmed",
        body: getCancellationConfirmedTemplate(user.email, plan?.name || sub.planId, accessEndDate),
        type: "cancellation_confirmed",
      });

      return NextResponse.json({ success: true, subscription: updatedSub });
    }

    if (action === "reactivate") {
      const updatedSub = await prisma.subscription.update({
        where: { id: sub.id },
        data: { cancelAtPeriodEnd: false },
      });

      return NextResponse.json({ success: true, subscription: updatedSub });
    }

    if (action === "upgrade") {
      const newPlan = PLANS.find((p) => p.id === planId);
      const oldPlan = PLANS.find((p) => p.id === sub.planId);

      if (!newPlan || !oldPlan) {
        return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
      }

      // Pro-ration calculation:
      // credit = old_price * (remaining_time / total_time)
      const totalDuration = sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime();
      const remainingDuration = sub.currentPeriodEnd.getTime() - now.getTime();
      const fractionRemaining = Math.max(0, Math.min(1, remainingDuration / totalDuration));
      
      const unusedValue = fractionRemaining * oldPlan.price;
      const chargeAmount = Math.max(0, newPlan.price - unusedValue);

      // Create new period (monthly cycle starts today)
      const nextPeriodStart = now;
      const nextPeriodEnd = new Date();
      nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);

      const invoiceNumber = `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`;

      // Update db in a transaction
      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.subscription.update({
          where: { id: sub.id },
          data: {
            planId: newPlan.id,
            price: newPlan.price,
            status: "active",
            currentPeriodStart: nextPeriodStart,
            currentPeriodEnd: nextPeriodEnd,
            cancelAtPeriodEnd: false,
            pendingDowngradePlanId: null,
          },
        });

        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber,
            userId: user.id,
            subscriptionId: sub.id,
            amount: chargeAmount,
            status: "paid",
            billingDate: now,
          },
        });

        // Record successful Payment
        await tx.payment.create({
          data: {
            userId: user.id,
            subscriptionId: sub.id,
            invoiceId: invoice.id,
            amount: chargeAmount,
            status: "successful",
            provider: "mock",
            providerPaymentId: `mock_upg_${Math.random().toString(36).substring(2, 12)}`,
          },
        });

        return { updated, invoice };
      });

      // Email notifications
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      await sendEmail({
        to: user.email,
        subject: "Subscription Upgraded!",
        body: getSubscriptionConfirmedTemplate(user.email, newPlan.name, nextPeriodEnd.toLocaleDateString(), newPlan.price),
        type: "subscription_confirmed",
      });

      const sig = crypto
        .createHmac("sha256", JWT_SECRET)
        .update(invoiceNumber)
        .digest("hex");

      await sendEmail({
        to: user.email,
        subject: `Invoice Paid - ${invoiceNumber}`,
        body: getInvoiceGeneratedTemplate(user.email, invoiceNumber, chargeAmount, now.toLocaleDateString(), `${appUrl}/api/invoices/${result.invoice.id}/download?sig=${sig}`),
        type: "invoice_generated",
      });

      return NextResponse.json({
        success: true,
        subscription: result.updated,
        invoice: result.invoice,
      });
    }

    if (action === "downgrade") {
      const newPlan = PLANS.find((p) => p.id === planId);
      if (!newPlan) {
        return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
      }

      // Downgrades are scheduled for next billing period end
      const updatedSub = await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          pendingDowngradePlanId: newPlan.id,
          cancelAtPeriodEnd: false, // Ensure subscription renews to downgrade plan rather than cancelling
        },
      });

      return NextResponse.json({ success: true, subscription: updatedSub });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Subscription update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
