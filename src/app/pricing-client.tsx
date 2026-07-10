"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLANS } from "@/lib/constants";

interface PricingClientProps {
  userId: string | null;
  currentPlanId: string | null;
}

export default function PricingClient({ userId, currentPlanId }: PricingClientProps) {
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleSelectPlan = async (planId: string) => {
    if (!userId) {
      // Redirect to login page
      router.push(`/login?redirect=pricing&planId=${planId}`);
      return;
    }

    if (currentPlanId) {
      // If already subscribed, redirect to dashboard to manage it
      router.push("/dashboard?action=change_plan");
      return;
    }

    setLoadingPlan(planId);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });

      const data = await response.json();

      if (response.ok && data.url) {
        // Redirect to gateway (Stripe or Mock)
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to initiate checkout");
        setLoadingPlan(null);
      }
    } catch (err) {
      console.error("Checkout redirection error:", err);
      alert("An unexpected error occurred.");
      setLoadingPlan(null);
    }
  };

  return (
    <div style={{ maxWidth: "1000px", margin: "60px auto", padding: "0 20px" }} className="animate-fade-in">
      <div style={{ textAlign: "center", marginBottom: "50px" }}>
        <h1 style={{ fontSize: "36px", fontWeight: "800", letterSpacing: "-0.03em", marginBottom: "16px" }}>
          Subscription Billing Plans
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "16px", maxWidth: "600px", margin: "0 auto" }}>
          Choose a subscription tier to get started. All checkouts support mock simulations for success, pending, and failed states.
        </p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: "30px",
        alignItems: "stretch"
      }}>
        {PLANS.map((plan) => {
          const isCurrent = currentPlanId === plan.id;
          const isPro = plan.id === "pro";
          
          return (
            <div
              key={plan.id}
              className={`card ${isPro ? "pro-card" : ""}`}
              style={{
                display: "flex",
                flexDirection: "column",
                position: "relative",
                border: isPro ? "1px solid var(--color-primary)" : "1px solid var(--border-muted)",
                boxShadow: isPro ? "var(--glow-violet)" : "var(--shadow-main)",
              }}
            >
              {isPro && (
                <span
                  style={{
                    position: "absolute",
                    top: "-12px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    backgroundColor: "var(--color-primary)",
                    color: "white",
                    fontSize: "11px",
                    fontWeight: "700",
                    padding: "4px 12px",
                    borderRadius: "9999px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    boxShadow: "0 2px 10px rgba(139, 92, 246, 0.4)",
                  }}
                >
                  Most Popular
                </span>
              )}

              <div style={{ marginBottom: "25px" }}>
                <h2 style={{ fontSize: "22px", fontWeight: "700", marginBottom: "8px" }}>
                  {plan.name}
                </h2>
                <div style={{ display: "flex", alignItems: "baseline", gap: "4px", margin: "15px 0" }}>
                  <span style={{ fontSize: "36px", fontWeight: "800", color: "var(--text-main)" }}>
                    ${plan.price}
                  </span>
                  <span style={{ color: "var(--text-muted)", fontSize: "14px" }}>/mo</span>
                </div>
              </div>

              <ul style={{ listStyle: "none", marginBottom: "35px", flex: 1 }}>
                {plan.features.map((feature, idx) => (
                  <li
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      fontSize: "14px",
                      color: "var(--text-muted)",
                      marginBottom: "12px",
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--color-success)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSelectPlan(plan.id)}
                className={`btn ${isCurrent ? "btn-secondary" : isPro ? "btn-primary" : "btn-secondary"}`}
                style={{ width: "100%", padding: "12px" }}
                disabled={loadingPlan !== null || isCurrent}
              >
                {loadingPlan === plan.id ? (
                  "Redirecting..."
                ) : isCurrent ? (
                  "Current Plan"
                ) : currentPlanId ? (
                  "Select Plan"
                ) : (
                  "Select Plan"
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
