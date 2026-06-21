"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Topic = {
  id: number; slug: string; name: string; category: string; chapter: string;
  topicStatus: string; totalQuestions: number;
  aliases: string[]; hasNote: boolean;
};
type Question = {
  id: number; question: string; difficulty: string;
  optionA: string; optionB: string; optionC: string; optionD: string;
  correctOption: string; shortExplanation: string | null;
  examName?: string | null;
};
type NoteData = {
  note: { id: number; content: string; aiModel: string; createdAt: string };
  keywords: string[]; facts: string[]; wasFromCache: boolean;
};

type Props = { slug: string; initialTopic: Topic | null; initialNote?: NoteData | null };

export function TopicDetailClient({ slug, initialTopic, initialNote }: Props) {
  const [topic] = useState<Topic | null>(initialTopic);
  const [activeTab, setActiveTab] = useState<"note" | "questions" | "facts">("facts");
  const [noteData, setNoteData] = useState<NoteData | null>(initialNote ?? null);
  const [noteLoading, setNoteLoading] = useState(!initialNote);
  const [noteError, setNoteError] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qLoading, setQLoading] = useState(false);
  const [revising, setRevising] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [toast, setToast] = useState<string>("");
  const [localSearch, setLocalSearch] = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  // Auto-load note on mount if not provided by server
  useEffect(() => {
    if (initialNote) return;
    const loadNote = async () => {
      setNoteLoading(true);
      setNoteError("");
      try {
        const r = await fetch(`/api/topics/${slug}/note`, { method: "POST" });
        const d = await r.json() as NoteData & { error?: string; code?: string };
        if (!r.ok) {
          if (d.code === "AI_RATE_LIMIT") setNoteError("⚠️ AI daily limit reached. Notes will be generated tomorrow.");
          else if (d.code === "NOT_FOUND") setNoteError("Topic not found.");
          else setNoteError(d.error ?? "Failed to generate note.");
        } else {
          setNoteData(d);
        }
      } catch {
        setNoteError("Network error or timeout loading note.");
      } finally {
        setNoteLoading(false);
      }
    };
    void loadNote();
  }, [slug, initialNote]);

  // Load questions when that tab is active
  useEffect(() => {
    if (activeTab !== "questions" || !topic) return;
    if (questions.length > 0) return; // Already loaded!
    const loadQuestions = async () => {
      setQLoading(true);
      const r = await fetch(`/api/questions?topicId=${topic.id}&pageSize=30`);
      if (r.ok) {
        const d = await r.json() as { items: Question[] };
        setQuestions(d.items ?? []);
      }
      setQLoading(false);
    };
    void loadQuestions();
  }, [activeTab, topic, questions.length]);

  const startRevision = async () => {
    setRevising(true);
    const r = await fetch("/api/revision/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicSlug: slug }),
    });
    if (r.ok) {
      const d = await r.json() as { session: { id: number } };
      setSessionId(d.session.id);
      showToast("📖 Revision session started!");
    }
    setRevising(false);
  };

  const completeRevision = async () => {
    if (!sessionId) return;
    await fetch(`/api/revision/sessions/${sessionId}/complete`, { method: "POST" });
    setSessionId(null);
    showToast("✅ Session complete! Streak updated.");
  };

  const reveal = (qId: number, opt: string) => {
    setRevealed((prev) => ({ ...prev, [qId]: opt }));
  };

  const CATEGORY_COLORS: Record<string, string> = {
    Geography: "badge-blue", History: "badge-amber", Polity: "badge-purple",
    Economy: "badge-green", Science: "badge-red", Miscellaneous: "badge-gray",
  };

  const diffColor = (d: string) =>
    d === "easy" ? "badge-green" : d === "hard" ? "badge-red" : "badge-amber";

  const filteredQuestions = questions.filter(q => {
    if (!localSearch) return true;
    const s = localSearch.toLowerCase();
    return q.question.toLowerCase().includes(s) || 
           q.optionA.toLowerCase().includes(s) ||
           q.optionB.toLowerCase().includes(s) ||
           q.optionC.toLowerCase().includes(s) ||
           q.optionD.toLowerCase().includes(s) ||
           (q.shortExplanation && q.shortExplanation.toLowerCase().includes(s));
  });

  const filteredFacts = noteData?.facts.filter(f => {
    if (!localSearch) return true;
    return f.toLowerCase().includes(localSearch.toLowerCase());
  }) ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
        <Link href="/topics" style={{ color: "var(--primary)", fontWeight: 600 }}>Topics</Link>
        <span>/</span>
        <span>{topic?.category ?? "…"}</span>
        <span>/</span>
        <span>{topic?.chapter ?? "…"}</span>
        <span>/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{topic?.name ?? slug}</span>
      </div>

      {/* Topic Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">{topic?.name ?? slug}</h1>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
            {topic && <span className={`badge ${CATEGORY_COLORS[topic.category] ?? "badge-gray"}`}>{topic.category}</span>}
            {topic && <span className="badge badge-gray">❓ {topic.totalQuestions} Questions</span>}
            {noteData && !noteData.wasFromCache && <span className="badge badge-green">✨ Just Generated</span>}
            {noteData && noteData.wasFromCache && <span className="badge badge-blue">📋 Cached Note</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {!sessionId ? (
            <button className="btn btn-primary" onClick={startRevision} disabled={revising}>
              {revising ? <><div className="spinner" />Starting…</> : "📖 Start Revision"}
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={completeRevision}>
              ✅ Complete Session
            </button>
          )}
        </div>
      </div>

      {/* Session Banner */}
      {sessionId && (
        <div style={{
          background: "linear-gradient(135deg, #f0fdf4, #d4f5dd)",
          border: "1px solid var(--success)", borderRadius: "var(--radius-md)",
          padding: "12px 18px", display: "flex", alignItems: "center", gap: 12, fontSize: 14,
        }}>
          <span style={{ fontSize: 24 }}>📖</span>
          <div>
            <strong>Revision Session Active</strong>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Read through the note and practice questions below, then mark as complete.</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="tabs">
          {[
            { id: "facts" as const, label: `💡 Key Facts (${noteData?.facts.length ?? 0})` },
            { id: "note" as const, label: "📝 Revision Note" },
            { id: "questions" as const, label: `❓ Questions (${topic?.totalQuestions ?? 0})` },
          ].map((t) => (
            <button key={t.id} className={`tab ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {(activeTab === "questions" || activeTab === "facts") && (
          <div className="input-group" style={{ maxWidth: 400 }}>
            <span className="input-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </span>
            <input
              className="input"
              placeholder={`Search ${activeTab}...`}
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Note Tab */}
      {activeTab === "note" && (
        <div>
          {noteLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="skeleton" style={{ height: 28, width: "60%" }} />
              <div className="skeleton" style={{ height: 20 }} />
              <div className="skeleton" style={{ height: 20, width: "80%" }} />
              <div className="skeleton" style={{ height: 20, width: "70%" }} />
              <div style={{ marginTop: 8 }}>
                <div className="skeleton" style={{ height: 18, width: "40%" }} />
              </div>
              <div style={{ padding: "18px", display: "flex", alignItems: "center", gap: 12, fontSize: 14, color: "var(--text-muted)" }}>
                <div className="spinner" />
                <div>
                  Generating your comprehensive revision note…
                </div>
              </div>
            </div>
          )}

          {noteError && (
            <div style={{ padding: "20px", background: "#fff5f5", border: "1px solid var(--danger)", borderRadius: "var(--radius-md)", color: "var(--danger)" }}>
              {noteError}
            </div>
          )}

          {noteData && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Keywords */}
              {noteData.keywords.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {noteData.keywords.map((kw) => (
                    <span key={kw} style={{
                      padding: "4px 12px", background: "var(--primary-light)",
                      color: "var(--primary)", borderRadius: "var(--radius-full)",
                      fontSize: 12, fontWeight: 600, border: "1px solid var(--primary-mid)"
                    }}>{kw}</span>
                  ))}
                </div>
              )}
              {/* Note content */}
              <div className="note-container">
                <div className="note-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {noteData.note.content}
                  </ReactMarkdown>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right" }}>
                Generated by {noteData.note.aiModel} · {new Date(noteData.note.createdAt).toLocaleDateString()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Questions Tab */}
      {activeTab === "questions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {qLoading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 160 }} />)}
          {!qLoading && filteredQuestions.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">❓</div>
              <div className="empty-title">No questions found</div>
              <div className="empty-desc">Try clearing your search or importing more questions.</div>
            </div>
          )}
          {!qLoading && filteredQuestions.map((q) => (
            <div key={q.id} className="question-card">
              <div className="question-card-header">
                <div className="question-text-main">{q.question}</div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <span className={`badge ${diffColor(q.difficulty)}`}>{q.difficulty}</span>
                  {q.examName && <span className="badge badge-purple" style={{ fontWeight: 600 }}>🏛️ {q.examName}</span>}
                </div>
              </div>
              <div className={`question-options ${revealed[q.id] ? "is-revealed" : ""}`}>
                {(["A", "B", "C", "D"] as const).map((opt) => {
                  const optText = ({ A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD })[opt];
                  const selectedOpt = revealed[q.id];
                  const isRevealed = !!selectedOpt;
                  const isCorrect = isRevealed && q.correctOption === opt;
                  const isWrongSelection = isRevealed && selectedOpt === opt && !isCorrect;
                  
                  let className = "q-option";
                  if (isCorrect) className += " correct-reveal";
                  else if (isWrongSelection) className += " wrong-reveal";

                  return (
                    <div
                      key={opt}
                      className={className}
                      onClick={() => !isRevealed && reveal(q.id, opt)}
                    >
                      <span className="q-option-label">{opt}.</span>
                      <span>{optText}</span>
                      {isCorrect && <span style={{ marginLeft: "auto", fontSize: 14 }}>✓</span>}
                    </div>
                  );
                })}
              </div>
              {revealed[q.id] && q.shortExplanation && (
                <div style={{ marginTop: 10, padding: "10px 14px", background: "var(--primary-light)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "#1a5c2e", borderLeft: "3px solid var(--primary)" }}>
                  💡 {q.shortExplanation}
                </div>
              )}
              {!revealed[q.id] && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", paddingLeft: 8 }}>
                    Click an option to reveal the answer
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Facts Tab */}
      {activeTab === "facts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredFacts.length === 0 || !noteData ? (
            <div className="empty-state">
              <div className="empty-icon">💡</div>
              <div className="empty-title">No facts found</div>
              <div className="empty-desc">Generate a note first or try clearing your search.</div>
            </div>
          ) : (
            filteredFacts.map((fact, i) => (
              <div key={i} className="fact-card" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>💡</span>
                <div className="fact-text">{fact}</div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className="toast success">{toast}</div>
        </div>
      )}
    </div>
  );
}
