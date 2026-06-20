"use client";
export default function OfflinePage() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #f0fdf4 0%, #e8f5e9 100%)",
      gap: 20, padding: 32, textAlign: "center",
      fontFamily: "'Inter', system-ui, sans-serif"
    }}>
      <div style={{ fontSize: 72 }}>📡</div>
      <h1 style={{ fontSize: 28, fontWeight: 900, color: "#1a1a1a", margin: 0 }}>
        You&apos;re Offline
      </h1>
      <p style={{ fontSize: 16, color: "#555", maxWidth: 360, margin: 0, lineHeight: 1.6 }}>
        ReviseX needs an internet connection to load new content.
        Check your connection and try again.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 8, padding: "12px 28px", background: "#34C759", color: "white",
          border: "none", borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: "pointer",
        }}
      >
        ↺ Try Again
      </button>
      <p style={{ fontSize: 12, color: "#999", marginTop: 8 }}>
        Previously visited pages may still be available in your browser cache.
      </p>
    </div>
  );
}
