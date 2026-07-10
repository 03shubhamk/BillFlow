import { prisma } from "./db";

interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  type: "subscription_confirmed" | "invoice_generated" | "payment_failed" | "cancellation_confirmed";
}

export async function sendEmail({ to, subject, body, type }: SendEmailParams) {
  try {
    let finalBody = body;

    // 1. Check if SMTP environment variables are set for real SMTP
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
    
    if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
      try {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.default.createTransport({
          host: SMTP_HOST,
          port: parseInt(SMTP_PORT),
          auth: {
            user: SMTP_USER,
            pass: SMTP_PASS,
          },
        });

        await transporter.sendMail({
          from: SMTP_FROM || "noreply@billflow.com",
          to,
          subject,
          html: body,
        });
        console.log(`Real email sent to ${to} via SMTP for event ${type}`);
      } catch (err) {
        console.error("SMTP delivery error:", err);
      }
    } else {
      // 2. No SMTP config in env: Fallback to Ethereal Email (Auto-creating a real test mailbox)
      try {
        const nodemailer = await import("nodemailer");
        const globalAny = global as any;

        if (!globalAny.etherealAccount) {
          console.log("Generating Ethereal SMTP test account...");
          globalAny.etherealAccount = await nodemailer.default.createTestAccount();
        }

        const testAccount = globalAny.etherealAccount;
        const transporter = nodemailer.default.createTransport({
          host: "smtp.ethereal.email",
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });

        const info = await transporter.sendMail({
          from: '"BillFlow Simulator" <noreply@billflow.com>',
          to,
          subject,
          html: body,
        });

        const previewUrl = nodemailer.default.getTestMessageUrl(info);
        console.log(`[Ethereal Email] Simulated email delivered!`);
        console.log(`[Ethereal Email] Click to preview: ${previewUrl}`);

        if (previewUrl) {
          // Prepend a nice visual banner at the top of the logged body in the sandbox database,
          // so the developer can click it from the Email Sandbox UI directly!
          finalBody = `
            <div style="background-color: #2563eb; color: white; padding: 14px; text-align: center; font-family: sans-serif; font-size: 13px; font-weight: bold; margin-bottom: 20px; border-radius: 6px; box-shadow: 0 4px 6px rgba(37,99,235,0.2);">
              📬 Ethereal Delivery Simulator: This email was actually sent! 
              <a href="${previewUrl}" target="_blank" style="color: white; text-decoration: underline; margin-left: 8px; font-weight: 800;">Open Real Email Web Viewer</a>
            </div>
            ${body}
          `;
        }
      } catch (etherealErr) {
        console.log("Ethereal SMTP dynamic creation failed, falling back to local visual log only:", etherealErr);
      }
    }

    // 3. Always log to the database for the Email Sandbox UI
    await prisma.emailLog.create({
      data: {
        to,
        subject,
        body: finalBody,
        type,
      },
    });
  } catch (error) {
    console.error("Failed to send/log email:", error);
  }
}

// Helper functions to generate beautiful email templates
export function getSubscriptionConfirmedTemplate(email: string, planName: string, renewalDate: string, price: number) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #333; background-color: #0f0f12; color: #f3f4f6; border-radius: 8px;">
      <h2 style="color: #10b981; border-bottom: 1px solid #333; padding-bottom: 10px;">Subscription Confirmed!</h2>
      <p>Hello,</p>
      <p>Thank you for subscribing! Your account (<strong>${email}</strong>) has been successfully upgraded.</p>
      <div style="background-color: #1e1e24; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Plan:</strong> ${planName}</p>
        <p style="margin: 5px 0;"><strong>Price:</strong> $${price.toFixed(2)}/mo</p>
        <p style="margin: 5px 0;"><strong>Renewal Date:</strong> ${renewalDate}</p>
      </div>
      <p>You can manage your subscription, access invoices, or change plans at any time from your dashboard.</p>
      <p style="margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center; border-top: 1px solid #333; padding-top: 10px;">
        © 2026 BillFlow. All rights reserved.
      </p>
    </div>
  `;
}

export function getInvoiceGeneratedTemplate(email: string, invoiceNumber: string, amount: number, billingDate: string, downloadLink: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #333; background-color: #0f0f12; color: #f3f4f6; border-radius: 8px;">
      <h2 style="color: #10b981; border-bottom: 1px solid #333; padding-bottom: 10px;">Invoice Paid - ${invoiceNumber}</h2>
      <p>Hello,</p>
      <p>A new invoice has been generated and paid successfully for your subscription.</p>
      <div style="background-color: #1e1e24; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Invoice ID:</strong> ${invoiceNumber}</p>
        <p style="margin: 5px 0;"><strong>Amount Paid:</strong> $${amount.toFixed(2)}</p>
        <p style="margin: 5px 0;"><strong>Billing Date:</strong> ${billingDate}</p>
      </div>
      <p style="margin: 25px 0; text-align: center;">
        <a href="${downloadLink}" style="background-color: #10b981; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Download PDF Invoice</a>
      </p>
      <p>You can also download this invoice directly from your billing history in the dashboard.</p>
      <p style="margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center; border-top: 1px solid #333; padding-top: 10px;">
        © 2026 BillFlow. All rights reserved.
      </p>
    </div>
  `;
}

export function getPaymentFailedTemplate(email: string, planName: string, amount: number, retryLink: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #333; background-color: #0f0f12; color: #f3f4f6; border-radius: 8px;">
      <h2 style="color: #ef4444; border-bottom: 1px solid #333; padding-bottom: 10px;">Payment Action Required</h2>
      <p>Hello,</p>
      <p>We were unable to process your payment of <strong>$${amount.toFixed(2)}</strong> for the <strong>${planName}</strong> plan.</p>
      <p>Your subscription is currently inactive. Please update your payment details or retry the checkout process to maintain access to your account features.</p>
      <p style="margin: 25px 0; text-align: center;">
        <a href="${retryLink}" style="background-color: #ef4444; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Retry Payment</a>
      </p>
      <p>If you have any questions, please reach out to our support team.</p>
      <p style="margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center; border-top: 1px solid #333; padding-top: 10px;">
        © 2026 BillFlow. All rights reserved.
      </p>
    </div>
  `;
}

export function getCancellationConfirmedTemplate(email: string, planName: string, accessEndDate: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #333; background-color: #0f0f12; color: #f3f4f6; border-radius: 8px;">
      <h2 style="color: #f59e0b; border-bottom: 1px solid #333; padding-bottom: 10px;">Cancellation Confirmed</h2>
      <p>Hello,</p>
      <p>Your subscription to the <strong>${planName}</strong> plan has been cancelled as requested.</p>
      <p>You will continue to have full access to your subscription features until the end of your billing cycle on <strong>${accessEndDate}</strong>. After this date, your plan will downgrade, and you will no longer be billed.</p>
      <p>If this was a mistake, you can reactivate your subscription at any time from your billing dashboard.</p>
      <p style="margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center; border-top: 1px solid #333; padding-top: 10px;">
        © 2026 BillFlow. All rights reserved.
      </p>
    </div>
  `;
}
