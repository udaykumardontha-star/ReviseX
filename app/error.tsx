"use client";
import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[NeomX Error]", error);
  }, [error]);

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "60vh", gap: 16, textAlign: "center",
      padding: 32,
    }}>
      <div style={{ fontSize: 64 }}>⚠️</div>
      <h2 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>Something went wrong</h2>
      <p style={{ fontSize: 14, color: "var(--text-muted)", maxWidth: 380, margin: 0, lineHeight: 1.6 }}>
        {error.message ?? "An unexpected error occurred. Please try again."}
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button className="btn btn-primary" onClick={reset}>↺ Try Again</button>
        <Link href="/" className="btn btn-secondary">Go Home</Link>
      </div>
      {error.digest && (
        <code style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
          Error ID: {error.digest}
        </code>
      )}
    </div>
  );
}

