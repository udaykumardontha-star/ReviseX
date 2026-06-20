"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

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

export function TopNav() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounced search
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setResults(null);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      setLoading(true);
      setOpen(true);
      fetch(`/api/search?q=${encodeURIComponent(query)}&limit=4`)
        .then((r) => r.json())
        .then((d: SearchData) => setResults(d))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 280);
  }, [query]);

  const navigate = (item: SearchResult) => {
    setOpen(false);
    setQuery("");
    if (item.type === "topic" || item.type === "note") {
      router.push(`/topics/${item.slug}`);
    } else {
      router.push(`/questions?highlight=${item.id}`);
    }
  };

  return (
    <>
      {/* Global Search */}
      <div className="search-bar" ref={containerRef}>
        <span className="search-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </span>
        <input
          id="global-search"
          className="search-input"
          placeholder="Search questions, topics, notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results && results.totalHits > 0) setOpen(true); }}
          autoComplete="off"
        />

        {open && (
          <div className="search-results">
            {loading && (
              <div style={{ padding: "18px", display: "flex", justifyContent: "center" }}>
                <div className="spinner" />
              </div>
            )}

            {!loading && results && (
              <>
                {results.questions.length > 0 && (
                  <>
                    <div className="search-section-label">Questions</div>
                    {results.questions.slice(0, 3).map((r) => (
                      <div key={r.id} className="search-result-item" onClick={() => navigate(r)}>
                        <span style={{ fontSize: 16 }}>❓</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
                            {r.title.slice(0, 90)}{r.title.length > 90 ? "…" : ""}
                          </div>
                          <span className="badge badge-gray" style={{ marginTop: 4 }}>{r.category}</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {results.topics.length > 0 && (
                  <>
                    <div className="search-section-label">Topics</div>
                    {results.topics.slice(0, 3).map((r) => (
                      <div key={r.id} className="search-result-item" onClick={() => navigate(r)}>
                        <span style={{ fontSize: 16 }}>🗂️</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{r.title}</div>
                          <span className="badge badge-blue" style={{ marginTop: 4 }}>{r.category}</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {results.notes.length > 0 && (
                  <>
                    <div className="search-section-label">Notes</div>
                    {results.notes.slice(0, 2).map((r) => (
                      <div key={r.id} className="search-result-item" onClick={() => navigate(r)}>
                        <span style={{ fontSize: 16 }}>📝</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{r.title}</div>
                          <span className="badge badge-green" style={{ marginTop: 4 }}>Note</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {results.totalHits === 0 && (
                  <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                    No results for &ldquo;{query}&rdquo;
                  </div>
                )}
                {results.totalHits > 0 && (
                  <div style={{ padding: "8px 14px", fontSize: 11, color: "var(--text-muted)", background: "var(--surface-2)", textAlign: "right" }}>
                    {results.totalHits} results in {results.queryTime}ms
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Right side */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
        <img
          src="/icon-192.png"
          alt="Profile"
          style={{
            width: 34, height: 34, borderRadius: "50%",
            boxShadow: "0 2px 8px rgba(52,199,89,0.4)", objectFit: "cover"
          }}
        />
      </div>
    </>
  );
}
