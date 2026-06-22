"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Topic = {
  id: number; slug: string; name: string; category: string;
  totalQuestions: number; topicStatus: string;
  totalNotes: number;
};
type ListData = { items: Topic[]; total: number; page: number; pageSize: number };

const SUBJECTS = ["All", "General Knowledge", "English"];
const GK_CATEGORIES = ["All", "Geography", "History", "Polity", "Economy", "Science", "Static G.K.", "Current Affairs", "Miscellaneous"];
const ENGLISH_CHAPTERS = ["All", "Spot the Error", "Sentence Improvement", "Narration", "Active passive", "Para jumble", "Fill in the blanks", "Cloze Test", "Comprehension", "One Word Substitution", "Idioms", "Synonyms", "Antonyms", "Spelling check", "Homonyms", "Miscellaneous"];

const STATUSES = [
  { value: "", label: "All Status" },
  { value: "generated", label: "✅ Has Note" },
  { value: "not_generated", label: "⏳ No Note" },
  { value: "needs_refresh", label: "🔄 Needs Refresh" },
];
const CATEGORY_COLORS: Record<string, string> = {
  Geography: "badge-blue", History: "badge-amber", Polity: "badge-purple",
  Economy: "badge-green", Science: "badge-red", "Static G.K.": "badge-purple",
  "Current Affairs": "badge-blue", English: "badge-teal", Miscellaneous: "badge-gray",
};

type Props = { initialData?: ListData | null };

export function TopicsPageClient({ initialData }: Props) {
  const [data, setData] = useState<ListData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [loadError, setLoadError] = useState("");
  const [subject, setSubject] = useState("All");
  const [section, setSection] = useState("All");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 24;
  const [isInitialMount, setIsInitialMount] = useState(true);

  const fetchTopics = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    
    if (subject === "General Knowledge") {
      params.set("subject", "GK");
      if (section !== "All") params.set("category", section);
    } else if (subject === "English") {
      params.set("subject", "English");
      if (section !== "All") params.set("category", section);
    }

    if (status) params.set("status", status);
    if (q.trim()) params.set("q", q.trim());

    try {
      const r = await fetch(`/api/topics?${params.toString()}`, { cache: "no-store" });
      if (!r.ok) throw new Error("Topics request failed");
      setData(await r.json() as ListData);
    } catch {
      setLoadError("Could not load topics. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  }, [subject, section, status, q, page]);

  useEffect(() => {
    if (isInitialMount && initialData) {
      setIsInitialMount(false);
      return;
    }
    void fetchTopics();
  }, [fetchTopics]);

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
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div className="input-group" style={{ maxWidth: 300, flex: 1, minWidth: 200 }}>
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
          <select
            className="input select"
            style={{ width: "auto", paddingTop: 7, paddingBottom: 7 }}
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {SUBJECTS.map((s) => (
              <button
                key={s}
                className={`filter-chip ${subject === s ? "active" : ""}`}
                onClick={() => { setSubject(s); setSection("All"); setPage(1); }}
              >{s === "General Knowledge" ? "🌍 GK" : s === "English" ? "📖 English" : "All Folders"}</button>
            ))}
          </div>
          
          {subject === "General Knowledge" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", paddingLeft: 12, borderLeft: "2px solid var(--border)", marginLeft: 4 }}>
              {GK_CATEGORIES.map((c) => (
                <button
                  key={c}
                  className={`filter-chip ${section === c ? "active" : ""}`}
                  style={{ fontSize: 13, padding: "4px 10px" }}
                  onClick={() => { setSection(c); setPage(1); }}
                >{c}</button>
              ))}
            </div>
          )}

          {subject === "English" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", paddingLeft: 12, borderLeft: "2px solid var(--border)", marginLeft: 4 }}>
              {ENGLISH_CHAPTERS.map((c) => (
                <button
                  key={c}
                  className={`filter-chip ${section === c ? "active" : ""}`}
                  style={{ fontSize: 13, padding: "4px 10px" }}
                  onClick={() => { setSection(c); setPage(1); }}
                >{c}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="topics-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 130 }} />
          ))}
        </div>
      ) : loadError ? (
        <div className="empty-state">
          <div className="empty-title">Topics unavailable</div>
          <div className="empty-desc">{loadError}</div>
          <button className="btn btn-secondary btn-sm" onClick={() => void fetchTopics()}>Retry</button>
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
                <span className="topic-stat" style={{ marginLeft: "auto" }}>
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
