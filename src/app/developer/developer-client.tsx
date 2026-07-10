"use client";

import { useState, useEffect } from "react";

interface WebhookLog {
  id: string;
  status: string;
  error: string | null;
  processedAt: string;
}

interface EmailLog {
  id: string;
  to: string;
  subject: string;
  body: string;
  type: string;
  createdAt: string;
}

interface PaymentAttempt {
  id: string;
  planId: string;
  amount: number;
  status: string;
  createdAt: string;
}

interface TestResult {
  requestIndex: number;
  status: number;
  statusText: string;
  durationMs: number;
  data: any;
  error?: string;
}

export default function DeveloperClient() {
  const [activeTab, setActiveTab] = useState<"webhooks" | "emails" | "idempotency">("webhooks");
  const [webhookEvents, setWebhookEvents] = useState<WebhookLog[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [paymentAttempts, setPaymentAttempts] = useState<PaymentAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoPoll, setAutoPoll] = useState(true);

  // Detail panel states
  const [selectedWebhook, setSelectedWebhook] = useState<any | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<EmailLog | null>(null);

  // Idempotency simulation states
  const [selectedPlan, setSelectedPlan] = useState("pro");
  const [testingIdempotency, setTestingIdempotency] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [testEventId, setTestEventId] = useState("");

  const fetchLogs = async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch("/api/developer/logs");
      const data = await res.json();
      if (res.ok && data.success) {
        setWebhookEvents(data.webhookEvents);
        setEmailLogs(data.emailLogs);
        setPaymentAttempts(data.paymentAttempts);
      }
    } catch (err) {
      console.error("Failed to fetch dev logs:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    if (!autoPoll) return;
    const interval = setInterval(() => {
      fetchLogs(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [autoPoll]);

  const handleClearDb = async () => {
    if (!confirm("Are you sure you want to clear subscriptions, invoices, attempts, emails, and webhooks? Users will be kept.")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/developer/clear-db", { method: "POST" });
      if (res.ok) {
        setSelectedEmail(null);
        setSelectedWebhook(null);
        setTestResults([]);
        await fetchLogs();
        alert("Database transaction tables cleared successfully.");
      } else {
        alert("Failed to clear database.");
      }
    } catch (err) {
      alert("Error resetting database.");
    } finally {
      setLoading(false);
    }
  };

  const handleRunIdempotencyTest = async () => {
    setTestingIdempotency(true);
    setTestResults([]);
    setTestEventId("");

    try {
      const res = await fetch("/api/developer/idempotency-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selectedPlan }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setTestResults(data.results);
        setTestEventId(data.eventId);
        // Refresh logs immediately
        fetchLogs(true);
      } else {
        alert(data.error || "Idempotency test execution failed");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred during idempotency test.");
    } finally {
      setTestingIdempotency(false);
    }
  };

  const handleSelectWebhookRow = async (log: WebhookLog) => {
    // WebhookEvent table doesn't save raw payload in schema, so let's mock or generate a readable representation
    // Or we can query detail. Since we just check status and details, we show details
    setSelectedWebhook(log);
  };

  return (
    <div className="dashboard-full animate-fade-in" style={{ paddingBottom: "80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px", flexWrap: "wrap", gap: "15px" }}>
        <div>
          <h1 style={{ fontSize: "32px", fontWeight: "800", letterSpacing: "-0.03em" }}>Developer Telemetry Console</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
            Inspect webhook ledgers, view mock email templates, and trigger parallel idempotency tests.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-muted)", cursor: "pointer" }}>
            <input type="checkbox" checked={autoPoll} onChange={(e) => setAutoPoll(e.target.checked)} />
            Auto-poll (3s)
          </label>
          <button onClick={() => fetchLogs()} className="btn btn-secondary" style={{ padding: "8px 16px", fontSize: "13px" }} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button onClick={handleClearDb} className="btn btn-danger" style={{ padding: "8px 16px", fontSize: "13px" }}>
            Wipe DB Records
          </button>
        </div>
      </div>

      {/* Tabs Header */}
      <div className="tabs-header">
        <button
          onClick={() => setActiveTab("webhooks")}
          className={`tab-btn ${activeTab === "webhooks" ? "active" : ""}`}
        >
          Webhook Ledger ({webhookEvents.length})
        </button>
        <button
          onClick={() => setActiveTab("emails")}
          className={`tab-btn ${activeTab === "emails" ? "active" : ""}`}
        >
          Email Sandbox ({emailLogs.length})
        </button>
        <button
          onClick={() => setActiveTab("idempotency")}
          className={`tab-btn ${activeTab === "idempotency" ? "active" : ""}`}
        >
          Idempotency Simulator
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px" }}>Loading logs...</div>
      ) : (
        <>
          {/* TAB 1: WEBHOOK LEDGER */}
          {activeTab === "webhooks" && (
            <div style={{ display: "grid", gridTemplateColumns: selectedWebhook ? "1.2fr 1fr" : "1fr", gap: "25px" }}>
              <div className="card" style={{ padding: "20px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "15px" }}>Registered Webhook Events</h3>
                {webhookEvents.length > 0 ? (
                  <div className="table-container">
                    <table className="table-custom">
                      <thead>
                        <tr>
                          <th>Processed At</th>
                          <th>Event ID</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {webhookEvents.map((log) => (
                          <tr
                            key={log.id}
                            onClick={() => handleSelectWebhookRow(log)}
                            style={{
                              cursor: "pointer",
                              backgroundColor: selectedWebhook?.id === log.id ? "rgba(255, 255, 255, 0.05)" : "transparent"
                            }}
                          >
                            <td style={{ fontSize: "13px" }}>{new Date(log.processedAt).toLocaleString()}</td>
                            <td style={{ fontFamily: "monospace", fontSize: "12px" }}>{log.id}</td>
                            <td>
                              <span
                                className={`badge ${
                                  log.status === "processed"
                                    ? "badge-success"
                                    : log.status === "processing"
                                    ? "badge-warning"
                                    : "badge-danger"
                                }`}
                              >
                                {log.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ color: "var(--text-muted)", fontSize: "13px", padding: "20px 0", textAlign: "center" }}>
                    No webhook events processed. Complete a simulated checkout or trigger concurrent tests.
                  </p>
                )}
              </div>

              {selectedWebhook && (
                <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", border: "1px solid var(--border-active)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: "700" }}>Webhook Details</h3>
                    <button onClick={() => setSelectedWebhook(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "18px" }}>×</button>
                  </div>
                  
                  <div style={{ fontSize: "13px", display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
                    <div>
                      <span style={{ color: "var(--text-dark)", fontSize: "11px", display: "block" }}>EVENT ID</span>
                      <strong style={{ fontFamily: "monospace" }}>{selectedWebhook.id}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-dark)", fontSize: "11px", display: "block" }}>STATUS</span>
                      <span
                        className={`badge ${
                          selectedWebhook.status === "processed"
                            ? "badge-success"
                            : selectedWebhook.status === "processing"
                            ? "badge-warning"
                            : "badge-danger"
                        }`}
                      >
                        {selectedWebhook.status}
                      </span>
                    </div>
                    {selectedWebhook.error && (
                      <div>
                        <span style={{ color: "var(--color-danger)", fontSize: "11px", display: "block" }}>PROCESSING ERROR</span>
                        <code style={{ color: "var(--color-danger)", fontSize: "12px", display: "block", backgroundColor: "rgba(244, 63, 94, 0.08)", padding: "8px", borderRadius: "4px", marginTop: "4px" }}>
                          {selectedWebhook.error}
                        </code>
                      </div>
                    )}
                    <div>
                      <span style={{ color: "var(--text-dark)", fontSize: "11px", display: "block" }}>TIMESTAMP</span>
                      <span>{new Date(selectedWebhook.processedAt).toLocaleString()}</span>
                    </div>
                  </div>

                  <span style={{ color: "var(--text-dark)", fontSize: "11px", display: "block", marginBottom: "6px" }}>SIMULATED WEBHOOK EXPLANATION</span>
                  <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                    {selectedWebhook.status === "processed"
                      ? "This event ID was successfully logged and committed to the database. Subsequent posts of this same event ID will be skipped instantly via database unique keys to satisfy idempotency."
                      : selectedWebhook.status === "processing"
                      ? "A transaction is currently processing this event. Concurrent requests will receive a 409 conflict to prevent race conditions."
                      : "The webhook processor encountered an error. The event status is rolled back, allowing retry attempts."}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: EMAIL SANDBOX */}
          {activeTab === "emails" && (
            <div style={{ display: "grid", gridTemplateColumns: selectedEmail ? "1fr 1.1fr" : "1fr", gap: "25px" }}>
              <div className="card" style={{ padding: "20px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "15px" }}>Sent Email Notifications</h3>
                {emailLogs.length > 0 ? (
                  <div className="table-container">
                    <table className="table-custom">
                      <thead>
                        <tr>
                          <th>Recipient</th>
                          <th>Subject</th>
                          <th>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {emailLogs.map((log) => (
                          <tr
                            key={log.id}
                            onClick={() => setSelectedEmail(log)}
                            style={{
                              cursor: "pointer",
                              backgroundColor: selectedEmail?.id === log.id ? "rgba(255, 255, 255, 0.05)" : "transparent"
                            }}
                          >
                            <td style={{ fontSize: "13px" }}>{log.to}</td>
                            <td style={{ fontSize: "13px", fontWeight: "500" }}>{log.subject}</td>
                            <td>
                              <span
                                className={`badge ${
                                  log.type === "subscription_confirmed"
                                    ? "badge-success"
                                    : log.type === "invoice_generated"
                                    ? "badge-primary"
                                    : log.type === "payment_failed"
                                    ? "badge-danger"
                                    : "badge-warning"
                                }`}
                                style={{ fontSize: "10px" }}
                              >
                                {log.type.replace("_", " ")}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ color: "var(--text-muted)", fontSize: "13px", padding: "20px 0", textAlign: "center" }}>
                    No email notification logs found. Try subscribing, upgrading, or cancelling a plan to trigger notifications.
                  </p>
                )}
              </div>

              {selectedEmail && (
                <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", border: "1px solid var(--border-active)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: "700" }}>Email Preview</h3>
                    <button onClick={() => setSelectedEmail(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "18px" }}>×</button>
                  </div>
                  
                  <div style={{ fontSize: "13px", backgroundColor: "rgba(0, 0, 0, 0.2)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border-muted)", marginBottom: "20px" }}>
                    <p style={{ margin: "2px 0" }}><strong>To:</strong> {selectedEmail.to}</p>
                    <p style={{ margin: "2px 0" }}><strong>Subject:</strong> {selectedEmail.subject}</p>
                    <p style={{ margin: "2px 0" }}><strong>Timestamp:</strong> {new Date(selectedEmail.createdAt).toLocaleString()}</p>
                  </div>

                  <span style={{ color: "var(--text-dark)", fontSize: "11px", display: "block", marginBottom: "8px" }}>RENDER PREVIEW</span>
                  <div style={{ flex: 1, border: "1px solid var(--border-muted)", borderRadius: "6px", overflow: "hidden", minHeight: "350px", backgroundColor: "#ffffff" }}>
                    <iframe
                      srcDoc={selectedEmail.body}
                      style={{ width: "100%", height: "100%", border: "none", minHeight: "350px" }}
                      title="Email Render Preview"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: IDEMPOTENCY SIMULATOR */}
          {activeTab === "idempotency" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
              <div className="card" style={{ maxWidth: "800px" }}>
                <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "12px" }}>Concurrent Webhook Stress Simulator</h3>
                <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "25px" }}>
                  This tool launches <strong>5 parallel requests</strong> of the exact same payment success webhook concurrently to the webhook handler. 
                  This triggers database-level lock states and unique constraint tests. Only 1 request should create invoices and subscriptions, while the other 4 are blocked, returning status <strong>409 Conflict</strong> or skipped with <strong>200 OK</strong> if they hit after processing completed.
                </p>

                <div style={{ display: "flex", gap: "15px", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "30px" }}>
                  <div className="form-group" style={{ margin: 0, minWidth: "200px" }}>
                    <label className="form-label">Simulation Plan Tier</label>
                    <select
                      className="form-input"
                      value={selectedPlan}
                      onChange={(e) => setSelectedPlan(e.target.value)}
                    >
                      <option value="basic">Basic ($9.00)</option>
                      <option value="pro">Pro ($29.00)</option>
                      <option value="enterprise">Enterprise ($99.00)</option>
                    </select>
                  </div>

                  <button
                    onClick={handleRunIdempotencyTest}
                    className="btn btn-primary"
                    style={{ padding: "12px 24px" }}
                    disabled={testingIdempotency}
                  >
                    {testingIdempotency ? "Firing Threads..." : "Fire Concurrent Webhooks"}
                  </button>
                </div>

                {testEventId && (
                  <div style={{ marginBottom: "20px", fontSize: "13px" }}>
                    Simulated Event ID: <code style={{ backgroundColor: "rgba(255, 255, 255, 0.08)", padding: "4px 8px", borderRadius: "4px", fontFamily: "monospace" }}>{testEventId}</code>
                  </div>
                )}

                {testResults.length > 0 && (
                  <div className="table-container">
                    <table className="table-custom">
                      <thead>
                        <tr>
                          <th>Worker Thread</th>
                          <th>HTTP Status</th>
                          <th>Status Text</th>
                          <th>Roundtrip time</th>
                          <th>Outcome Log</th>
                        </tr>
                      </thead>
                      <tbody>
                        {testResults.map((result) => {
                          const isSuccess = result.status === 200;
                          const isConflict = result.status === 409;
                          const msg = result.data?.message || result.data?.error || result.error || "";

                          return (
                            <tr key={result.requestIndex}>
                              <td>Thread #{result.requestIndex}</td>
                              <td>
                                <span
                                  className={`badge ${
                                    isSuccess
                                      ? "badge-success"
                                      : isConflict
                                      ? "badge-warning"
                                      : "badge-danger"
                                  }`}
                                >
                                  {result.status}
                                </span>
                              </td>
                              <td style={{ fontWeight: "500" }}>{result.statusText}</td>
                              <td>{result.durationMs}ms</td>
                              <td style={{ fontSize: "12px", color: isSuccess ? "var(--color-success)" : isConflict ? "var(--color-warning)" : "var(--color-danger)" }}>
                                {msg}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
