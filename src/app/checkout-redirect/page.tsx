"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PLANS } from "@/lib/constants";

function CheckoutRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const planId = searchParams.get("planId") || "basic";
  const userId = searchParams.get("userId") || "";
  const attemptId = searchParams.get("attemptId") || "";

  const [loading, setLoading] = useState(false);
  const plan = PLANS.find((p) => p.id === planId) || PLANS[0];

  const handleSimulate = async (status: "success" | "pending" | "failed") => {
    setLoading(true);

    try {
      if (status === "success") {
        // Trigger simulated successful webhook
        const res = await fetch("/api/developer/simulate-webhook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "payment.succeeded",
            userId,
            planId,
            amount: plan.price,
            attemptId,
          }),
        });

        if (res.ok) {
          // Add a short delay to allow the background webhook fetch to complete in SQLite
          await new Promise((r) => setTimeout(r, 600));
          router.push("/dashboard?checkout_status=success");
        } else {
          alert("Simulation webhook dispatch failed.");
          setLoading(false);
        }
      } else if (status === "failed") {
        // Trigger simulated failed webhook
        const res = await fetch("/api/developer/simulate-webhook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "payment.failed",
            userId,
            planId,
            amount: plan.price,
            attemptId,
          }),
        });

        if (res.ok) {
          await new Promise((r) => setTimeout(r, 600));
          router.push("/dashboard?checkout_status=failed");
        } else {
          alert("Simulation webhook dispatch failed.");
          setLoading(false);
        }
      } else {
        // Pending state: we do NOT dispatch any webhook event to simulate bank delay.
        // The PaymentAttempt remains in status "pending".
        // Redirect to dashboard, which will show inactive subscription.
        router.push("/dashboard?checkout_status=pending");
      }
    } catch (err) {
      console.error("Simulation error:", err);
      alert("Simulation failed.");
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "600px", margin: "80px auto", padding: "0 20px" }} className="animate-fade-in">
      <div className="card" style={{ border: "1px solid var(--color-primary)", padding: "40px" }}>
        <div style={{ textAlign: "center", marginBottom: "30px" }}>
          <span
            style={{
              display: "inline-block",
              backgroundColor: "rgba(139, 92, 246, 0.1)",
              border: "1px solid rgba(139, 92, 246, 0.2)",
              color: "var(--color-primary)",
              fontSize: "11px",
              fontWeight: "700",
              padding: "4px 12px",
              borderRadius: "9999px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "15px",
            }}
          >
            BillFlow Sandbox Gateway
          </span>
          <h1 style={{ fontSize: "24px", fontWeight: "800", marginBottom: "8px" }}>
            Payment Integration Simulator
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
            Choose an outcome below to simulate the redirect and trigger the background webhook processor.
          </p>
        </div>

        <div
          style={{
            backgroundColor: "rgba(0,0,0,0.2)",
            border: "1px solid var(--border-muted)",
            borderRadius: "6px",
            padding: "20px",
            marginBottom: "35px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>Plan Tier:</span>
            <span style={{ fontWeight: "600", textTransform: "uppercase" }}>{plan.name}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>Amount Due:</span>
            <span style={{ fontWeight: "700", color: "var(--color-success)" }}>${plan.price.toFixed(2)}/mo</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>Attempt ID:</span>
            <span style={{ fontFamily: "monospace", fontSize: "12px" }}>{attemptId}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>User ID:</span>
            <span style={{ fontFamily: "monospace", fontSize: "12px" }}>{userId}</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          <button
            onClick={() => handleSimulate("success")}
            className="btn btn-success"
            style={{ padding: "14px", width: "100%" }}
            disabled={loading}
          >
            {loading ? "Processing..." : "Simulate Payment Success"}
          </button>
          
          <button
            onClick={() => handleSimulate("pending")}
            className="btn btn-warning"
            style={{ padding: "14px", width: "100%" }}
            disabled={loading}
          >
            {loading ? "Processing..." : "Simulate Payment Pending"}
          </button>

          <button
            onClick={() => handleSimulate("failed")}
            className="btn btn-danger"
            style={{ padding: "14px", width: "100%" }}
            disabled={loading}
          >
            {loading ? "Processing..." : "Simulate Payment Failed"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutRedirectPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: "center", marginTop: "100px" }}>Loading Simulator...</div>}>
      <CheckoutRedirectContent />
    </Suspense>
  );
}
