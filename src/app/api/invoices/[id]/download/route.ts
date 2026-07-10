import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_2026_billflow";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const sig = searchParams.get("sig");

    // Find invoice by ID or Invoice Number
    const invoice = await prisma.invoice.findFirst({
      where: {
        OR: [
          { id },
          { invoiceNumber: id },
        ],
      },
      include: {
        subscription: true,
        user: true,
      },
    });

    if (!invoice) {
      return new NextResponse("Invoice not found", { status: 404 });
    }

    let isAuthorized = false;

    // Validate URL signature first (bypass login check)
    if (sig) {
      const expectedSig = crypto
        .createHmac("sha256", JWT_SECRET)
        .update(invoice.invoiceNumber)
        .digest("hex");
        
      isAuthorized = sig === expectedSig;
    }

    // Fallback to cookie session check if signature is invalid/absent
    if (!isAuthorized) {
      const user = await getSessionUser();
      if (!user || user.id !== invoice.userId) {
        return new NextResponse("Unauthorized", { status: 401 });
      }
    }

    // Render a premium printable invoice HTML page
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice ${invoice.invoiceNumber}</title>
        <style>
          body {
            font-family: 'Inter', Arial, sans-serif;
            background-color: #ffffff;
            color: #1f2937;
            margin: 0;
            padding: 40px;
            font-size: 14px;
            line-height: 1.5;
          }
          .invoice-box {
            max-width: 800px;
            margin: auto;
            border: 1px solid #e5e7eb;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #f3f4f6;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 24px;
            font-weight: 800;
            color: #10b981;
            letter-spacing: -0.025em;
          }
          .title {
            text-align: right;
          }
          .title h1 {
            margin: 0;
            font-size: 28px;
            color: #111827;
            font-weight: 700;
          }
          .details {
            display: flex;
            justify-content: space-between;
            margin-bottom: 40px;
          }
          .details div {
            flex: 1;
          }
          .details h3 {
            margin: 0 0 8px 0;
            color: #374151;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .details p {
            margin: 0 0 4px 0;
            color: #4b5563;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
            margin-bottom: 40px;
          }
          th {
            background-color: #f9fafb;
            border-bottom: 2px solid #e5e7eb;
            color: #374151;
            font-weight: 600;
            padding: 12px;
          }
          td {
            border-bottom: 1px solid #e5e7eb;
            padding: 12px;
            color: #4b5563;
          }
          .totals {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 40px;
          }
          .totals table {
            width: 250px;
            margin: 0;
          }
          .totals td {
            border: none;
            padding: 6px 12px;
          }
          .totals tr.grand-total td {
            font-weight: 700;
            font-size: 16px;
            color: #111827;
            border-top: 1px solid #e5e7eb;
            padding-top: 12px;
          }
          .footer {
            text-align: center;
            border-top: 1px solid #f3f4f6;
            padding-top: 20px;
            color: #9ca3af;
            font-size: 12px;
          }
          .print-btn {
            display: block;
            width: fit-content;
            margin: 20px auto 0 auto;
            background-color: #10b981;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
          }
          @media print {
            .print-btn {
              display: none;
            }
            body {
              padding: 0;
            }
            .invoice-box {
              border: none;
              box-shadow: none;
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="invoice-box">
          <div class="header">
            <div class="logo">BillFlow</div>
            <div class="title">
              <h1>INVOICE</h1>
              <p style="margin: 4px 0 0 0; color: #6b7280;"># ${invoice.invoiceNumber}</p>
            </div>
          </div>

          <div class="details">
            <div>
              <h3>Billed To:</h3>
              <p><strong>${invoice.user.email}</strong></p>
              <p>Customer ID: ${invoice.userId}</p>
            </div>
            <div>
              <h3>Billed By:</h3>
              <p><strong>BillFlow Inc.</strong></p>
              <p>100 Pine Street, Suite 1200</p>
              <p>San Francisco, CA 94111</p>
            </div>
            <div style="text-align: right;">
              <h3>Invoice Date:</h3>
              <p>${invoice.billingDate.toLocaleDateString()}</p>
              <h3>Payment Status:</h3>
              <p style="color: #10b981; font-weight: 600;">PAID</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Subscription Plan: <strong style="text-transform: uppercase;">${invoice.subscription.planId}</strong> (Monthly Access)</td>
                <td style="text-align: right;">$${invoice.amount.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <div class="totals">
            <table>
              <tr>
                <td>Subtotal</td>
                <td style="text-align: right;">$${invoice.amount.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Tax (0%)</td>
                <td style="text-align: right;">$0.00</td>
              </tr>
              <tr class="grand-total">
                <td>Total Paid</td>
                <td style="text-align: right;">$${invoice.amount.toFixed(2)}</td>
              </tr>
            </table>
          </div>

          <div class="footer">
            <p>Thank you for your business! If you have any questions, please contact support@billflow.com.</p>
          </div>
        </div>

        <button onclick="window.print()" class="print-btn">Print Invoice</button>
      </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html",
      },
    });
  } catch (error) {
    console.error("Invoice download error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
