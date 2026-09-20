"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "../auth/auth-context";

export function SiteHeader() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push("/");
    router.refresh();
  }

  return (
    <header
      style={{
        borderBottom: "1px solid #e2e5e9",
        background: "#fff",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          fontSize: 14,
        }}
      >
        <Link href="/" style={{ fontWeight: 600, color: "inherit" }}>
          Doorman
        </Link>

        {isLoading ? null : user ? (
          <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "#666" }}>{user.name}</span>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                border: "1px solid #e2e5e9",
                borderRadius: 6,
                background: "#fff",
                padding: "6px 12px",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </span>
        ) : (
          <Link href="/login">Sign in</Link>
        )}
      </div>
    </header>
  );
}
