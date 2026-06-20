"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Topic = {
  id: number; slug: string; name: string; category: string;
  totalQuestions: number; topicStatus: string; hasNote: boolean;
  totalNotes: number;
};
type ListData = { items: Topic[]; total: number; page: number; pageSize: number };

const CATEGORIES = ["All", "Geography", "History", "Polity", "Economy", "Science", "Environment", "Art & Culture", "Current Affairs", "Miscellaneous"];
const STATUSES = [
  { value: "", label: "All Status" },
  { value: "generated", label: "✅ Has Note" },
  { value: "not_generated", label: "⏳ No Note" },
  { value: "needs_refresh", label: "🔄 Needs Refresh" },
];
const CATEGORY_COLORS: Record<string, string> = {
  Geography: "badge-blue", History: "badge-amber", Polity: "badge-purple",
  Economy: "badge-green", Science: "badge-red", Environment: "badge-green",
  "Art & Culture": "badge-purple", "Current Affairs": "badge-blue", Miscellaneous: "badge-gray",
};

export function TopicsPageClient() {
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 24;

  const fetchTopics = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (category !== "All") params.set("category", category);
    if (status) params.set("status", status);
    if (q.trim()) params.set("q", q.trim());

    const r = await fetch(`/api/topics?${params.toString()}`);
    if (r.ok) setData(await r.json() as ListData);
    setLoading(false);
  }, [category, status, q, page]);

  useEffect(() => { void fetchTopics(); }, [fetchTopics]);

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Topics 🗂️</h1>
          <p className="page-subtitle">{data?.total ?? "…"} topics across all SSC categories</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="input-group" style={{ maxWidth: 400 }}>
          <span className="input-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <input
            className="input"
            placeholder="Search topics…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              className={`filter-chip ${category === c ? "active" : ""}`}
              onClick={() => { setCategory(c); setPage(1); }}
            >{c}</button>
          ))}
          <div style={{ marginLeft: 8 }}>
            <select
              className="input select"
              style={{ width: "auto", paddingTop: 7, paddingBottom: 7 }}
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            >
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="topics-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 130 }} />
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <div className="empty-title">No topics found</div>
          <div className="empty-desc">Try changing your filters or import a PDF to generate topics.</div>
        </div>
      ) : (
        <div className="topics-grid">
          {data?.items.map((topic) => (
            <Link key={topic.id} href={`/topics/${topic.slug}`} className="topic-card">
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div className="topic-card-name">{topic.name}</div>
                <span style={{ fontSize: 18 }}>{topic.topicStatus === "generated" ? "📝" : topic.topicStatus === "needs_refresh" ? "🔄" : "⏳"}</span>
              </div>
              <div className="topic-meta">
                <span className={`badge ${CATEGORY_COLORS[topic.category] ?? "badge-gray"}`}>{topic.category}</span>
                <span className="topic-stat">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" /></svg>
                  {topic.totalQuestions} Qs
                </span>
                {topic.topicStatus === "generated" && (
                  <span className="topic-stat">📖 Has Note</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Page {page} / {totalPages}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button>
        </div>
      )}
    </div>
  );
}
