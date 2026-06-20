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

  useEffect(() => {
    const fetchFacts = async () => {
      try {
        const res = await fetch("/api/facts");
        if (res.ok) {
          const data = await res.json();
          setFacts(data.facts);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchFacts();
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
        ) : facts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💡</div>
            <div className="empty-title">No facts found</div>
            <div className="empty-desc">Generate notes for your topics to extract key facts.</div>
          </div>
        ) : (
          facts.map((fact, idx) => (
            <div key={idx} className="card" style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.5, marginBottom: 12 }}>
                {fact.fact}
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
