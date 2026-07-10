"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";

interface NavbarProps {
  userEmail: string | null;
}

export default function Navbar({ userEmail }: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (res.ok) {
        window.location.href = "/login";
      } else {
        alert("Logout failed. Please try again.");
      }
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <nav className="navbar" id="main-nav">
      <Link href="/" className="nav-logo">
        BillFlow<span>.</span>
      </Link>

      <div className="nav-links">
        <Link href="/" className={`nav-link ${pathname === "/" ? "active" : ""}`}>
          Pricing
        </Link>
        
        {userEmail && (
          <>
            <Link
              href="/dashboard"
              className={`nav-link ${pathname === "/dashboard" ? "active" : ""}`}
            >
              Dashboard
            </Link>
            <Link
              href="/developer"
              className={`nav-link ${pathname === "/developer" ? "active" : ""}`}
            >
              Dev Console
            </Link>
          </>
        )}

        <div style={{ display: "flex", gap: "12px", alignItems: "center", marginLeft: "10px" }}>
          {userEmail ? (
            <>
              <span style={{ fontSize: "13px", color: "var(--text-muted)", marginRight: "4px" }}>
                {userEmail}
              </span>
              <button
                onClick={handleLogout}
                className="btn btn-secondary"
                style={{ padding: "6px 14px", fontSize: "13px" }}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? "Signing out..." : "Sign Out"}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: "13px" }}>
                Sign In
              </Link>
              <Link href="/register" className="btn btn-primary" style={{ padding: "6px 14px", fontSize: "13px" }}>
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
