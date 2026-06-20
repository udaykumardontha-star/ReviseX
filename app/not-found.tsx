import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "60vh", gap: 16, textAlign: "center",
      padding: 32,
    }}>
      <div style={{ fontSize: 72 }}>🔍</div>
      <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0 }}>Page Not Found</h1>
      <p style={{ fontSize: 15, color: "var(--text-muted)", maxWidth: 360, margin: 0 }}>
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <Link href="/" className="btn btn-primary">Go to Dashboard</Link>
        <Link href="/topics" className="btn btn-secondary">Browse Topics</Link>
      </div>
    </div>
  );
}
