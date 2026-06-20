"use client";
import { useState, useRef, useCallback } from "react";
import Link from "next/link";

type Job = {
  id: number; fileName: string; fileSize: number; status: string;
  totalPages: number; currentPage: number; extractedQuestions: number;
  createdAt: string;
};
type JobStats = { total: number; queued: number; processing: number; completed: number; failed: number; paused: number; totalExtracted: number; };

export function ImportPageClient() {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<JobStats | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [currentJobId, setCurrentJobId] = useState<number | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchJobs = useCallback(async () => {
    const r = await fetch("/api/import");
    if (r.ok) {
      const d = await r.json() as { jobs: Job[]; stats: JobStats };
      setJobs(d.jobs ?? []);
      setStats(d.stats ?? null);
    }
  }, []);

  // Fetch jobs on mount
  useState(() => { void fetchJobs(); });

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0]!;
    if (file.type !== "application/pdf") { setError("Only PDF files are accepted."); return; }
    if (file.size > 100 * 1024 * 1024) { setError("File exceeds 100 MB limit."); return; }
    setPendingFile(file);
    setError("");
    if (!sourceName) setSourceName(file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " "));
  };

  const handleUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    setError("");

    const fd = new FormData();
    fd.append("file", pendingFile);
    fd.append("source", sourceName || pendingFile.name);

    try {
      const r = await fetch("/api/import", { method: "POST", body: fd });
      const d = await r.json() as { jobId?: number; error?: string; code?: string };

      if (!r.ok) {
        setError(d.error ?? "Upload failed");
        if (d.code === "DUPLICATE") setError(`⚠️ ${d.error}`);
        return;
      }

      setCurrentJobId(d.jobId!);
      setSuccess(`Job #${d.jobId} created! Starting AI extraction…`);
      setPendingFile(null);
      setSourceName("");
      void fetchJobs();

      // Auto-start processing
      setProcessing(true);
      const pfd = new FormData();
      pfd.append("file", pendingFile);
      const pr = await fetch(`/api/import/${d.jobId}/process`, { method: "POST", body: pfd });
      const pd = await pr.json() as { totalExtracted?: number; error?: string; code?: string };

      if (!pr.ok) {
        setError(pd.code === "AI_RATE_LIMIT" ? "⚠️ AI daily limit reached. Job paused — resume tomorrow." : `Processing failed: ${pd.error}`);
      } else {
        setSuccess(`✅ Extracted ${pd.totalExtracted} questions! Go to Review to approve them.`);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUploading(false);
      setProcessing(false);
      void fetchJobs();
    }
  };

  const statusIcon = (s: string) => ({
    queued: "⏳", processing: "⚙️", completed: "✅", failed: "❌", paused: "⏸️"
  }[s] ?? "❓");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Import PDFs 📥</h1>
          <p className="page-subtitle">Upload SSC exam PDFs to extract MCQ questions with AI.</p>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && stats.total > 0 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "Total Jobs", value: stats.total, color: "var(--text-primary)" },
            { label: "Processing", value: stats.processing, color: "var(--info)" },
            { label: "Completed", value: stats.completed, color: "var(--success)" },
            { label: "Failed", value: stats.failed, color: "var(--danger)" },
            { label: "Questions Extracted", value: stats.totalExtracted, color: "var(--primary)" },
          ].map((s) => (
            <div key={s.label} className="card" style={{ flex: "1 1 140px", padding: "14px 18px" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid-2">
        {/* Upload Zone */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid var(--border)" }}>
            <div className="section-title">New Import</div>
          </div>
          <div style={{ padding: 20 }}>
            <div
              className={`upload-zone ${dragging ? "dragging" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="upload-icon">{pendingFile ? "📄" : "☁️"}</div>
              <div className="upload-title">
                {pendingFile ? pendingFile.name : "Drop your PDF here"}
              </div>
              <div className="upload-hint">
                {pendingFile
                  ? `${(pendingFile.size / 1024 / 1024).toFixed(2)} MB — Click to change`
                  : "or click to browse · PDF only · max 100 MB"}
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept=".pdf" hidden onChange={(e) => handleFiles(e.target.files)} />

            {pendingFile && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>
                    Source Name (optional)
                  </label>
                  <input
                    className="input"
                    placeholder="e.g., CGL 2023 Tier-1"
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: "100%" }}
                  onClick={handleUpload}
                  disabled={uploading || processing}
                >
                  {uploading ? <><div className="spinner" />Uploading…</> :
                   processing ? <><div className="spinner" />Extracting questions…</> :
                   "🚀 Upload & Extract"}
                </button>
              </div>
            )}

            {error && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "#fff5f5", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--danger)" }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "#f0fdf4", border: "1px solid var(--success)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "#1a7d35" }}>
                {success}
                {currentJobId && (
                  <Link href={`/import/${currentJobId}/review`} className="btn btn-sm btn-primary" style={{ marginLeft: 12 }}>
                    Review →
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* How it works */}
        <div className="card">
          <div className="section-title" style={{ marginBottom: 16 }}>How it works</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { step: "1", icon: "📄", title: "Upload PDF", desc: "Drop any SSC exam PDF — question papers, practice sets, books." },
              { step: "2", icon: "🤖", title: "AI Extracts MCQs", desc: "Gemini reads each page chunk and extracts structured MCQ data." },
              { step: "3", icon: "👁️", title: "Review Questions", desc: "Approve, reject, or edit each question in the staging area." },
              { step: "4", icon: "📚", title: "Promote to Bank", desc: "Approved questions go to the question bank with topics auto-created." },
            ].map((s) => (
              <div key={s.step} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "var(--primary-light)", border: "2px solid var(--primary)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 800, color: "var(--primary)", flexShrink: 0
                }}>{s.step}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{s.icon} {s.title}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Jobs List */}
      {jobs.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="section-title">Import History</span>
            <button className="btn btn-ghost btn-sm" onClick={fetchJobs}>↺ Refresh</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {jobs.map((job, i) => (
              <div key={job.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "13px 4px",
                borderBottom: i < jobs.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 20 }}>{statusIcon(job.status)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {job.fileName}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      {job.totalPages} pages · {job.extractedQuestions} questions extracted
                    </div>
                    {job.status === "processing" && (
                      <div style={{ marginTop: 6, width: 200 }}>
                        <div className="progress-bar-wrap">
                          <div className="progress-bar"
                            style={{ width: `${job.totalPages > 0 ? Math.round((job.currentPage / job.totalPages) * 100) : 0}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span className={`badge status-${job.status}`}
                    style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}>
                    {job.status}
                  </span>
                  {(job.status === "completed" || job.status === "paused") && (
                    <Link href={`/import/${job.id}/review`} className="btn btn-sm btn-secondary">
                      Review
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {jobs.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📂</div>
          <div className="empty-title">No imports yet</div>
          <div className="empty-desc">Upload your first SSC PDF to get started with question extraction.</div>
        </div>
      )}
    </div>
  );
}
