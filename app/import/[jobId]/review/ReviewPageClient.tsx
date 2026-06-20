"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";

type StagedQuestion = {
  id: number; status: "pending" | "approved" | "rejected";
  question: string; answer: string; explanation: string | null;
  difficulty: string; topic: string; category: string;
  examName: string | null;
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
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  // Prevent double-fetch when filter/page change triggers re-render from data setState
  const fetchingRef = useRef(false);

  const showToast = (msg: string, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchQueue = useCallback(async (silent = false) => {
    if (fetchingRef.current && !silent) return;
    fetchingRef.current = true;
    if (!silent) setLoading(true);
    try {
      const r = await fetch(
        `/api/staging/${jobId}?page=${page}&pageSize=20${statusFilter !== "all" ? `&status=${statusFilter}` : ""}`
      );
      if (r.ok) setData(await r.json() as QueueData);
    } catch { /* ignore */ }
    finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [jobId, page, statusFilter]);

  // Fetch on mount and when filter/page changes — stable dependency array prevents loops
  useEffect(() => { void fetchQueue(); }, [fetchQueue]);

  // ── Approve a single question (optimistic update) ────────────────────────
  const approve = async (id: number) => {
    // Optimistic: flip status in local state immediately
    setData((prev) => {
      if (!prev) return prev;
      const items = prev.items.map((q) =>
        q.id === id ? { ...q, status: "approved" as const } : q
      );
      const stats = {
        ...prev.stats,
        pending: Math.max(0, prev.stats.pending - 1),
        approved: prev.stats.approved + 1,
      };
      return { ...prev, items, stats };
    });

    setActionLoading((p) => ({ ...p, [id]: true }));
    try {
      // No ?action param → defaults to "approve"
      const r = await fetch(`/api/staging/question/${id}`, { method: "POST" });
      if (!r.ok) {
        showToast("Failed to approve question", "error");
        void fetchQueue(); // revert optimistic if server failed
      }
    } catch {
      showToast("Network error", "error");
      void fetchQueue();
    } finally {
      setActionLoading((p) => ({ ...p, [id]: false }));
    }
  };

  // ── Reject a single question (optimistic update) ─────────────────────────
  const reject = async (id: number) => {
    setData((prev) => {
      if (!prev) return prev;
      const items = prev.items.map((q) =>
        q.id === id ? { ...q, status: "rejected" as const } : q
      );
      const stats = {
        ...prev.stats,
        pending: Math.max(0, prev.stats.pending - 1),
        rejected: prev.stats.rejected + 1,
      };
      return { ...prev, items, stats };
    });

    setActionLoading((p) => ({ ...p, [id]: true }));
    try {
      const r = await fetch(`/api/staging/question/${id}?action=reject`, { method: "POST" });
      if (!r.ok) {
        showToast("Failed to reject question", "error");
        void fetchQueue();
      }
    } catch {
      showToast("Network error", "error");
      void fetchQueue();
    } finally {
      setActionLoading((p) => ({ ...p, [id]: false }));
    }
  };

  const approveAll = async () => {
    const r = await fetch(`/api/staging/${jobId}/approve-all`, { method: "POST" });
    if (r.ok) {
      showToast(`✅ All pending questions approved!`);
      void fetchQueue();
    } else {
      showToast("Failed to approve all", "error");
    }
  };

  const rejectAll = async () => {
    await fetch(`/api/staging/${jobId}/reject-all`, { method: "POST" });
    showToast("All pending questions rejected.", "error");
    void fetchQueue();
  };

  const promote = async () => {
    setPromoting(true);
    try {
      const r = await fetch(`/api/staging/${jobId}/promote`, { method: "POST" });
      if (!r.ok) {
        let errorMsg = "Promote failed";
        try {
          const errData = await r.json();
          errorMsg = errData.error || errorMsg;
        } catch {
          errorMsg = `Server error: ${r.status}`;
        }
        showToast(`❌ ${errorMsg}`, "error");
        setPromoting(false);
        return;
      }
      
      const d = await r.json() as { promoted?: number; skipped?: number; topicsCreated?: number };
      showToast(`✅ Promoted ${d.promoted ?? 0} questions! ${d.topicsCreated ?? 0} new topics.`);
      void fetchQueue();
    } catch (e) {
      showToast(`❌ Network error or server crash`, "error");
    } finally {
      setPromoting(false);
    }
  };

  const stats = data?.stats;
  const totalPages = data ? Math.ceil(data.total / (data.pageSize || 20)) : 1;

  const difficultyColor = (d: string) =>
    d === "easy" ? "badge-green" : d === "hard" ? "badge-red" : "badge-amber";

  // Items to render — if pending filter, also show newly approved/rejected items in session
  const items = data?.items ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link href="/import" style={{ fontSize: 13, color: "var(--primary)", fontWeight: 600 }}>← Import</Link>
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
        {loading && <div className="spinner" style={{ marginLeft: "auto" }} />}
      </div>

      {/* Questions */}
      {loading && items.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 180 }} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">{statusFilter === "pending" ? "🎉" : "📭"}</div>
          <div className="empty-title">
            {statusFilter === "pending" ? "All questions reviewed!" : `No ${statusFilter} questions`}
          </div>
          <div className="empty-desc">
            {statusFilter === "pending"
              ? stats?.approved
                ? `${stats.approved} approved — click "Promote to Bank" to add them to your question bank.`
                : "Switch to All tab to see all questions."
              : "Nothing here yet."}
          </div>
          {statusFilter === "pending" && !!stats?.approved && (
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={promote} disabled={promoting}>
              {promoting ? "Promoting…" : `🚀 Promote ${stats.approved} to Bank`}
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {items.map((q) => (
            <div key={q.id} className={`review-card ${q.status}`}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div className="question-text">{q.question}</div>
                  {q.examName && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontWeight: 500 }}>
                      🏷️ {q.examName}
                    </div>
                  )}
                </div>
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
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => reject(q.id)}
                      disabled={!!actionLoading[q.id]}
                    >
                      {actionLoading[q.id] ? <div className="spinner" /> : "✕ Reject"}
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => approve(q.id)}
                      disabled={!!actionLoading[q.id]}
                    >
                      {actionLoading[q.id] ? <div className="spinner" /> : "✓ Approve"}
                    </button>
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
