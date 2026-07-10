import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_2026_billflow";

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId } = await request.json();
    if (!planId) {
      return NextResponse.json({ error: "Plan ID is required" }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const eventId = `mock_evt_test_${Math.random().toString(36).substring(2, 15)}`;

    // Create payload
    const payload = {
      id: eventId,
      type: "payment.succeeded",
      data: {
        userId: user.id,
        planId,
        amount: planId === "pro" ? 29.00 : planId === "enterprise" ? 99.00 : 9.00,
        providerPaymentId: `mock_ch_test_${Math.random().toString(36).substring(2, 10)}`,
      },
    };

    const rawBody = JSON.stringify(payload);

    // Compute HMAC signature
    const signature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(rawBody)
      .digest("hex");

    // Fire 5 requests concurrently using Promise.all
    const promises = Array.from({ length: 5 }).map(async (_, index) => {
      const startTime = Date.now();
      try {
        const response = await fetch(`${appUrl}/api/webhooks/payments`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-mock-signature": signature,
          },
          body: rawBody,
          cache: "no-store",
        });
        
        const data = await response.json().catch(() => ({}));
        return {
          requestIndex: index + 1,
          status: response.status,
          statusText: response.statusText,
          durationMs: Date.now() - startTime,
          data,
        };
      } catch (err: any) {
        return {
          requestIndex: index + 1,
          status: 500,
          statusText: "Fetch Error",
          durationMs: Date.now() - startTime,
          error: err.message,
        };
      }
    });

    const results = await Promise.all(promises);

    return NextResponse.json({
      success: true,
      eventId,
      results,
    });
  } catch (error: any) {
    console.error("Idempotency test execution error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}
