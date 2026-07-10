import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "BillFlow - SaaS Subscription Billing Platform",
  description: "End-to-end subscription lifecycle, invoices, and webhook idempotency simulation.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser();
  const userEmail = user ? user.email : null;

  return (
    <html lang="en">
      <body>
        <Navbar userEmail={userEmail} />
        <main>{children}</main>
      </body>
    </html>
  );
}
