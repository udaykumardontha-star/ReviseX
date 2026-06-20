"use client";
import { useState, useCallback, useEffect } from "react";
import Link from "next/link";

type StagedQuestion = {
  id: number; status: "pending" | "approved" | "rejected";
  question: string; answer: string; explanation: string | null;
  difficulty: string; topic: string; category: string;
  parsedOptions: { A: string; B: string; C: string; D: string };
};
type Stats = { pending: number; approved: number; rejected: number; total: number };
type QueueData = { items: StagedQuestion[]; total: number; stats: Stats; page: number; pageSize: number };

export function ReviewPageClient({ jobId }: { jobId: number }) {
  const [data, setData] = useState<QueueData | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);

  const showToast = (msg: string, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/staging/${jobId}?page=${page}&pageSize=15${statusFilter !== "all" ? `&status=${statusFilter}` : ""}`);
    if (r.ok) setData(await r.json() as QueueData);
    setLoading(false);
  }, [jobId, page, statusFilter]);

  useEffect(() => { void fetchQueue(); }, [fetchQueue]);

  const approve = async (id: number) => {
    await fetch(`/api/staging/question/${id}`, { method: "POST" });
    void fetchQueue();
  };

  const reject = async (id: number) => {
    await fetch(`/api/staging/question/${id}?action=reject`, { method: "POST" });
    void fetchQueue();
  };

  const approveAll = async () => {
    await fetch(`/api/staging/${jobId}/approve-all`, { method: "POST" });
    showToast("All pending questions approved!");
    void fetchQueue();
  };

  const rejectAll = async () => {
    await fetch(`/api/staging/${jobId}/reject-all`, { method: "POST" });
    showToast("All pending questions rejected.", "error");
    void fetchQueue();
  };

  const promote = async () => {
    setPromoting(true);
    const r = await fetch(`/api/staging/${jobId}/promote`, { method: "POST" });
    const d = await r.json() as { promoted?: number; skipped?: number; topicsCreated?: number; error?: string };
    setPromoting(false);
    if (r.ok) {
      showToast(`✅ Promoted ${d.promoted} questions! ${d.topicsCreated} new topics created.`);
    } else {
      showToast(`❌ ${d.error}`, "error");
    }
    void fetchQueue();
  };

  const stats = data?.stats;
  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  const difficultyColor = (d: string) =>
    d === "easy" ? "badge-green" : d === "hard" ? "badge-red" : "badge-amber";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link href="/import" style={{ fontSize: 13, color: "var(--text-muted)" }}>← Import</Link>
            <span style={{ color: "var(--border)" }}>/</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Job #{jobId} Review</span>
          </div>
          <h1 className="page-title" style={{ marginTop: 6 }}>Review Questions 👁️</h1>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary btn-sm" onClick={approveAll} disabled={!stats?.pending}>
            ✅ Approve All ({stats?.pending ?? 0})
          </button>
          <button className="btn btn-danger btn-sm" onClick={rejectAll} disabled={!stats?.pending}>
            ❌ Reject All
          </button>
          <button className="btn btn-primary" onClick={promote} disabled={!stats?.approved || promoting}>
            {promoting ? <><div className="spinner" />Promoting…</> : `🚀 Promote ${stats?.approved ?? 0} to Bank`}
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { label: "Total", value: stats.total, color: "var(--text-primary)" },
            { label: "Pending", value: stats.pending, color: "var(--warning)" },
            { label: "Approved", value: stats.approved, color: "var(--success)" },
            { label: "Rejected", value: stats.rejected, color: "var(--danger)" },
          ].map((s) => (
            <div key={s.label} className="card" style={{ flex: "1 1 100px", padding: "12px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="filters-bar">
        {["pending", "approved", "rejected", "all"].map((f) => (
          <button
            key={f}
            className={`filter-chip ${statusFilter === f ? "active" : ""}`}
            onClick={() => { setStatusFilter(f); setPage(1); }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Questions */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1,2,3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 180 }} />
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎉</div>
          <div className="empty-title">No {statusFilter} questions</div>
          <div className="empty-desc">
            {statusFilter === "pending" ? "All questions have been reviewed!" : "Nothing here yet."}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {data?.items.map((q) => (
            <div key={q.id} className={`review-card ${q.status}`}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div className="question-text">{q.question}</div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <span className={`badge ${difficultyColor(q.difficulty)}`}>{q.difficulty}</span>
                  <span className="badge badge-gray">{q.category}</span>
                </div>
              </div>

              <div className="options-grid">
                {(["A", "B", "C", "D"] as const).map((opt) => (
                  <div key={opt} className={`option ${q.answer === opt ? "correct" : ""}`}>
                    <span className="option-label">{opt}.</span>
                    <span>{q.parsedOptions[opt]}</span>
                  </div>
                ))}
              </div>

              {q.explanation && (
                <div style={{ padding: "10px 12px", background: "var(--primary-light)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "#1a5c2e", borderLeft: "3px solid var(--primary)" }}>
                  💡 {q.explanation}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>📌 {q.topic}</div>
                {q.status === "pending" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-sm btn-danger" onClick={() => reject(q.id)}>✕ Reject</button>
                    <button className="btn btn-sm btn-primary" onClick={() => approve(q.id)}>✓ Approve</button>
                  </div>
                )}
                {q.status === "approved" && <span className="badge badge-green">✓ Approved</span>}
                {q.status === "rejected" && <span className="badge badge-red">✕ Rejected</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            ← Prev
          </button>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Page {page} / {totalPages}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            Next →
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  );
}
