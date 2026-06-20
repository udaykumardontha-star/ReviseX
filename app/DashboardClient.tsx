"use client";
import Link from "next/link";
import type { DashboardData } from "@/services";

type Props = { data: DashboardData | null };

const CATEGORY_COLORS: Record<string, string> = {
  Geography: "badge-blue",
  History: "badge-amber",
  Polity: "badge-purple",
  Economy: "badge-green",
  Science: "badge-red",
  Environment: "badge-green",
  "Art & Culture": "badge-purple",
  "Current Affairs": "badge-blue",
  Miscellaneous: "badge-gray",
};

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number | string; color: string }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: color + "22", fontSize: 20 }}>{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function HeatmapCell({ level }: { level: number }) {
  return <div className="heatmap-cell" data-level={String(level)} title={`${level} sessions`} />;
}

export function DashboardClient({ data }: Props) {
  const streak = data?.streak;
  const notes = data?.noteStats;
  const facts = data?.randomFacts ?? [];
  const topics = data?.topicsNeedingAttention ?? [];
  const recent = data?.recentSessions ?? [];
  const activity = data?.dailyActivity ?? [];

  // Build 90-day activity grid
  const today = new Date();
  const grid: number[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const entry = activity.find((a) => a.date === dateStr);
    const count = entry?.sessionCount ?? 0;
    grid.push(count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 3 : 4);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Dashboard 👋</h1>
          <p className="page-subtitle">Here&apos;s your exam prep overview for today.</p>
        </div>
        <div className="page-header-actions">
          <Link href="/import" className="btn btn-primary">
            <span>📥</span> Import PDF
          </Link>
        </div>
      </div>

      {/* Streak Banner */}
      {streak && (streak.currentStreak > 0 || streak.studiedToday) && (
        <div style={{
          background: "linear-gradient(135deg, #34C759 0%, #1a8c38 100%)",
          borderRadius: "var(--radius-lg)", padding: "20px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          color: "white", boxShadow: "0 4px 20px rgba(52,199,89,0.3)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 40 }}>🔥</span>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{streak.currentStreak} Day Streak!</div>
              <div style={{ fontSize: 14, opacity: 0.85 }}>
                {streak.studiedToday ? "You studied today. Keep it up!" : "Study today to keep your streak alive!"}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, opacity: 0.75 }}>Longest</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{streak.longestStreak} days</div>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="stat-grid">
        <StatCard icon="📝" label="Notes Generated" value={notes?.totalNotes ?? 0} color="#34C759" />
        <StatCard icon="💡" label="Key Facts" value={notes?.totalFacts ?? 0} color="#007AFF" />
        <StatCard icon="📚" label="Topics Studied" value={data?.totalStudiedTopics ?? 0} color="#FF9500" />
        <StatCard icon="🏆" label="Total Sessions" value={streak?.totalSessions ?? 0} color="#AF52DE" />
      </div>

      <div className="grid-2">
        {/* Activity Heatmap */}
        <div className="card">
          <div className="card-header">
            <span className="section-title">📅 90-Day Activity</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Daily sessions</span>
          </div>
          <div className="heatmap-grid">
            {grid.map((level, i) => <HeatmapCell key={i} level={level} />)}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: 11, color: "var(--text-muted)" }}>
            <span>Less</span>
            {[0,1,2,3,4].map((l) => <div key={l} className="heatmap-cell" data-level={String(l)} />)}
            <span>More</span>
          </div>
        </div>

        {/* Recent Sessions */}
        <div className="card">
          <div className="card-header">
            <span className="section-title">⏱️ Recently Studied</span>
            <Link href="/revision" style={{ fontSize: 12, color: "var(--primary)", fontWeight: 600 }}>View all →</Link>
          </div>
          {recent.length === 0 ? (
            <div className="empty-state" style={{ padding: "30px 0" }}>
              <div style={{ fontSize: 32 }}>📖</div>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No sessions yet. Start revising!</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {recent.slice(0, 6).map((s) => (
                <Link key={s.id} href={`/topics/${s.topicSlug}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 12px", background: "var(--surface-2)", borderRadius: "var(--radius-sm)",
                    transition: "background var(--transition)", cursor: "pointer" }}
                  className="card-hover">
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.topicName}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {new Date(s.startedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid-2">
        {/* Topics Needing Generation */}
        <div className="card">
          <div className="card-header">
            <span className="section-title">⚡ Needs AI Notes</span>
            <Link href="/topics?status=not_generated" style={{ fontSize: 12, color: "var(--primary)", fontWeight: 600 }}>View all →</Link>
          </div>
          {topics.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              🎉 All topics have notes generated!
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {topics.map((t) => (
                <Link key={t.id} href={`/topics/${t.slug}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 12px", background: "var(--surface-2)", borderRadius: "var(--radius-sm)",
                    transition: "all var(--transition)" }}
                  className="card-hover">
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{t.totalQuestions} questions</div>
                  </div>
                  <span className={`badge ${CATEGORY_COLORS[t.category] ?? "badge-gray"}`}>{t.category}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Daily Facts */}
        <div className="card">
          <div className="card-header">
            <span className="section-title">💡 Today&apos;s Facts</span>
          </div>
          {facts.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Generate some notes to see daily facts here!
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {facts.slice(0, 4).map((f, i) => (
                <div key={i} className="fact-card">
                  <div className="fact-text">{f.fact}</div>
                  <div className="fact-topic">📌 {f.topicName}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
