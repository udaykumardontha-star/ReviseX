"use client";
import { useState } from "react";

export default function SettingsPage() {
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildResult, setRebuildResult] = useState<string>("");

  const rebuildIndex = async () => {
    setRebuilding(true);
    setRebuildResult("");
    try {
      const r = await fetch("/api/admin/rebuild-index", { method: "POST" });
      const d = await r.json() as { ok?: boolean; results?: Array<{ table: string; rowsIndexed: number; durationMs: number }>; error?: string };
      if (r.ok && d.results) {
        setRebuildResult(
          "✅ Rebuilt: " +
          d.results.map((x) => `${x.table} (${x.rowsIndexed} rows, ${x.durationMs}ms)`).join(" · ")
        );
      } else {
        setRebuildResult("❌ " + (d.error ?? "Unknown error"));
      }
    } catch {
      setRebuildResult("❌ Network error");
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 720 }}>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Settings ⚙️</h1>
          <p className="page-subtitle">System configuration and admin tools for ReviseX.</p>
        </div>
      </div>

      {/* Search Index */}
      <div className="card">
        <div className="card-header">
          <span className="section-title">🔍 Search Index</span>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>
          ReviseX uses SQLite FTS5 for fast full-text search. The index stays in sync automatically
          via database triggers, but you can force a full rebuild if search results seem stale.
        </p>
        <button className="btn btn-secondary" onClick={rebuildIndex} disabled={rebuilding}>
          {rebuilding ? <><div className="spinner" /> Rebuilding…</> : "♻️ Rebuild All FTS5 Indexes"}
        </button>
        {rebuildResult && (
          <div style={{
            marginTop: 12, padding: "10px 14px",
            background: rebuildResult.startsWith("✅") ? "#f0fdf4" : "#fff5f5",
            border: `1px solid ${rebuildResult.startsWith("✅") ? "var(--success)" : "var(--danger)"}`,
            borderRadius: "var(--radius-sm)", fontSize: 13
          }}>
            {rebuildResult}
          </div>
        )}
      </div>

      {/* Database info */}
      <div className="card">
        <div className="card-header">
          <span className="section-title">🗄️ Database</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "Database Engine", value: "SQLite 3 (better-sqlite3)" },
            { label: "ORM", value: "Drizzle ORM 0.36" },
            { label: "Full-Text Search", value: "FTS5 with BM25 ranking" },
            { label: "Triggers", value: "18 auto-sync triggers (INSERT, UPDATE, DELETE)" },
            { label: "Schema", value: "14 tables across sources, topics, questions, notes, sessions" },
          ].map((row) => (
            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
              <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>{row.label}</span>
              <span style={{ fontWeight: 600 }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI Settings */}
      <div className="card">
        <div className="card-header">
          <span className="section-title">🤖 AI Configuration</span>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>
          AI calls are rate-limited to protect your Gemini API quota. Configure your key in{" "}
          <code style={{ background: "var(--surface-2)", padding: "1px 6px", borderRadius: 4 }}>.env.local</code>.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "Model", value: process.env["GOOGLE_GENERATIVE_AI_MODEL"] ?? "gemini-1.5-flash" },
            { label: "Daily Rate Limit", value: "50 AI calls / day (configurable in system_settings)" },
            { label: "Per-Chunk Limit", value: "50 questions / PDF chunk" },
            { label: "PDF Chunk Size", value: "10 pages / chunk" },
          ].map((row) => (
            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
              <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>{row.label}</span>
              <span style={{ fontWeight: 600 }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Golden Rule reminder */}
      <div style={{
        background: "linear-gradient(135deg, #f0fdf4, #d4f5dd)",
        border: "1px solid #b2e8c3",
        borderRadius: "var(--radius-md)",
        padding: "18px 20px",
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1a5c2e", marginBottom: 8 }}>
          ⚖️ Golden Rule
        </div>
        <div style={{ fontSize: 13, color: "#3a7d4e", lineHeight: 1.7 }}>
          <strong>Database First → Search First → Revision First → AI Last</strong><br/>
          ReviseX never calls Gemini when equivalent data already exists locally.
          Notes are cached after first generation and served instantly on subsequent visits.
        </div>
      </div>
    </div>
  );
}
