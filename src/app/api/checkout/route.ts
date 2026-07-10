import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { PLANS } from "@/lib/constants";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { planId } = await request.json();
    const plan = PLANS.find((p) => p.id === planId);

    if (!plan) {
      return NextResponse.json(
        { error: "Invalid plan selected" },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Check if it's an upgrade
    const sub = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });

    let amount = plan.price;
    const isUpgrade = sub && sub.status === "active";

    if (isUpgrade) {
      const oldPlan = PLANS.find((p) => p.id === sub.planId);
      if (oldPlan) {
        const now = new Date();
        const totalDuration = sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime();
        const remainingDuration = sub.currentPeriodEnd.getTime() - now.getTime();
        const fractionRemaining = Math.max(0, Math.min(1, remainingDuration / totalDuration));
        const unusedValue = fractionRemaining * oldPlan.price;
        amount = Math.max(0, plan.price - unusedValue);
      }
    }

    // 1. Check if Stripe is configured
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (stripeSecret) {
      try {
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(stripeSecret, {} as any);

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: isUpgrade ? `Plan Upgrade to ${plan.name}` : `${plan.name} Plan`,
                  description: isUpgrade
                    ? `Pro-rated charge to upgrade from ${sub.planId.toUpperCase()} to ${plan.name}`
                    : `Subscription to the ${plan.name} plan`,
                },
                unit_amount: Math.round(amount * 100), // in cents
                recurring: {
                  interval: "month",
                },
              },
              quantity: 1,
            },
          ],
          mode: "subscription",
          success_url: `${appUrl}/dashboard?checkout_status=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}/pricing`,
          client_reference_id: user.id,
          customer_email: user.email,
          metadata: {
            planId: plan.id,
            userId: user.id,
            isUpgrade: isUpgrade ? "true" : "false",
          },
        });

        return NextResponse.json({ url: session.url });
      } catch (stripeErr) {
        console.error("Stripe Checkout error, falling back to mock:", stripeErr);
      }
    }

    // 2. Fallback to Mock Payment Gateway
    const paymentAttempt = await prisma.paymentAttempt.create({
      data: {
        userId: user.id,
        planId: plan.id,
        amount,
        status: "pending",
        provider: "mock",
        providerPaymentId: `mock_ch_${Math.random().toString(36).substring(2, 15)}`,
      },
    });

    const mockUrl = `/checkout-redirect?planId=${plan.id}&userId=${user.id}&attemptId=${paymentAttempt.id}`;
    return NextResponse.json({ url: mockUrl });
  } catch (error) {
    console.error("Checkout route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
