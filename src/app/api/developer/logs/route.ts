import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [webhookEvents, emailLogs, paymentAttempts, payments] = await Promise.all([
      prisma.webhookEvent.findMany({
        where: {
          OR: [
            { userId: user.id },
            { userId: null },
          ],
        },
        orderBy: { processedAt: "desc" },
        take: 50,
      }),
      prisma.emailLog.findMany({
        where: { to: user.email },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.paymentAttempt.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.payment.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    return NextResponse.json({
      success: true,
      webhookEvents,
      emailLogs,
      paymentAttempts,
      payments,
    });
  } catch (error: any) {
    console.error("Developer logs error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}
