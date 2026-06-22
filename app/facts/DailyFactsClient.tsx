"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

type Fact = {
  fact: string;
  topicName: string;
  topicSlug: string;
};

export function DailyFactsClient() {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const fetchFacts = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/facts", { cache: "no-store" });
      if (!res.ok) throw new Error("Facts request failed");
      const data = await res.json() as { facts?: Fact[] };
      setFacts(data.facts ?? []);
    } catch {
      setLoadError("Could not load today's facts. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchFacts();
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">💡 Daily Facts</h1>
          <p className="page-subtitle">A quick revision of key facts from your topics.</p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 80 }} />
          ))
        ) : loadError ? (
          <div className="empty-state">
            <div className="empty-title">Facts unavailable</div>
            <div className="empty-desc">{loadError}</div>
            <button className="btn btn-secondary btn-sm" onClick={() => void fetchFacts()}>Retry</button>
          </div>
        ) : facts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💡</div>
            <div className="empty-title">No facts found</div>
            <div className="empty-desc">Generate notes for your topics to extract key facts.</div>
          </div>
        ) : (
          facts.map((fact, idx) => (
            <div key={idx} className="fact-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>💡</span>
                <div className="fact-text">{fact.fact}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Link
                  href={`/topics/${fact.topicSlug}`}
                  className="badge badge-gray"
                  style={{ textDecoration: "none" }}
                >
                  📌 {fact.topicName}
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
