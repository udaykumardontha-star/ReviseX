"use client";
import Link from "next/link";
import type { DashboardData } from "@/services";

type Props = { data: DashboardData | null };

export function DashboardClient({ data }: Props) {
  const streak = data?.streak;
  const recent = data?.recentSessions ?? [];
  const activity = data?.dailyActivity ?? [];
  const facts = data?.randomFacts ?? [];
  const noteStats = data?.noteStats;

  // Build 90-day activity grid
  const today = new Date();
  const grid: Array<{ date: string; level: number; count: number }> = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const entry = activity.find((a) => a.date === dateStr);
    const count = entry?.sessionCount ?? 0;
    const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 3 : 4;
    grid.push({ date: dateStr, level, count });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Dashboard 🏠</h1>
          <p className="page-subtitle">Track your streak, sessions, and learning progress.</p>
        </div>
        <div className="page-header-actions">
          <Link href="/topics" className="btn btn-primary">Browse Topics →</Link>
        </div>
      </div>

      {/* Streak Hero */}
      <div style={{
        background: streak?.currentStreak && streak.currentStreak > 0
          ? "linear-gradient(135deg, #34C759 0%, #1a8c38 100%)"
          : "linear-gradient(135deg, #f0f2f5 0%, #e8ebf0 100%)",
        borderRadius: "var(--radius-xl)",
        padding: "32px",
        color: streak?.currentStreak && streak.currentStreak > 0 ? "white" : "var(--text-secondary)",
        boxShadow: streak?.currentStreak && streak.currentStreak > 0 ? "0 6px 24px rgba(52,199,89,0.3)" : "var(--shadow-sm)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <div style={{ fontSize: 64 }}>{streak?.currentStreak ? "🔥" : "💤"}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 48, fontWeight: 900, lineHeight: 1 }}>
              {streak?.currentStreak ?? 0}
            </div>
            <div style={{ fontSize: 16, opacity: 0.85, marginTop: 4 }}>
              {streak?.currentStreak
                ? `Day streak · ${streak.studiedToday ? "Studied today ✓" : "Study today to continue!"}`
                : "Start your first session to begin a streak"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 28 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{streak?.longestStreak ?? 0}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Best Streak</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{streak?.totalSessions ?? 0}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Total Sessions</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{data?.totalStudiedTopics ?? 0}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Topics Studied</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="stat-grid">
        {[
          { icon: "📝", label: "Notes Generated", value: noteStats?.totalNotes ?? 0, color: "#34C759" },
          { icon: "💡", label: "Key Facts", value: noteStats?.totalFacts ?? 0, color: "#007AFF" },
          { icon: "🏷️", label: "Keywords Indexed", value: noteStats?.totalKeywords ?? 0, color: "#FF9500" },
          { icon: "📅", label: "Active Days (90d)", value: activity.filter((a) => a.sessionCount > 0).length, color: "#AF52DE" },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className="stat-icon" style={{ background: s.color + "22" }}>{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        {/* Activity Heatmap */}
        <div className="card">
          <div className="card-header">
            <span className="section-title">📅 90-Day Activity</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "var(--text-muted)" }}>
              Less
              {[0, 1, 2, 3, 4].map((l) => (
                <div key={l} className="heatmap-cell" data-level={String(l)} />
              ))}
              More
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {Array.from({ length: 13 }).map((_, week) => (
              <div key={week} style={{ display: "flex", gap: 3 }}>
                {grid.slice(week * 7, week * 7 + 7).map((cell) => (
                  <div
                    key={cell.date}
                    className="heatmap-cell"
                    data-level={String(cell.level)}
                    title={`${cell.date}: ${cell.count} session${cell.count !== 1 ? "s" : ""}`}
                    style={{ cursor: cell.count > 0 ? "pointer" : "default" }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Recent Sessions */}
        <div className="card">
          <div className="card-header">
            <span className="section-title">⏱️ Recent Sessions</span>
          </div>
          {recent.length === 0 ? (
            <div className="empty-state" style={{ padding: "24px 0" }}>
              <div style={{ fontSize: 36 }}>📖</div>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No sessions yet. Pick a topic and start revising!</p>
              <Link href="/topics" className="btn btn-primary btn-sm" style={{ marginTop: 8 }}>Browse Topics</Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {recent.map((s) => (
                <Link
                  key={s.id}
                  href={`/topics/${s.topicSlug}`}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 12px", background: "var(--surface-2)",
                    borderRadius: "var(--radius-sm)", transition: "background var(--transition)",
                  }}
                  className="card-hover"
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18 }}>{s.completedAt ? "✅" : "⏸️"}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{s.topicName}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {new Date(s.startedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        {"durationSeconds" in s && (s as { durationSeconds?: number }).durationSeconds
                          ? ` · ${Math.round(((s as { durationSeconds: number }).durationSeconds) / 60)}m`
                          : ""}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>→</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Daily Facts Carousel */}
      {facts.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="section-title">💡 Today&apos;s Revision Facts</span>
          </div>
          <div className="grid-3">
            {facts.map((f, i) => (
              <div key={i} className="fact-card">
                <div className="fact-text">{f.fact}</div>
                <Link href={`/topics/${f.topicSlug}`} className="fact-topic">📌 {f.topicName}</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Topics CTA */}
      <div style={{
        background: "linear-gradient(135deg, #f0fdf4, #d4f5dd)",
        border: "1px solid #b2e8c3",
        borderRadius: "var(--radius-lg)",
        padding: "24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1a5c2e" }}>Ready to revise? 🚀</div>
          <div style={{ fontSize: 13, color: "#3a7d4e", marginTop: 4 }}>
            Pick any topic to generate AI notes, read key facts, and practice questions.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/topics?status=not_generated" className="btn btn-secondary">Pending Notes</Link>
          <Link href="/topics" className="btn btn-primary">All Topics →</Link>
        </div>
      </div>
    </div>
  );
}
