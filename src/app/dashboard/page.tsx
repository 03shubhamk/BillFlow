import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import DashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  const awaitedParams = await searchParams;
  const checkoutStatus =
    typeof awaitedParams.checkout_status === "string" ? awaitedParams.checkout_status : null;

  // Retrieve invoices
  const invoices = await prisma.invoice.findMany({
    where: { userId: user.id },
    orderBy: { billingDate: "desc" },
  });

  // Retrieve payment attempts
  const paymentAttempts = await prisma.paymentAttempt.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  // Retrieve successful/failed formal payments
  const payments = await prisma.payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  // Map dates to strings for serializability
  const serializedSubscription = user.subscription
    ? {
        id: user.subscription.id,
        planId: user.subscription.planId,
        price: user.subscription.price,
        status: user.subscription.status,
        currentPeriodStart: user.subscription.currentPeriodStart.toISOString(),
        currentPeriodEnd: user.subscription.currentPeriodEnd.toISOString(),
        cancelAtPeriodEnd: user.subscription.cancelAtPeriodEnd,
        pendingDowngradePlanId: user.subscription.pendingDowngradePlanId,
      }
    : null;

  const serializedInvoices = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    amount: inv.amount,
    status: inv.status,
    billingDate: inv.billingDate.toISOString(),
  }));

  const serializedAttempts = paymentAttempts.map((att) => ({
    id: att.id,
    planId: att.planId,
    amount: att.amount,
    status: att.status,
    createdAt: att.createdAt.toISOString(),
  }));

  const serializedPayments = payments.map((p) => ({
    id: p.id,
    amount: p.amount,
    status: p.status,
    provider: p.provider,
    providerPaymentId: p.providerPaymentId,
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <DashboardClient
      userId={user.id}
      userEmail={user.email}
      subscription={serializedSubscription}
      invoices={serializedInvoices}
      paymentAttempts={serializedAttempts}
      payments={serializedPayments}
      checkoutStatus={checkoutStatus}
    />
  );
}
