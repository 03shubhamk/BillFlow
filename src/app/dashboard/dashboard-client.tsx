"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PLANS } from "@/lib/constants";

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: string;
  billingDate: string;
}

interface PaymentAttempt {
  id: string;
  planId: string;
  amount: number;
  status: string;
  createdAt: string;
}

interface Subscription {
  id: string;
  planId: string;
  price: number;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  pendingDowngradePlanId: string | null;
}

interface Payment {
  id: string;
  amount: number;
  status: string;
  provider: string;
  providerPaymentId: string;
  createdAt: string;
}

interface DashboardClientProps {
  userId: string;
  userEmail: string;
  subscription: Subscription | null;
  invoices: Invoice[];
  paymentAttempts: PaymentAttempt[];
  payments: Payment[];
  checkoutStatus: string | null;
}

export default function DashboardClient({
  userId,
  userEmail,
  subscription,
  invoices,
  paymentAttempts,
  payments,
  checkoutStatus,
}: DashboardClientProps) {
  const router = useRouter();
  const [activeModal, setActiveModal] = useState<"upgrade" | "downgrade" | "cancel" | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Poll for subscription updates if returning from successful checkout
  useEffect(() => {
    if (checkoutStatus === "success" && paymentAttempts.length > 0) {
      const targetPlanId = paymentAttempts[0].planId;
      const targetPlan = PLANS.find((p) => p.id === targetPlanId);
      
      const isSettled = subscription && 
                        subscription.planId === targetPlanId && 
                        subscription.status === "active";
                        
      if (!isSettled) {
        setIsVerifying(true);
        
        // Refresh page data every 1.5s to pull new DB records
        const interval = setInterval(() => {
          router.refresh();
        }, 1500);
        
        return () => clearInterval(interval);
      } else {
        setIsVerifying(false);
        setMessage({
          type: "success",
          text: `🎉 Thank you! Your payment was verified. Your active plan is now: ${targetPlan?.name || targetPlanId}.`,
        });
        
        // Clean URL to prevent recurring state checks
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, "", cleanUrl);
      }
    } else if (checkoutStatus) {
      // Just clear other checkout statuses instantly
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, [checkoutStatus, subscription, paymentAttempts, router]);

  // Find current plan details
  const currentPlan = PLANS.find((p) => p.id === subscription?.planId);

  const handleSubscriptionAction = async (action: "upgrade" | "downgrade" | "cancel" | "reactivate", planId?: string) => {
    setLoading(true);
    setMessage(null);

    // If upgrading, redirect to checkout page for payment
    if (action === "upgrade") {
      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId }),
        });
        const data = await res.json();
        if (res.ok && data.url) {
          window.location.href = data.url;
          return;
        } else {
          setMessage({ type: "error", text: data.error || "Failed to initiate upgrade checkout" });
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error("Upgrade checkout redirection error:", err);
        setMessage({ type: "error", text: "An unexpected error occurred." });
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, planId }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({
          type: "success",
          text: `Subscription ${action}d successfully.`,
        });
        setActiveModal(null);
        router.refresh();
      } else {
        setMessage({ type: "error", text: data.error || "Subscription update failed." });
      }
    } catch (err) {
      console.error("Subscription update error:", err);
      setMessage({ type: "error", text: "An unexpected error occurred." });
    } finally {
      setLoading(false);
    }
  };

  // Simulate bank settlement webhook for PENDING payment attempt
  const handleSimulateSettlement = async (attempt: PaymentAttempt) => {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/developer/simulate-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "payment.succeeded",
          userId,
          planId: attempt.planId,
          amount: attempt.amount,
          attemptId: attempt.id,
        }),
      });

      if (res.ok) {
        setMessage({
          type: "success",
          text: "Settlement webhook dispatched. Reloading subscription status...",
        });
        await new Promise((r) => setTimeout(r, 600));
        router.refresh();
      } else {
        setMessage({ type: "error", text: "Settlement simulation failed." });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "An unexpected error occurred during settlement simulation." });
    } finally {
      setLoading(false);
    }
  };

  // Helper to get formatted status badge for attempts
  const getAttemptBadge = (status: string) => {
    switch (status) {
      case "successful":
        return <span className="badge badge-success">Successful</span>;
      case "pending":
        return <span className="badge badge-warning">Pending</span>;
      case "failed":
        return <span className="badge badge-danger">Failed</span>;
      default:
        return <span className="badge badge-primary">{status}</span>;
    }
  };

  // Render checkout outcome banner
  const renderCheckoutBanner = () => {
    if (!checkoutStatus) return null;

    switch (checkoutStatus) {
      case "success":
        return (
          <div
            style={{
              padding: "16px",
              borderRadius: "8px",
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.2)",
              color: "var(--color-success)",
              marginBottom: "24px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <div>
              <strong style={{ display: "block" }}>Payment Successful!</strong>
              <span style={{ fontSize: "13px" }}>Plan activated immediately, invoice generated automatically.</span>
            </div>
          </div>
        );
      case "pending":
        return (
          <div
            style={{
              padding: "16px",
              borderRadius: "8px",
              backgroundColor: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.2)",
              color: "var(--color-warning)",
              marginBottom: "24px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <div>
              <strong style={{ display: "block" }}>Payment Pending...</strong>
              <span style={{ fontSize: "13px" }}>Subscription stays inactive until the gateway confirms. Use developer logs to simulate settlement.</span>
            </div>
          </div>
        );
      case "failed":
        return (
          <div
            style={{
              padding: "16px",
              borderRadius: "8px",
              backgroundColor: "rgba(244, 63, 94, 0.1)",
              border: "1px solid rgba(244, 63, 94, 0.2)",
              color: "var(--color-danger)",
              marginBottom: "24px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            <div>
              <strong style={{ display: "block" }}>Payment Failed</strong>
              <span style={{ fontSize: "13px" }}>User can retry; no subscription or invoice is created. Go to the pricing page to try again.</span>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="dashboard-full animate-fade-in">
      {renderCheckoutBanner()}

      {message && (
        <div
          style={{
            padding: "16px",
            borderRadius: "8px",
            backgroundColor: message.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(244, 63, 94, 0.1)",
            border: message.type === "success" ? "1px solid rgba(16, 185, 129, 0.2)" : "1px solid rgba(244, 63, 94, 0.2)",
            color: message.type === "success" ? "var(--color-success)" : "var(--color-danger)",
            marginBottom: "24px",
            fontSize: "14px",
          }}
        >
          {message.text}
        </div>
      )}

      {/* Main Billing Grid */}
      <div className="dashboard-grid" style={{ margin: "0 auto 40px auto" }}>
        
        {/* Subscription Plan Status Card */}
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
              <div>
                <h3 style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em", marginBottom: "4px" }}>
                  Current Subscription
                </h3>
                <h2 style={{ fontSize: "28px", fontWeight: "800", color: "var(--text-main)", textTransform: "capitalize" }}>
                  {currentPlan ? `${currentPlan.name} plan` : "No Active Plan"}
                </h2>
              </div>
              
              {subscription ? (
                subscription.status === "active" ? (
                  subscription.cancelAtPeriodEnd ? (
                    <span className="badge badge-warning">Cancelled</span>
                  ) : (
                    <span className="badge badge-success">Active</span>
                  )
                ) : (
                  <span className={`badge ${subscription.status === "expired" ? "badge-danger" : "badge-warning"}`}>
                    {subscription.status}
                  </span>
                )
              ) : (
                <span className="badge badge-danger">Unsubscribed</span>
              )}
            </div>

            {subscription ? (
              <div style={{ margin: "25px 0" }}>
                {subscription.status === "active" && (
                  <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "8px" }}>
                    {subscription.cancelAtPeriodEnd ? (
                      <>
                        Access expires on <strong>{new Date(subscription.currentPeriodEnd).toLocaleDateString()}</strong>. You will not be billed further.
                      </>
                    ) : (
                      <>
                        Renews on <strong>{new Date(subscription.currentPeriodEnd).toLocaleDateString()}</strong> for <strong>${subscription.price.toFixed(2)}/mo</strong>.
                      </>
                    )}
                  </p>
                )}
                {subscription.pendingDowngradePlanId && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "10px 14px",
                      borderRadius: "6px",
                      backgroundColor: "rgba(139, 92, 246, 0.08)",
                      border: "1px solid rgba(139, 92, 246, 0.15)",
                      fontSize: "13px",
                      color: "var(--color-primary)",
                    }}
                  >
                    Scheduled downgrade to <strong>{subscription.pendingDowngradePlanId}</strong> on next cycle end.
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: "25px 0" }}>
                You do not have an active billing subscription. Subscribe to unlock premium SaaS features.
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", borderTop: "1px solid var(--border-muted)", paddingTop: "20px" }}>
            {subscription && subscription.status === "active" ? (
              <>
                <button onClick={() => { setSelectedPlan(""); setActiveModal("upgrade"); }} className="btn btn-primary" disabled={loading}>
                  Upgrade
                </button>
                <button onClick={() => { setSelectedPlan(""); setActiveModal("downgrade"); }} className="btn btn-secondary" disabled={loading}>
                  Downgrade
                </button>
                {subscription.cancelAtPeriodEnd ? (
                  <button onClick={() => handleSubscriptionAction("reactivate")} className="btn btn-success" disabled={loading}>
                    Reactivate
                  </button>
                ) : (
                  <button onClick={() => setActiveModal("cancel")} className="btn btn-danger" disabled={loading}>
                    Cancel subscription
                  </button>
                )}
              </>
            ) : (
              <Link href="/" className="btn btn-success">
                View Pricing Plans
              </Link>
            )}
          </div>
        </div>

        {/* Profile Card & Info */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <h3 style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em", marginBottom: "15px" }}>
              Billing Account Information
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <span style={{ fontSize: "12px", color: "var(--text-dark)", display: "block" }}>ACCOUNT EMAIL</span>
                <span style={{ fontSize: "14px", fontWeight: "500" }}>{userEmail}</span>
              </div>
              <div>
                <span style={{ fontSize: "12px", color: "var(--text-dark)", display: "block" }}>ACCOUNT ID</span>
                <span style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--text-muted)" }}>{userId}</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Pending Action Simulators (Mock Gateway Settlement helper) */}
      {paymentAttempts.some((a) => a.status === "pending") && (
        <div className="card" style={{ marginBottom: "40px", border: "1px solid var(--color-warning)" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "700", color: "var(--color-warning)", marginBottom: "10px" }}>
            Simulate Webhook Settlement
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "20px" }}>
            The following payment attempts are marked as <strong>PENDING</strong> (Mock gateway did not settle immediately).
            You can manually trigger the payment success webhook to test how the system updates state when background gateway alerts are delayed.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {paymentAttempts
              .filter((a) => a.status === "pending")
              .map((attempt) => (
                <div
                  key={attempt.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    backgroundColor: "rgba(0, 0, 0, 0.2)",
                    border: "1px solid var(--border-muted)",
                    padding: "12px 18px",
                    borderRadius: "6px",
                  }}
                >
                  <div>
                    <span style={{ fontWeight: "600", textTransform: "uppercase", fontSize: "13px", marginRight: "10px" }}>
                      {attempt.planId} plan
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                      (${attempt.amount.toFixed(2)}) - {new Date(attempt.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <button
                    onClick={() => handleSimulateSettlement(attempt)}
                    className="btn btn-warning"
                    style={{ padding: "6px 14px", fontSize: "12px" }}
                    disabled={loading}
                  >
                    Simulate Gateway Settled
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Invoice Ledger Table */}
      <div className="card" style={{ marginBottom: "40px" }}>
        <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "20px" }}>Billing Invoice Ledger</h3>
        {invoices.length > 0 ? (
          <div className="table-container">
            <table className="table-custom">
              <thead>
                <tr>
                  <th>Billing Date</th>
                  <th>Invoice Number</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{new Date(invoice.billingDate).toLocaleDateString()}</td>
                    <td style={{ fontFamily: "monospace" }}>{invoice.invoiceNumber}</td>
                    <td>${invoice.amount.toFixed(2)}</td>
                    <td>
                      <span className="badge badge-success">{invoice.status}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <a
                        href={`/api/invoices/${invoice.id}/download`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary"
                        style={{ padding: "6px 12px", fontSize: "12px" }}
                      >
                        Download PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: "var(--text-muted)", fontSize: "14px", textAlign: "center", padding: "20px 0" }}>
            No billing history found. Subscribe to generate billing invoices.
          </p>
        )}
      </div>

      {/* Completed Payments Ledger Table */}
      <div className="card" style={{ marginBottom: "40px" }}>
        <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "20px" }}>Successful Transaction Payments</h3>
        {payments && payments.length > 0 ? (
          <div className="table-container">
            <table className="table-custom">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Payment ID</th>
                  <th>Amount</th>
                  <th>Gateway ID</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{new Date(payment.createdAt).toLocaleString()}</td>
                    <td style={{ fontFamily: "monospace", fontSize: "12px" }}>{payment.id}</td>
                    <td style={{ fontWeight: "600", color: "var(--color-success)" }}>${payment.amount.toFixed(2)}</td>
                    <td style={{ fontFamily: "monospace", fontSize: "12px" }}>{payment.providerPaymentId}</td>
                    <td>
                      <span className={`badge ${payment.status === "successful" ? "badge-success" : "badge-danger"}`}>
                        {payment.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: "var(--text-muted)", fontSize: "14px", textAlign: "center", padding: "20px 0" }}>
            No successful payments finalized yet. Complete checkout to settle payments.
          </p>
        )}
      </div>

      {/* Payment Attempts Ledger Table */}
      <div className="card">
        <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "20px" }}>Payment Attempt Logs</h3>
        {paymentAttempts.length > 0 ? (
          <div className="table-container">
            <table className="table-custom">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Attempt ID</th>
                  <th>Plan Tier</th>
                  <th>Amount</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {paymentAttempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <td>{new Date(attempt.createdAt).toLocaleString()}</td>
                    <td style={{ fontFamily: "monospace", fontSize: "12px" }}>{attempt.id}</td>
                    <td style={{ textTransform: "uppercase" }}>{attempt.planId}</td>
                    <td>${attempt.amount.toFixed(2)}</td>
                    <td>{getAttemptBadge(attempt.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: "var(--text-muted)", fontSize: "14px", textAlign: "center", padding: "20px 0" }}>
            No payment transaction logs available.
          </p>
        )}
      </div>

      {/* Upgrade Modal */}
      {activeModal === "upgrade" && subscription && (
        <div style={modalOverlayStyle}>
          <div className="card animate-fade-in" style={modalContentStyle}>
            <h3 style={{ fontSize: "20px", fontWeight: "800", marginBottom: "15px" }}>Upgrade Subscription</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "20px" }}>
              Select a higher subscription tier. Pro-rated value of your unused time will be applied as credit.
            </p>
            
            <div className="form-group">
              <label className="form-label">Available Upgrades</label>
              <select
                className="form-input"
                value={selectedPlan}
                onChange={(e) => setSelectedPlan(e.target.value)}
              >
                <option value="">Select a plan...</option>
                {PLANS.filter((p) => {
                  // Find index in plan constants
                  const currentIdx = PLANS.findIndex((pl) => pl.id === subscription.planId);
                  const planIdx = PLANS.findIndex((pl) => pl.id === p.id);
                  return planIdx > currentIdx;
                }).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} - ${p.price}/mo
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "30px" }}>
              <button onClick={() => setActiveModal(null)} className="btn btn-secondary" disabled={loading}>
                Cancel
              </button>
              <button
                onClick={() => handleSubscriptionAction("upgrade", selectedPlan)}
                className="btn btn-primary"
                disabled={loading || !selectedPlan}
              >
                Confirm Upgrade
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Downgrade Modal */}
      {activeModal === "downgrade" && subscription && (
        <div style={modalOverlayStyle}>
          <div className="card animate-fade-in" style={modalContentStyle}>
            <h3 style={{ fontSize: "20px", fontWeight: "800", marginBottom: "15px" }}>Downgrade Subscription</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "20px" }}>
              Select a lower tier. You will keep your current {currentPlan?.name} features and limits until the end of your billing cycle on <strong>{new Date(subscription.currentPeriodEnd).toLocaleDateString()}</strong>, when the downgrade will apply.
            </p>

            <div className="form-group">
              <label className="form-label">Available Downgrades</label>
              <select
                className="form-input"
                value={selectedPlan}
                onChange={(e) => setSelectedPlan(e.target.value)}
              >
                <option value="">Select a plan...</option>
                {PLANS.filter((p) => {
                  const currentIdx = PLANS.findIndex((pl) => pl.id === subscription.planId);
                  const planIdx = PLANS.findIndex((pl) => pl.id === p.id);
                  return planIdx < currentIdx;
                }).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} - ${p.price}/mo
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "30px" }}>
              <button onClick={() => setActiveModal(null)} className="btn btn-secondary" disabled={loading}>
                Cancel
              </button>
              <button
                onClick={() => handleSubscriptionAction("downgrade", selectedPlan)}
                className="btn btn-primary"
                disabled={loading || !selectedPlan}
              >
                Schedule Downgrade
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Confirmation Modal */}
      {activeModal === "cancel" && subscription && (
        <div style={modalOverlayStyle}>
          <div className="card animate-fade-in" style={modalContentStyle}>
            <h3 style={{ fontSize: "20px", fontWeight: "800", color: "var(--color-danger)", marginBottom: "15px" }}>
              Cancel Subscription?
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "20px" }}>
              Are you sure you want to cancel your {currentPlan?.name} plan? You will retain access until <strong>{new Date(subscription.currentPeriodEnd).toLocaleDateString()}</strong>, after which your account will return to unsubscribed status and you will not be billed again.
            </p>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "30px" }}>
              <button onClick={() => setActiveModal(null)} className="btn btn-secondary" disabled={loading}>
                Keep Plan
              </button>
              <button
                onClick={() => handleSubscriptionAction("cancel")}
                className="btn btn-danger"
                disabled={loading}
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verifying Payment Overlay */}
      {isVerifying && (
        <div style={verifyingOverlayStyle}>
          <div className="card text-center animate-fade-in" style={{ padding: "40px", maxWidth: "420px", width: "90%", border: "1px solid var(--border-active)", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
            <div style={{ margin: "0 auto 20px auto", width: "40px", height: "40px", borderRadius: "50%", border: "4px solid rgba(255,255,255,0.1)", borderTopColor: "var(--color-primary)", animation: "spin 1s linear infinite" }}></div>
            <h3 style={{ fontSize: "20px", fontWeight: "800", marginBottom: "10px" }}>Verifying Your Payment</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: "1.6" }}>
              We are connecting with the payment gateway to activate your subscription plan. This will complete in just a moment...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Styling configs for glassmorphic overlay
const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  backgroundColor: "rgba(0, 0, 0, 0.75)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalContentStyle: React.CSSProperties = {
  maxWidth: "460px",
  width: "90%",
  border: "1px solid var(--border-active)",
};

const verifyingOverlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  backgroundColor: "rgba(0, 0, 0, 0.85)",
  backdropFilter: "blur(6px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
};
