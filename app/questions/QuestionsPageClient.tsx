"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Question = {
  id: number; question: string; category: string; difficulty: string;
  optionA: string; optionB: string; optionC: string; optionD: string;
  correctOption: string; shortExplanation: string | null;
  topicName?: string; topicSlug?: string;
  examName?: string | null;
  isBookmarked?: boolean; timesRevised: number; timesViewed: number;
};
type ListData = { items: Question[]; total: number; page: number; pageSize: number };

const SUBJECTS = ["All", "General Knowledge", "English"];
const GK_CATEGORIES = ["All", "Geography", "History", "Polity", "Economy", "Science", "Static G.K.", "Current Affairs", "Miscellaneous"];
const ENGLISH_CHAPTERS = ["All", "Spot the Error", "Sentence Improvement", "Narration", "Active passive", "Para jumble", "Fill in the blanks", "Cloze Test", "Comprehension", "One Word Substitution", "Idioms", "Synonyms", "Antonyms", "Spelling check", "Homonyms", "Miscellaneous"];

const DIFFICULTIES = ["All", "easy", "medium", "hard"];
const CATEGORY_COLORS: Record<string, string> = {
  Geography: "badge-blue", History: "badge-amber", Polity: "badge-purple",
  Economy: "badge-green", Science: "badge-red", "Static G.K.": "badge-purple",
  "Current Affairs": "badge-blue", English: "badge-teal", Miscellaneous: "badge-gray",
};
const DIFF_COLOR: Record<string, string> = { easy: "badge-green", medium: "badge-amber", hard: "badge-red" };

const listCache = new Map<string, ListData>();

export function QuestionsPageClient({ initialQ = "" }: { initialQ?: string }) {
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("All");
  const [section, setSection] = useState("All");
  const [difficulty, setDifficulty] = useState("All");
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [q, setQ] = useState(initialQ);
  const [page, setPage] = useState(1);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [bookmarks, setBookmarks] = useState<Record<number, boolean>>({});
  const pageSize = 20;

  const fetchQuestions = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (q.trim().length >= 2) params.set("q", q.trim());
    
    if (subject === "General Knowledge") {
      params.set("subject", "GK");
      if (section !== "All") params.set("category", section);
    } else if (subject === "English") {
      params.set("subject", "English");
      if (section !== "All") params.set("chapter", section);
    }

    if (difficulty !== "All") params.set("difficulty", difficulty);
    if (bookmarkedOnly) params.set("bookmarked", "true");

    const cacheKey = params.toString();
    
    // Serve from cache immediately to prevent UI flash
    if (listCache.has(cacheKey)) {
      setData(listCache.get(cacheKey)!);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const r = await fetch(`/api/questions?${cacheKey}`);
    if (r.ok) {
      const d = await r.json() as ListData;
      listCache.set(cacheKey, d);
      setData(d);
      // Sync bookmark state
      const bm: Record<number, boolean> = {};
      for (const item of d.items ?? []) { bm[item.id] = item.isBookmarked ?? false; }
      setBookmarks((prev) => ({ ...prev, ...bm }));
    }
    setLoading(false);
  }, [q, subject, section, difficulty, bookmarkedOnly, page]);

  useEffect(() => { void fetchQuestions(); }, [fetchQuestions]);

  const toggleBookmark = async (id: number) => {
    const r = await fetch(`/api/questions/${id}/bookmark`, { method: "POST" });
    if (r.ok) {
      const d = await r.json() as { bookmarked: boolean };
      setBookmarks((prev) => ({ ...prev, [id]: d.bookmarked }));
    }
  };

  const reveal = (id: number) => setRevealed((prev) => ({ ...prev, [id]: true }));
  const totalPages = data ? Math.ceil(data.total / pageSize) : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Question Bank ❓</h1>
          <p className="page-subtitle">{data?.total ?? "…"} questions across all topics</p>
        </div>
      </div>

      {/* Search */}
      <div className="input-group" style={{ maxWidth: 500 }}>
        <span className="input-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </span>
        <input className="input" placeholder="Search questions by keyword…"
          value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SUBJECTS.map((s) => (
              <button key={s} className={`filter-chip ${subject === s ? "active" : ""}`}
                onClick={() => { setSubject(s); setSection("All"); setPage(1); }}>
                {s === "General Knowledge" ? "🌍 GK" : s === "English" ? "📖 English" : "All Folders"}
              </button>
            ))}
          </div>
          
          <div style={{ width: 1, height: 24, background: "var(--border)", margin: "0 4px" }} />

          <div style={{ display: "flex", gap: 6 }}>
            {DIFFICULTIES.map((d) => (
              <button key={d} className={`filter-chip ${difficulty === d ? "active" : ""}`}
                onClick={() => { setDifficulty(d); setPage(1); }}
                style={{ textTransform: "capitalize" }}>{d}</button>
            ))}
          </div>
          <button
            className={`filter-chip ${bookmarkedOnly ? "active" : ""}`}
            onClick={() => { setBookmarkedOnly((b) => !b); setPage(1); }}>
            🔖 Bookmarks only
          </button>
        </div>

        {subject === "General Knowledge" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", paddingLeft: 12, borderLeft: "2px solid var(--border)", marginLeft: 4 }}>
            {GK_CATEGORIES.map((c) => (
              <button key={c} className={`filter-chip filter-chip-sm ${section === c ? "active" : ""}`}
                onClick={() => { setSection(c); setPage(1); }}>{c}</button>
            ))}
          </div>
        )}

        {subject === "English" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", paddingLeft: 12, borderLeft: "2px solid var(--border)", marginLeft: 4 }}>
            {ENGLISH_CHAPTERS.map((c) => (
              <button key={c} className={`filter-chip filter-chip-sm ${section === c ? "active" : ""}`}
                onClick={() => { setSection(c); setPage(1); }}>{c}</button>
            ))}
          </div>
        )}
      </div>

      {/* Questions */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 180 }} />)}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <div className="empty-title">No questions found</div>
          <div className="empty-desc">Try different filters or import a PDF to build your question bank.</div>
          <Link href="/import" className="btn btn-primary">Import PDF →</Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {data.items.map((q) => {
            const isRevealed = !!revealed[q.id];
            const isBookmarked = !!bookmarks[q.id];
            return (
              <div key={q.id} className="question-card">
                <div className="question-card-header">
                  <div className="question-text-main">{q.question}</div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <span className={`badge ${DIFF_COLOR[q.difficulty] ?? "badge-gray"}`}>{q.difficulty}</span>
                    <span className={`badge ${CATEGORY_COLORS[q.category] ?? "badge-gray"}`}>{q.category}</span>
                    {q.examName && <span className="badge badge-purple" style={{ fontWeight: 600 }}>🏛️ {q.examName}</span>}
                    <button
                      className="btn btn-ghost btn-icon"
                      title={isBookmarked ? "Remove bookmark" : "Bookmark"}
                      onClick={() => toggleBookmark(q.id)}
                      style={{ color: isBookmarked ? "#f90" : "var(--text-muted)", fontSize: 16, padding: "4px 6px" }}>
                      {isBookmarked ? "🔖" : "🏷️"}
                    </button>
                  </div>
                </div>

                <div className="question-options">
                  {(["A", "B", "C", "D"] as const).map((opt) => {
                    const text = ({ A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD })[opt];
                    const isCorrect = isRevealed && q.correctOption === opt;
                    return (
                      <div key={opt}
                        className={`q-option ${isCorrect ? "correct-reveal" : ""}`}
                        onClick={() => !isRevealed && reveal(q.id)}>
                        <span className="q-option-label">{opt}.</span>
                        <span>{text}</span>
                        {isCorrect && <span style={{ marginLeft: "auto", fontSize: 14 }}>✓</span>}
                      </div>
                    );
                  })}
                </div>

                {isRevealed && q.shortExplanation && (
                  <div style={{ padding: "10px 14px", background: "var(--primary-light)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "#1a5c2e", borderLeft: "3px solid var(--primary)" }}>
                    💡 {q.shortExplanation}
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                  <div style={{ display: "flex", gap: 12 }}>
                    {q.topicSlug && (
                      <Link href={`/topics/${q.topicSlug}`}
                        style={{ fontSize: 12, color: "var(--primary)", fontWeight: 600 }}>
                        📌 {q.topicName}
                      </Link>
                    )}
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>👁 {q.timesViewed} views · 📖 {q.timesRevised} revisions</span>
                  </div>
                  {!isRevealed && (
                    <button className="btn btn-ghost btn-sm" onClick={() => reveal(q.id)}>Reveal Answer</button>
                  )}
                </div>
              </div>
            );
          })}
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
