"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

type SearchResult = {
  id: number;
  type: "question" | "topic" | "note";
  title: string;
  snippet: string;
  category: string;
  slug?: string;
  rank: number;
};
type SearchData = {
  questions: SearchResult[];
  topics: SearchResult[];
  notes: SearchResult[];
  totalHits: number;
  queryTime: number;
};

const TYPE_ICONS: Record<string, string> = {
  question: "❓",
  topic: "🗂️",
  note: "📝",
};
const TYPE_LABELS: Record<string, string> = {
  question: "Question",
  topic: "Topic",
  note: "Note",
};

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [inputVal, setInputVal] = useState(initialQuery);
  const [results, setResults] = useState<SearchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=30`);
      if (r.ok) setResults(await r.json() as SearchData);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  // Run search on query change
  useEffect(() => {
    void doSearch(query);
  }, [query, doSearch]);

  // Debounce input → update query + URL
  const handleInput = (val: string) => {
    setInputVal(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setQuery(val);
      const url = val.trim() ? `/?q=${encodeURIComponent(val)}` : "/";
      router.replace(url, { scroll: false });
    }, 300);
  };

  // Collect all results merged + filtered
  const allResults: SearchResult[] = [
    ...(results?.questions ?? []),
    ...(results?.topics ?? []),
    ...(results?.notes ?? []),
  ].filter((r) => typeFilter === "all" || r.type === typeFilter);

  const getHref = (r: SearchResult) => {
    if (r.type === "topic" || r.type === "note") return `/topics/${r.slug}`;
    return `/questions`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">🔍 Search</h1>
        </div>
      </div>

      {/* Search Input */}
      <div className="card" style={{ padding: "16px 20px" }}>
        <div style={{ position: "relative" }}>
          <input
            id="search-page-input"
            className="input"
            placeholder="Search questions, topics, notes…"
            value={inputVal}
            onChange={(e) => handleInput(e.target.value)}
            style={{ padding: "0 16px", fontSize: 16, height: 48, width: "100%" }}
            autoFocus
          />
          {loading && (
            <div className="spinner" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)" }} />
          )}
        </div>
      </div>

      {/* Filters */}
      {results && results.totalHits > 0 && (
        <div className="filters-bar">
          {["all", "question", "topic", "note"].map((t) => {
            const count = t === "all" ? results.totalHits
              : t === "question" ? results.questions.length
              : t === "topic" ? results.topics.length
              : results.notes.length;
            return (
              <button
                key={t}
                className={`filter-chip ${typeFilter === t ? "active" : ""}`}
                onClick={() => setTypeFilter(t)}
              >
                {t === "all" ? "All" : TYPE_LABELS[t]} ({count})
              </button>
            );
          })}
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
            {results.totalHits} results in {results.queryTime}ms
          </span>
        </div>
      )}

      {/* Results */}
      {!loading && !results && query.length > 1 && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <div className="empty-title">No results found</div>
            <div className="empty-desc">Try a different keyword or import more study material.</div>
          </div>
        </div>
      )}

      {!loading && !query.trim() && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">✏️</div>
            <div className="empty-title">Start typing to search</div>
            <div className="empty-desc">Search across all your imported questions, generated topics, and AI revision notes.</div>
          </div>
        </div>
      )}

      {allResults.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {allResults.map((r) => (
            <Link
              key={`${r.type}-${r.id}`}
              href={getHref(r)}
              style={{ textDecoration: "none" }}
            >
              <div className="search-result-card">
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <span style={{ fontSize: 24, flexShrink: 0, marginTop: 2 }}>{TYPE_ICONS[r.type]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <span className={`badge ${r.type === "question" ? "badge-amber" : r.type === "topic" ? "badge-blue" : "badge-green"}`}>
                        {TYPE_LABELS[r.type]}
                      </span>
                      {r.category && (
                        <span className="badge badge-gray">{r.category}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.4, color: "var(--text-primary)", marginBottom: 4 }}>
                      {r.title}
                    </div>
                    {r.snippet && (
                      <div style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 }}>
                        {r.snippet.slice(0, 180)}{r.snippet.length > 180 ? "…" : ""}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 18, flexShrink: 0, color: "var(--text-muted)" }}>→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function HomeClient() {
  return (
    <Suspense fallback={<div style={{ padding: 32, textAlign: "center" }}>Loading search…</div>}>
      <SearchContent />
    </Suspense>
  );
}
