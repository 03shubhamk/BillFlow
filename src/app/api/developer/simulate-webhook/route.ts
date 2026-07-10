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

    const { type, userId, planId, amount, attemptId } = await request.json();

    if (!type || !userId || !planId || amount === undefined || !attemptId) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const eventId = `mock_evt_${Math.random().toString(36).substring(2, 15)}`;

    // Create webhook payload matching our processor schema
    const payload = {
      id: eventId,
      type,
      data: {
        id: `mock_py_${Math.random().toString(36).substring(2, 10)}`,
        userId,
        planId,
        amount,
        attemptId,
        providerPaymentId: `mock_py_${Math.random().toString(36).substring(2, 10)}`,
      },
    };

    const rawBody = JSON.stringify(payload);

    // Compute HMAC signature
    const signature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(rawBody)
      .digest("hex");

    // Fire webhook asynchronously so checkout flow returns immediately
    // (Mimicking a real gateway background webhook behavior)
    fetch(`${appUrl}/api/webhooks/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mock-signature": signature,
      },
      body: rawBody,
    }).catch((err) => {
      console.error("Async webhook simulation dispatch failed:", err);
    });

    return NextResponse.json({
      success: true,
      message: "Webhook event dispatched successfully in the background",
      eventId,
    });
  } catch (error: any) {
    console.error("Simulate webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}
