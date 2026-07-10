import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Clear transactional tables
    await prisma.$transaction([
      prisma.payment.deleteMany({}),
      prisma.invoice.deleteMany({}),
      prisma.subscription.deleteMany({}),
      prisma.paymentAttempt.deleteMany({}),
      prisma.emailLog.deleteMany({}),
      prisma.webhookEvent.deleteMany({}),
    ]);

    return NextResponse.json({
      success: true,
      message: "Database cleared successfully (kept users intact)",
    });
  } catch (error: any) {
    console.error("Clear DB error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}
