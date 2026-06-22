"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { VALID_CATEGORIES } from "@/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

type ImportStartResult = {
  jobId: number;
  fileName: string;
  totalPages: number;
  fileType: string;
};

type ProcessResult = {
  totalExtracted: number;
  totalSkipped: number;
};

type JobEntry = {
  id: number;
  fileName: string;
  status: string;
  extractedQuestions: number;
  totalPages: number;
  currentPage: number;
  createdAt: string;
};

type JobsData = { jobs: JobEntry[]; stats: Record<string, number> };

type ImportMode = "file" | "text";

const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/jpg"];
const ACCEPTED_EXT   = ".pdf,.png,.jpg,.jpeg,.webp";

// Dynamically load PDF.js from CDN

async function resizeImageIfNeeded(file: File, maxMb: number = 4): Promise<File> {
  if (file.size <= maxMb * 1024 * 1024) return file; // no resize needed

  return new Promise((resolve) => {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      
      // Simple scaling to ~1920x1080 max bounds
      const MAX_WIDTH = 1920;
      const MAX_HEIGHT = 1080;
      if (width > height) {
        if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
      } else {
        if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, width, height);

      // Compress to JPEG 80%
      canvas.toBlob((blob) => {
        if (!blob) resolve(file); // fallback
        else resolve(new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), { type: "image/jpeg" }));
      }, "image/jpeg", 0.8);
    };
    img.onerror = () => resolve(file); // fallback on error
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ImportPageClient() {
  // ── Upload state ──────────────────────────────────────────────────────
  const [mode, setMode] = useState<ImportMode>("file");
  const [files, setFiles] = useState<File[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [textContent, setTextContent] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [forcedCategory, setForcedCategory] = useState("Auto-Detect");

  // ── Jobs list ─────────────────────────────────────────────────────────
  const [jobsData, setJobsData] = useState<JobsData | null>(null);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchJobs = useCallback(async () => {
    try {
      setJobsError("");
      const r = await fetch("/api/import", { cache: "no-store" });
      if (!r.ok) throw new Error("Import history request failed");
      setJobsData(await r.json() as JobsData);
    } catch {
      setJobsError("Could not load import history. Please retry.");
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    if (!jobsData?.jobs.some((job) => job.status === "processing")) return;
    const timer = window.setInterval(() => void fetchJobs(), 5000);
    return () => window.clearInterval(timer);
  }, [jobsData, fetchJobs]);

  // ── Ctrl+V / Clipboard handler ────────────────────────────────────────
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      // Ignore if user is focused on textarea
      if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
      if ((e.target as HTMLElement).tagName === "INPUT") return;

      const items = e.clipboardData?.items;
      if (!items) return;

      // Check for image in clipboard
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            const imgFile = new File([blob], `clipboard-${Date.now()}.png`, { type: item.type });
            handleFilesSelected([imgFile]);
            return;
          }
        }
      }

      // Check for text in clipboard
      for (const item of Array.from(items)) {
        if (item.type === "text/plain") {
          item.getAsString((text) => {
            if (text.trim().length > 20) {
              setMode("text");
              setTextContent((prev) => (prev ? `${prev}\n\n${text}` : text));
            }
          });
          return;
        }
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // ── File selection ────────────────────────────────────────────────────
  const handleFilesSelected = (fList: File[]) => {
    setError("");
    setSuccess("");

    const validFiles = fList.filter(f => {
      const type = f.type === "image/jpg" ? "image/jpeg" : f.type;
      return ACCEPTED_TYPES.includes(type) || ACCEPTED_TYPES.includes(f.type);
    });

    if (validFiles.length === 0) {
      setError(`No valid files selected. Accepted: PDF, PNG, JPG, JPEG, WEBP`);
      return;
    }

    setFiles(prev => [...prev, ...validFiles]);
    setMode("file");

    const firstImg = validFiles.find(f => f.type.startsWith("image/"));
    if (!imagePreview && firstImg) {
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target?.result as string);
      reader.readAsDataURL(firstImg);
    }
  };

  // ── Drag & Drop ───────────────────────────────────────────────────────
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) handleFilesSelected(droppedFiles);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  // ── Submit ────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (mode === "text" && !textContent.trim()) {
      setError("Please paste or type some text to extract questions from.");
      return;
    }
    if (mode === "file" && files.length === 0) {
      setError("Please select or drop files.");
      return;
    }

    setUploading(true);
    let totalSuccessCount = 0;
    let totalSkippedCount = 0;

    try {
      const itemsToProcess = mode === "text" ? [null] : files;

      for (const currentFile of itemsToProcess) {
        // ── STAGE 1: Create import job ──────────────────────────────────
        let startRes: Response;
        let finalMode = mode;
        let finalFile = currentFile;
        if (mode === "file" && currentFile?.type.startsWith("image/")) {
          finalFile = await resizeImageIfNeeded(currentFile);
        }

        if (finalMode === "text") {
          startRes = await fetch("/api/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              textContent: textContent.trim(),
              sourceName: currentFile ? currentFile.name : "Manual Paste",
              fileName: currentFile ? currentFile.name : `Text Import — ${new Date().toLocaleDateString("en-IN")}`,
              ...(forcedCategory !== "Auto-Detect" && { forcedCategory }),
            }),
          });
        } else {
          const formData = new FormData();
          formData.append("file", finalFile!);
          formData.append("source", finalFile!.name);
          if (forcedCategory !== "Auto-Detect") formData.append("forcedCategory", forcedCategory);
          
          startRes = await fetch("/api/import", { method: "POST", body: formData });
        }

        const startJson = await startRes.json() as ImportStartResult & { error?: string; code?: string };

        if (!startRes.ok) {
          if (startJson.code === "DUPLICATE") {
            setError(prev => prev ? `${prev}\n⚠️ ${currentFile?.name ?? "File"} was already imported.` : `⚠️ ${currentFile?.name ?? "File"} was already imported.`);
          } else {
            setError(prev => prev ? `${prev}\n${startJson.error}` : (startJson.error ?? "Failed to start import."));
          }
          continue; // Skip to next file
        }

        const startData = startJson;
        setProcessing(true);

        // ── STAGE 2: Process (AI extraction) in chunks ────────────────────────────
        let pd: ProcessResult & { error?: string; code?: string; isCompleted?: boolean; background?: boolean } = {
          totalExtracted: 0,
          totalSkipped: 0,
          isCompleted: false,
        };

        while (!pd.isCompleted) {
          let processRes: Response;
            if (finalMode === "text" || finalFile?.type === "application/pdf") {
              processRes = await fetch(`/api/import/${startData.jobId}/process`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mimeType: finalFile?.type ?? "text/plain" }),
              });
            } else {
            const processForm = new FormData();
            processForm.append("file", finalFile!);
            processRes = await fetch(`/api/import/${startData.jobId}/process`, {
              method: "POST",
              body: processForm,
            });
          }

          pd = await processRes.json() as ProcessResult & { error?: string; code?: string; isCompleted?: boolean; background?: boolean };

          if (!processRes.ok) {
            if (pd.code === "AI_RATE_LIMIT") {
              setError("⚠️ AI daily limit reached. Your job is saved — questions will be extracted tomorrow.");
              setProcessing(false);
              void fetchJobs();
              return; // Stop everything if rate limit
            } else {
              setError(prev => prev ? `${prev}\n${pd.error}` : (pd.error ?? "Extraction failed."));
            }
            break; // Stop processing this file, move to next
          }

          if (pd.background) {
            setSuccess(`⚡ Your file has been queued for background processing! You can close this tab safely. The extraction will continue in the cloud.`);
            setFiles([]);
            setImagePreview(null);
            setTextContent("");
            setUploading(false);
            setProcessing(false);
            void fetchJobs();
            return;
          }

          // Refresh UI after each chunk
          void fetchJobs();
        }

        totalSuccessCount += pd.totalExtracted ?? 0;
        totalSkippedCount += pd.totalSkipped ?? 0;
      } // End of loop

      setSuccess(
        `✅ Finished processing! Extracted ${totalSuccessCount} question${totalSuccessCount !== 1 ? "s" : ""}!${totalSkippedCount > 0 ? ` (${totalSkippedCount} skipped — over limit)` : ""} Go to Review to approve them.`
      );
      
      // Reset form
      setFiles([]);
      setImagePreview(null);
      setTextContent("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUploading(false);
      setProcessing(false);
    }
  };

  const handleResume = async (jobId: number, mimeType: string) => {
    setProcessing(true);
    let pd: ProcessResult & { error?: string; code?: string; isCompleted?: boolean; background?: boolean } = { isCompleted: false, totalExtracted: 0, totalSkipped: 0 };
    setError("");
    setSuccess("");
    
    try {
      while (!pd.isCompleted) {
        const processRes = await fetch(`/api/import/${jobId}/process`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mimeType }),
        });
        
        const processJson = await processRes.json() as ProcessResult & { error?: string; code?: string; isCompleted?: boolean; background?: boolean };
        if (!processRes.ok) {
          if (processJson.code === "AI_RATE_LIMIT") {
            setError(`⚠️ AI rate limit reached. Job paused.`);
          } else {
            setError(`Error processing job: ${processJson.error}`);
          }
          break;
        }

        if (processJson.background) {
          setSuccess(`⚡ Your job has been queued for background processing! You can close this tab safely.`);
          setProcessing(false);
          await fetchJobs();
          return;
        }

        pd = processJson;
        await fetchJobs();
      }
      if (pd.isCompleted) {
        setSuccess(`✅ Job resumed and completed successfully! Extracted ${pd.totalExtracted} questions.`);
      }
    } catch (e) {
      setError("Network error while resuming job.");
    } finally {
      setProcessing(false);
      void fetchJobs();
    }
  };

  const clearFile = () => {
    setFiles([]);
    setImagePreview(null);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const statusColor = (s: string) =>
    s === "completed" ? "badge-green" : s === "failed" ? "badge-red" : s === "processing" ? "badge-blue" : "badge-gray";

  const isLoading = uploading || processing;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Import 📥</h1>
          <p className="page-subtitle">Paste text, upload a PDF, or add a screenshot to extract MCQs.</p>
        </div>
      </div>

      {/* ── Import Form ── */}
      <div className="card">
        {/* Mode Tabs */}
        <div className="tabs" style={{ marginBottom: 20 }}>
          <button
            className={`tab ${mode === "file" ? "active" : ""}`}
            onClick={() => setMode("file")}
            type="button"
          >
            📎 File / Screenshot
          </button>
          <button
            className={`tab ${mode === "text" ? "active" : ""}`}
            onClick={() => setMode("text")}
            type="button"
          >
            📝 Paste Text
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* File Mode */}
          {mode === "file" && (
            <>
              {/* Drop Zone */}
              <div
                className={`drop-zone ${dragging ? "dragging" : ""} ${files.length > 0 ? "has-file" : ""}`}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={() => setDragging(false)}
                onClick={() => files.length === 0 && fileInputRef.current?.click()}
              >
                {files.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, maxWidth: "100%" }}>
                      {files.map((f, i) => (
                        <div key={i} style={{ flexShrink: 0, width: 120, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 8, backgroundColor: "var(--surface-1)" }}>
                          {f.type.startsWith("image/") && i === 0 && imagePreview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imagePreview} alt="Preview" style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 4 }} />
                          ) : (
                            <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{f.type.startsWith("image/") ? "🖼️" : "📄"}</div>
                          )}
                          <div style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 4, fontWeight: 600 }}>{f.name}</div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{(f.size / 1024).toFixed(0)} KB</div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => { e.stopPropagation(); clearFile(); }}
                    >
                      ✕ Clear {files.length} file{files.length !== 1 ? "s" : ""}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 44 }}>📁</div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>
                      Paste Text, Upload PDF, or Add Screenshots
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      Drag & drop multiple files · Click to browse · <kbd style={{ padding: "2px 6px", background: "var(--surface-2)", borderRadius: 4, fontSize: 11 }}>Ctrl+V</kbd> to paste
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
                      {["PDF", "PNG", "JPG", "JPEG", "WEBP"].map((t) => (
                        <span key={t} style={{ padding: "3px 10px", background: "var(--surface-2)", borderRadius: "var(--radius-full)", fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_EXT}
                style={{ display: "none" }}
                onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length > 0) handleFilesSelected(fs); }}
              />
              {files.length === 0 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ alignSelf: "flex-start" }}
                >
                  📂 Browse Files
                </button>
              )}
            </>
          )}

          {/* Text Mode */}
          {mode === "text" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
                Paste your MCQs, study notes, or any exam content below:
              </label>
              <textarea
                className="input"
                placeholder={`Paste or type content here. Examples:\n\n1. Which gas is most abundant in Earth's atmosphere?\n   A) Oxygen   B) Nitrogen   C) Carbon Dioxide   D) Argon\n   Answer: B\n\nOr paste multiple questions at once.\nOr paste full exam PDFs you copied.`}
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                rows={12}
                style={{ fontFamily: "monospace", fontSize: 13, resize: "vertical", minHeight: 200 }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {textContent.length.toLocaleString()} characters · {textContent.split("\n").length} lines
                </span>
                {textContent && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTextContent("")}>
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}


          {/* Error / Success */}
          {error && (
            <div style={{ padding: "12px 16px", background: "#fff5f5", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", color: "var(--danger)", fontSize: 14 }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ padding: "12px 16px", background: "#f0fdf4", border: "1px solid var(--success)", borderRadius: "var(--radius-sm)", color: "var(--success)", fontSize: 14 }}>
              {success}
            </div>
          )}

          {/* Overrides */}
          <div style={{ display: "flex", gap: 12, marginTop: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>
                Force Subject / Category
              </label>
              <select
                className="input"
                value={forcedCategory}
                onChange={(e) => { setForcedCategory(e.target.value); }}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", backgroundColor: "var(--surface)" }}
              >
                <option value="Auto-Detect">✨ Auto-Detect</option>
                {VALID_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Submit */}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading || (mode === "file" ? files.length === 0 : !textContent.trim())}
            >
              {uploading ? (
                <><div className="spinner" /> Creating job…</>
              ) : processing ? (
                <><div className="spinner" /> Extracting with AI…</>
              ) : (
                "🚀 Extract Questions"
              )}
            </button>
            {isLoading && (
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
                {uploading ? "Uploading…" : "AI is analyzing your content. This may take 15–30 seconds."}
              </div>
            )}
          </div>
        </form>

        {/* Ctrl+V hint */}
        {mode === "file" && files.length === 0 && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text-muted)", display: "flex", gap: 8, alignItems: "center" }}>
            <span>💡</span>
            <span>
              <strong>Pro tip:</strong> Take a screenshot of any exam question and press{" "}
              <kbd style={{ padding: "1px 5px", background: "var(--border)", borderRadius: 3, fontSize: 11 }}>Ctrl+V</kbd>{" "}
              anywhere on this page to instantly import it.
            </span>
          </div>
        )}
      </div>

      {/* ── Job History ── */}
      <div className="card">
        <div className="card-header">
          <span className="section-title">📋 Import History</span>
          <button className="btn btn-ghost btn-sm" onClick={() => void fetchJobs()}>↺ Refresh</button>
        </div>

        {jobsLoading ? (
          <div className="skeleton" style={{ height: 88, marginTop: 12 }} />
        ) : jobsError ? (
          <div className="empty-state" style={{ padding: "28px 0" }}>
            <div className="empty-title">Import history unavailable</div>
            <div className="empty-desc">{jobsError}</div>
            <button className="btn btn-secondary btn-sm" onClick={() => { setJobsLoading(true); void fetchJobs(); }}>Retry</button>
          </div>
        ) : !jobsData || jobsData.jobs.length === 0 ? (
          <div className="empty-state" style={{ padding: "28px 0" }}>
            <div className="empty-icon">📭</div>
            <div className="empty-title">No imports yet</div>
            <div className="empty-desc">Upload a PDF, paste a screenshot, or type your MCQs above to get started.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {jobsData.jobs.slice(0, 5).map((job) => (
              <div key={job.id} className="job-card">
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>
                    {job.fileName.startsWith("Text Import") ? "📝" :
                     job.fileName.match(/\.(png|jpg|jpeg|webp)$/i) ? "🖼️" : "📄"}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {job.fileName}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      Job #{job.id} · {new Date(job.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      {job.totalPages > 1 ? ` · ${job.totalPages} pages` : ""}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <span className={`badge ${statusColor(job.status)}`}>{job.status}</span>
                    {job.status === "processing" && job.totalPages > 0 && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        Chunk {job.currentPage} / {job.totalPages}
                      </span>
                    )}
                  </div>
                  {job.extractedQuestions > 0 && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--primary)" }}>
                      {job.extractedQuestions} Qs
                    </span>
                  )}
                  {job.status === "completed" && (
                    <Link href={`/import/${job.id}/review`} className="btn btn-primary btn-sm">
                      Review →
                    </Link>
                  )}
                  {(job.status === "processing" || job.status === "paused") && (
                     <div style={{ display: "flex", gap: 8 }}>
                       {(job.status === "paused" || job.status === "processing") && (
                         <button
                           className="btn btn-secondary btn-sm"
                           style={{ padding: "0 8px" }}
                            onClick={() => handleResume(
                              job.id,
                              job.fileName.toLowerCase().endsWith(".pdf")
                                ? "application/pdf"
                                : "text/plain"
                            )}
                           disabled={processing}
                            title="Resume this import from its saved chunk"
                         >
                           ▶️ Resume
                         </button>
                       )}
                       {job.status === "processing" && (
                         <button
                           className="btn btn-ghost btn-sm"
                           style={{ color: "var(--danger)" }}
                           onClick={() => {
                              fetch(`/api/import/${job.id}/cancel`, { method: "POST" }).then(() => fetchJobs());
                           }}
                         >
                           Cancel
                         </button>
                       )}
                     </div>
                  )}
                  {job.status !== "processing" && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: "var(--danger)", padding: "0 6px" }}
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this job? You can then re-upload the same file.")) {
                          fetch(`/api/import/${job.id}`, { method: "DELETE" }).then(() => fetchJobs());
                        }
                      }}
                      title="Delete Job"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
