"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedPlanId = searchParams.get("planId");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        router.refresh();
        if (selectedPlanId) {
          // If a plan was selected before register, initiate checkout immediately
          try {
            const checkoutRes = await fetch("/api/checkout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ planId: selectedPlanId }),
            });
            const checkoutData = await checkoutRes.json();
            if (checkoutRes.ok && checkoutData.url) {
              window.location.href = checkoutData.url;
              return;
            }
          } catch (checkoutErr) {
            console.error("Post-register checkout error:", checkoutErr);
          }
        }
        window.location.href = "/dashboard";
      } else {
        setError(data.error || "Registration failed");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "420px", margin: "100px auto", padding: "0 20px" }}>
      <div className="card animate-fade-in" style={{ padding: "40px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "700", marginBottom: "8px", textAlign: "center" }}>
          Create an Account
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "30px", textAlign: "center" }}>
          Register to get started with BillFlow
        </p>

        {error && (
          <div
            style={{
              padding: "12px",
              borderRadius: "6px",
              backgroundColor: "rgba(244, 63, 94, 0.1)",
              border: "1px solid rgba(244, 63, 94, 0.2)",
              color: "var(--color-danger)",
              fontSize: "13px",
              marginBottom: "20px",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="•••••••• (Min 6 chars)"
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: "30px" }}>
            <label className="form-label">Confirm Password</label>
            <input
              type="password"
              className="form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", padding: "12px" }}
            disabled={loading}
          >
            {loading ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        <p style={{ marginTop: "24px", fontSize: "13px", color: "var(--text-muted)", textAlign: "center" }}>
          Already have an account?{" "}
          <Link
            href="/login"
            style={{ color: "var(--color-primary)", textDecoration: "none", fontWeight: "600" }}
          >
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: "center", marginTop: "100px" }}>Loading...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
