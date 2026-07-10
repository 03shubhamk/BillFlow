# BillFlow - Subscription Billing Platform

An end-to-end SaaS subscription billing platform covering plans, checkout flows (success, pending, failed), plan upgrades/downgrades, invoice generation, email notifications, and webhook processing with database-level idempotency and concurrent race-condition protection.

---

## Technical Stack & Highlights

*   **Frontend & Backend**: Next.js 15 (App Router), React 19, TypeScript.
*   **Database & ORM**: SQLite, Prisma ORM.
*   **Aesthetics**: Vanilla CSS (CSS Modules & global variables) with glassmorphic dark theme and glows.
*   **Authentication**: Custom JWT session cookies.
*   **Notifications**: Dual-mode email engine (SMTP fallback + DB Email Sandbox Visualizer).
*   **Idempotency**: Block double-processing of events using database constraints and transactions.
*   **Test Suite**: Interactive dashboard testing and CLI stress testing scripts.

---

## Getting Started

### 1. Installation
Clone the repository, navigate to the folder, and install package dependencies:
```bash
npm install
```

### 2. Environment Setup
Create a `.env` file in the root directory (already created automatically for you):
```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="super_secret_jwt_key_2026_billflow"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```
*(Optional SMTP or Stripe variables can be supplied; otherwise, the platform operates in simulated sandbox mode automatically.)*

### 3. Database Initialization
Synchronize your SQLite local database and generate the Prisma Client types:
```bash
npx prisma generate
npx prisma db push
```

### 4. Run Development Server
Start the development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Simulation & Testing Guide

### 1. Simulated Payment Checkout Gateway
*   Navigate to the home page, sign up for a new account.
*   Click **Select Plan** on a tier (e.g. Pro).
*   You will be redirected to the secure sandbox payment form. Select **Simulate Payment Success**, **Pending**, or **Failed**.
*   Watch your dashboard reflect the state machine badge (Active, Pending, or Expired) along with your auto-generated PDF printable invoice list.

### 2. Developer & Email Sandbox
*   Go to the **Dev Console** tab in the navbar.
*   **Email Sandbox**: Review all emails triggered by subscription checkouts, invoice creations, cancellations, and payment failures. Emails render inside an isolated sandboxed viewport, showing design styling, buttons, and totals.
*   **Wipe DB Records**: Quick button to wipe subscription ledgers to easily repeat testing flows.

### 3. Webhook Idempotency Integration Test
To run the concurrent request stress test and verify that race conditions cannot double-allocate subscriptions or invoices:

1. Ensure the Next.js server is active:
   ```bash
   npm run dev
   ```
2. In a separate terminal window, run the automated execution script:
   ```bash
   npx ts-node tests/idempotency.test.ts
   ```
3. The script seeds a clean user, signs a mock webhook payload with HMAC-SHA256, fires 5 requests concurrently in parallel, and prints the result ledger:
   *   Thread #1 returns **200 OK** (Successful invoice generation).
   *   Threads #2–5 return **409 Conflict** (Lock block) or **200 OK** (Idempotent bypass).
   *   The script queries the database to verify that exactly **1** subscription and **1** invoice are created.
