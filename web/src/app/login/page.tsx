"use client";

import { useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/common/auth/auth-context";

const inputStyle = {
  width: "100%",
  padding: 8,
  fontSize: 14,
  border: "1px solid #e2e5e9",
  borderRadius: 6,
  background: "#fff",
} as const;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
      router.push("/");
    } catch {
      setError("Invalid email or passwor");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: 24,
        fontFamily: "system-ui",
      }}
    >
      <h1>Sign in</h1>

      <form
        onSubmit={handleSubmit}
        style={{ maxWidth: 360, display: "grid", gap: 12 }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={inputStyle}
          />
        </div>

        {error && (
          <p role="alert" style={{ margin: 0, fontSize: 14, color: "#b3261e" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            padding: "10px 16px",
            fontSize: 14,
            border: "none",
            borderRadius: 6,
            background: "#0e6b65",
            color: "#fff",
            cursor: isSubmitting ? "default" : "pointer",
            opacity: isSubmitting ? 0.7 : 1,
            justifySelf: "start",
          }}
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
