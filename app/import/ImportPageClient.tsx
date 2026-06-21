"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { VALID_CATEGORIES, VALID_CHAPTERS_BY_CATEGORY } from "@/db/schema";

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
async function extractTextFromPDF(file: File): Promise<string> {
  // @ts-ignore
  if (!window.pdfjsLib) {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    document.head.appendChild(script);
    await new Promise((resolve) => {
      script.onload = resolve;
    });
    // @ts-ignore
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  // @ts-ignore
  const pdfjsLib = window.pdfjsLib;
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(" ");
    fullText += pageText + "\n\n";
  }
  
  return fullText.trim();
}

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
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [textContent, setTextContent] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [forcedCategory, setForcedCategory] = useState("Auto-Detect");
  const [forcedChapter, setForcedChapter] = useState("Auto-Detect");

  // ── Jobs list ─────────────────────────────────────────────────────────
  const [jobsData, setJobsData] = useState<JobsData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchJobs = useCallback(async () => {
    const r = await fetch("/api/import");
    if (r.ok) setJobsData(await r.json() as JobsData);
  }, []);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

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
            handleFileSelected(imgFile);
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
  const handleFileSelected = (f: File) => {
    setError("");
    setSuccess("");

    const type = f.type === "image/jpg" ? "image/jpeg" : f.type;
    if (!ACCEPTED_TYPES.includes(type) && !ACCEPTED_TYPES.includes(f.type)) {
      setError(`Unsupported file type: ${f.type}. Accepted: PDF, PNG, JPG, JPEG, WEBP`);
      return;
    }

    setFile(f);
    setMode("file");

    // Generate preview for images
    if (type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setImagePreview(null);
    }
  };

  // ── Drag & Drop ───────────────────────────────────────────────────────
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelected(f);
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
    if (mode === "file" && !file) {
      setError("Please select or drop a file.");
      return;
    }

    setUploading(true);
    let startData: ImportStartResult;

    try {
      // ── STAGE 1: Create import job ──────────────────────────────────
      let startRes: Response;
      let finalMode = mode;
      let finalFile = file;
      let extractedPdfText = "";

      // Bypass Vercel 4.5MB limit by extracting PDF text locally
      if (mode === "file" && file?.type === "application/pdf") {
        setUploading(true);
        // Show user we are doing local parsing
        extractedPdfText = await extractTextFromPDF(file);
        finalMode = "text";
      } else if (mode === "file" && file?.type.startsWith("image/")) {
        setUploading(true);
        finalFile = await resizeImageIfNeeded(file);
      }

      if (finalMode === "text") {
        startRes = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            textContent: extractedPdfText || textContent.trim(),
            sourceName: file ? file.name : "Manual Paste",
            fileName: file ? file.name : `Text Import — ${new Date().toLocaleDateString("en-IN")}`,
            ...(forcedCategory !== "Auto-Detect" && { forcedCategory }),
            ...(forcedChapter !== "Auto-Detect" && { forcedChapter }),
          }),
        });
      } else {
        const formData = new FormData();
        formData.append("file", finalFile!);
        formData.append("source", finalFile!.name);
        if (forcedCategory !== "Auto-Detect") formData.append("forcedCategory", forcedCategory);
        if (forcedChapter !== "Auto-Detect") formData.append("forcedChapter", forcedChapter);
        
        startRes = await fetch("/api/import", { method: "POST", body: formData });
      }

      const startJson = await startRes.json() as ImportStartResult & { error?: string; code?: string };

      if (!startRes.ok) {
        if (startJson.code === "DUPLICATE") {
          setError("⚠️ This file was already imported. No duplicate created.");
        } else {
          setError(startJson.error ?? "Failed to start import.");
        }
        setUploading(false);
        return;
      }

      startData = startJson;
      setUploading(false);
      setProcessing(true);

      // ── STAGE 2: Process (AI extraction) ────────────────────────────
      let processRes: Response;

      if (finalMode === "text") {
        processRes = await fetch(`/api/import/${startData.jobId}/process`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ textContent: extractedPdfText || textContent.trim() }),
        });
      } else {
        const processForm = new FormData();
        processForm.append("file", finalFile!);
        processRes = await fetch(`/api/import/${startData.jobId}/process`, {
          method: "POST",
          body: processForm,
        });
      }

      const pd = await processRes.json() as ProcessResult & { error?: string; code?: string };

      if (!processRes.ok) {
        if (pd.code === "AI_RATE_LIMIT") {
          setError("⚠️ AI daily limit reached. Your job is saved — questions will be extracted tomorrow.");
        } else {
          setError(pd.error ?? "Extraction failed.");
        }
      } else {
        setSuccess(
          `✅ Extracted ${pd.totalExtracted} question${pd.totalExtracted !== 1 ? "s" : ""}!${pd.totalSkipped > 0 ? ` (${pd.totalSkipped} skipped — over limit)` : ""} Go to Review to approve them.`
        );
        // Reset form
        setFile(null);
        setImagePreview(null);
        setTextContent("");
      }

      void fetchJobs();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUploading(false);
      setProcessing(false);
    }
  };

  const clearFile = () => {
    setFile(null);
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
                className={`drop-zone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={() => setDragging(false)}
                onClick={() => !file && fileInputRef.current?.click()}
              >
                {file ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                    {imagePreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imagePreview}
                        alt="Preview"
                        style={{ maxHeight: 200, maxWidth: "100%", borderRadius: "var(--radius-md)", objectFit: "contain" }}
                      />
                    ) : (
                      <div style={{ fontSize: 40 }}>📄</div>
                    )}
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{file.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {(file.size / 1024).toFixed(0)} KB · {file.type}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => { e.stopPropagation(); clearFile(); }}
                    >
                      ✕ Remove
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 44 }}>📁</div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>
                      Paste Text, Upload PDF, or Add Screenshot
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      Drag & drop here · Click to browse · <kbd style={{ padding: "2px 6px", background: "var(--surface-2)", borderRadius: 4, fontSize: 11 }}>Ctrl+V</kbd> to paste screenshot
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
                accept={ACCEPTED_EXT}
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); }}
              />
              {!file && (
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
          <div style={{ display: "flex", gap: 16, marginTop: 16, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>
                Force Subject / Category
              </label>
              <select
                className="input"
                value={forcedCategory}
                onChange={(e) => { setForcedCategory(e.target.value); setForcedChapter("Auto-Detect"); }}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", backgroundColor: "var(--surface)" }}
              >
                <option value="Auto-Detect">✨ Auto-Detect</option>
                {VALID_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>
                Force Chapter / Section
              </label>
              <select
                className="input"
                value={forcedChapter}
                onChange={(e) => setForcedChapter(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", backgroundColor: "var(--surface)" }}
                disabled={forcedCategory === "Auto-Detect"}
              >
                <option value="Auto-Detect">✨ Auto-Detect</option>
                {forcedCategory !== "Auto-Detect" && VALID_CHAPTERS_BY_CATEGORY[forcedCategory as keyof typeof VALID_CHAPTERS_BY_CATEGORY]?.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Overrides */}
          <div style={{ display: "flex", gap: 16, marginTop: 16, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>
                Force Subject / Category
              </label>
              <select
                className="input"
                value={forcedCategory}
                onChange={(e) => { setForcedCategory(e.target.value); setForcedChapter("Auto-Detect"); }}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", backgroundColor: "var(--surface)" }}
              >
                <option value="Auto-Detect">✨ Auto-Detect</option>
                {VALID_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>
                Force Chapter / Section
              </label>
              <select
                className="input"
                value={forcedChapter}
                onChange={(e) => setForcedChapter(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", backgroundColor: "var(--surface)" }}
                disabled={forcedCategory === "Auto-Detect"}
              >
                <option value="Auto-Detect">✨ Auto-Detect</option>
                {forcedCategory !== "Auto-Detect" && VALID_CHAPTERS_BY_CATEGORY[forcedCategory as keyof typeof VALID_CHAPTERS_BY_CATEGORY]?.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Submit */}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading || (mode === "file" ? !file : !textContent.trim())}
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
        {mode === "file" && !file && (
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

        {!jobsData || jobsData.jobs.length === 0 ? (
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
