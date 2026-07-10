import { getSessionUser } from "@/lib/auth";
import PricingClient from "./pricing-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  const userId = user ? user.id : null;
  const currentPlanId =
    user?.subscription && user.subscription.status === "active"
      ? user.subscription.planId
      : null;

  return <PricingClient userId={userId} currentPlanId={currentPlanId} />;
}
