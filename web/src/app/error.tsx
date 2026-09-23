"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1>Something went wrong</h1>
      <p style={{ color: "#666" }}>
        We couldn&apos;t load this page. This is usually temporary.
      </p>

      {error.digest && (
        <p style={{ color: '#999', fontSize: 13 }}>
          Reference: <code>{error.digest}</code>
        </p>
      )}

      <button
        type="button"
        onClick={reset}
        style={{
          marginTop: 12,
          padding: "10px 16px",
          fontSize: 14,
          border: "none",
          borderRadius: 6,
          background: "#0e6b65",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </main>
  );
}
