import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_2026_billflow";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

async function runTest() {
  console.log("--------------------------------------------------");
  console.log("STARTING CONCURRENT WEBHOOK IDEMPOTENCY INTEGRATION TEST");
  console.log("--------------------------------------------------");

  // 1. Seed or retrieve a test user
  console.log("1. Seeding test user in database...");
  const user = await prisma.user.upsert({
    where: { email: "test_idempotency@example.com" },
    update: {},
    create: {
      email: "test_idempotency@example.com",
      passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz1234567890", // placeholder
    },
  });
  console.log(`   User seeded. ID: ${user.id}`);

  // Clean existing transactions for this user to start clean
  await prisma.payment.deleteMany({ where: { userId: user.id } });
  await prisma.invoice.deleteMany({ where: { userId: user.id } });
  await prisma.subscription.deleteMany({ where: { userId: user.id } });
  await prisma.paymentAttempt.deleteMany({ where: { userId: user.id } });

  // 2. Build the concurrent webhook payload
  const eventId = `cli_evt_test_${Math.random().toString(36).substring(2, 12)}`;
  const payload = {
    id: eventId,
    type: "payment.succeeded",
    data: {
      id: `cli_ch_test_${Math.random().toString(36).substring(2, 10)}`,
      userId: user.id,
      planId: "pro",
      amount: 29.00,
      providerPaymentId: `cli_ch_test_${Math.random().toString(36).substring(2, 10)}`,
    },
  };

  const rawBody = JSON.stringify(payload);

  // Sign the mock payload using HMAC-SHA256
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(rawBody)
    .digest("hex");

  console.log(`2. Generated Event ID: ${eventId}`);
  console.log(`   HMAC Signature: ${signature}`);

  // 3. Fire 5 concurrent requests in parallel
  console.log("3. Firing 5 webhook requests in parallel to local server...");
  console.log(`   Target URL: ${APP_URL}/api/webhooks/payments`);

  const startTime = Date.now();
  const promises = Array.from({ length: 5 }).map(async (_, idx) => {
    try {
      const response = await fetch(`${APP_URL}/api/webhooks/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mock-signature": signature,
        },
        body: rawBody,
      });

      const bodyText = await response.text();
      let resJson: any = {};
      try {
        resJson = JSON.parse(bodyText);
      } catch (e) {
        resJson = { text: bodyText };
      }

      return {
        thread: idx + 1,
        status: response.status,
        statusText: response.statusText,
        data: resJson,
      };
    } catch (err: any) {
      return {
        thread: idx + 1,
        status: 500,
        statusText: "Fetch Failed",
        data: { error: err.message },
      };
    }
  });

  const results = await Promise.all(promises);
  const duration = Date.now() - startTime;
  console.log(`   All requests completed in ${duration}ms.\n`);

  // 4. Output results table
  console.log("RESULTS:");
  console.table(
    results.map((r) => ({
      "Thread #": `Thread #${r.thread}`,
      "HTTP Status": r.status,
      "Status Name": r.statusText,
      "Response Body": JSON.stringify(r.data),
    }))
  );

  // 5. Query DB to assert correctness
  console.log("\n4. Querying database records to verify idempotency constraint...");
  const subscription = await prisma.subscription.findUnique({
    where: { userId: user.id },
  });

  const invoices = await prisma.invoice.findMany({
    where: { userId: user.id },
  });

  console.log(`   Subscriptions found: ${subscription ? 1 : 0} (Status: ${subscription?.status || "N/A"})`);
  console.log(`   Invoices generated: ${invoices.length}`);

  // Assertions
  let assertionsPassed = true;

  if (invoices.length !== 1) {
    console.error("❌ ASSERTION FAILED: Exactly 1 invoice should be created, found: " + invoices.length);
    assertionsPassed = false;
  } else {
    console.log("✔ ASSERTION PASSED: Exactly 1 invoice was created.");
  }

  const successResponses = results.filter((r) => r.status === 200);
  const conflictResponses = results.filter((r) => r.status === 409);

  console.log(`   HTTP 200 Success responses: ${successResponses.length}`);
  console.log(`   HTTP 409 Conflict responses: ${conflictResponses.length}`);

  if (successResponses.length < 1) {
    console.error("❌ ASSERTION FAILED: At least 1 thread must complete successfully (200 OK).");
    assertionsPassed = false;
  } else {
    console.log("✔ ASSERTION PASSED: Successful execution logged.");
  }

  // A webhook request might resolve and get 200 OK (idempotent skip) if it hits after another thread finished,
  // or 409 Conflict if they overlap during execution. Both protect integrity.
  const totalSafeResponses = successResponses.length + conflictResponses.length;
  if (totalSafeResponses !== 5) {
    console.warn("⚠ WARNING: Some requests returned codes other than 200 or 409 (e.g. 500 server errors). Check log.");
    assertionsPassed = false;
  } else {
    console.log("✔ ASSERTION PASSED: All requests returned safe idempotency responses (200 OK or 409 Conflict).");
  }

  console.log("--------------------------------------------------");
  if (assertionsPassed) {
    console.log("🎉 TEST PASSED SUCCESSFULLY: Webhook Idempotency verified!");
    process.exit(0);
  } else {
    console.log("❌ TEST FAILED: Verification check failure.");
    process.exit(1);
  }
}

runTest().catch((err) => {
  console.error("Test execution aborted due to error:", err);
  process.exit(1);
});
