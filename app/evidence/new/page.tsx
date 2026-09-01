"use client";

import {
  ChangeEvent, DragEvent, FormEvent, useEffect, useRef, useState,
} from "react";
import { useAuth } from "../../auth-context";
import { getCases, uploadEvidence, type CaseRecord, type UploadEvidenceResult } from "@/lib/api";

const ACCEPTED_MIME = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/tiff",
  "video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip", "application/x-tar", "application/gzip",
  "text/plain", "text/csv",
  "application/octet-stream",
].join(",");

function fmtBytes(n: number) {
  if (n === 0) return "0 B";
  const k = 1024, s = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${(n / Math.pow(k, i)).toFixed(1)} ${s[i]}`;
}

function fileExt(name: string) {
  return name.split(".").pop()?.toUpperCase() ?? "FILE";
}

export default function NewEvidencePage() {
  const { user, loading: authLoading, accessToken, canEdit } = useAuth();

  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [casesError, setCasesError] = useState("");

  // Form state
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [name, setName] = useState("");
  const [caseId, setCaseId] = useState("");
  const [ownerOrg, setOwnerOrg] = useState("Digital Forensics");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");

  // Upload state
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<UploadEvidenceResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !user) window.location.replace("/login");
  }, [authLoading, user]);

  useEffect(() => {
    if (!accessToken) return;
    getCases(accessToken)
      .then(setCases)
      .catch(() => {
        // Non-blocking — case linking is optional
        setCasesError("Cases not available — you can upload without linking to a case.");
      });
  }, [accessToken]);

  function applyFile(f: File) {
    if (f.size > 50 * 1024 * 1024) {
      setError("File is too large — maximum size is 50 MB.");
      return;
    }
    setFile(f);
    if (!name.trim()) setName(f.name);
    setError("");
  }

  function handleInput(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) applyFile(f);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) applyFile(f);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file || !accessToken) return;

    setUploading(true);
    setProgress(0);
    setError("");

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name.trim() || file.name);
      fd.append("type", fileExt(file.name));
      fd.append("ownerOrg", ownerOrg);
      fd.append("caseId", caseId);
      if (description.trim()) fd.append("description", description.trim());
      if (tags.trim()) fd.append("tags", tags.trim());

      const res = await uploadEvidence(accessToken, fd, setProgress);
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function resetForm() {
    setFile(null);
    setName("");
    setCaseId("");
    setDescription("");
    setTags("");
    setProgress(0);
    setResult(null);
    setError("");
  }

  if (authLoading) return <main className="evidence-shell"><p className="ev-loading">Loading…</p></main>;

  // ── Success screen ───────────────────────────────────────────────
  if (result) {
    return (
      <main className="evidence-shell">
        <header className="ev-topbar">
          <a className="ev-brand" href="/"><span className="brand-mark">E</span>
            <span><strong>EviChain</strong><small>Evidence workspace</small></span>
          </a>
        </header>
        <div className="upload-success-card" role="main" aria-live="polite">
          <div className="upload-success-icon" aria-hidden="true">✓</div>
          <h1>Evidence registered</h1>
          <p className="ev-page-sub">File uploaded and SHA-256 fingerprint computed server-side.</p>

          <dl className="upload-success-meta">
            <div>
              <dt>Evidence ID</dt>
              <dd><code>{result.id}</code></dd>
            </div>
            <div>
              <dt>Filename</dt>
              <dd>{result.name}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{fmtBytes(result.sizeBytes)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span className="status pending"><span />Pending verification</span>
              </dd>
            </div>
          </dl>

          <div className="upload-hash-box">
            <span className="eyebrow">SHA-256 FINGERPRINT</span>
            <code>{result.sha256}</code>
          </div>

          <div className="upload-success-actions">
            <a className="button button-primary" href={`/evidence/${result.id}`}>
              View evidence record →
            </a>
            <a className="button button-secondary" href="/evidence">
              Back to registry
            </a>
            <button className="button button-secondary" type="button" onClick={resetForm}>
              Upload another file
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── Upload form ──────────────────────────────────────────────────
  return (
    <main className="evidence-shell">
      <header className="ev-topbar">
        <a className="ev-brand" href="/">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span><strong>EviChain</strong><small>Evidence workspace</small></span>
        </a>
        <nav className="ev-nav">
          <a href="/evidence">← Registry</a>
          <a href="/case">Cases</a>
        </nav>
      </header>

      <div className="page-header">
        <div>
          <p className="eyebrow">EVIDENCE REGISTRY</p>
          <h1>Upload new evidence</h1>
          <p className="ev-page-sub">
            SHA-256 fingerprint is computed server-side from the original bytes.
          </p>
        </div>
        <a className="button button-secondary" href="/evidence">Cancel</a>
      </div>

      {!canEdit && (
        <div className="readonly-banner" role="alert">
          Auditor mode — evidence upload is disabled.
        </div>
      )}

      {casesError && <p className="ev-warning">{casesError}</p>}

      <form
        className="upload-form"
        onSubmit={handleSubmit}
        aria-label="Upload evidence form"
        noValidate
      >
        {/* Drop zone */}
        <div
          className={`file-dropzone${dragging ? " file-dropzone--over" : ""}${file ? " file-dropzone--filled" : ""}`}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label={file ? `Selected file: ${file.name}. Click to change.` : "Click or drag a file here to upload"}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_MIME}
            className="sr-only"
            onChange={handleInput}
            aria-hidden="true"
            tabIndex={-1}
          />
          {file ? (
            <div className="file-selected">
              <span className="file-type-badge" aria-hidden="true">{fileExt(file.name)}</span>
              <div className="file-selected-info">
                <strong>{file.name}</strong>
                <small>{fmtBytes(file.size)} · Click to change</small>
              </div>
              <button
                type="button"
                className="file-remove-btn"
                aria-label="Remove selected file"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  setName("");
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              >
                ✕ Remove
              </button>
            </div>
          ) : (
            <div className="file-dropzone-prompt">
              <span className="file-drop-icon" aria-hidden="true">↑</span>
              <strong>Drop file here, or click to browse</strong>
              <small>Images, videos, PDFs, Word, Excel, archives · Max 50 MB</small>
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="upload-section">
          <h2>Evidence details</h2>
          <div className="upload-fields">
            <div className="form-group">
              <label htmlFor="ev-name">Evidence name <span aria-hidden="true">*</span></label>
              <input
                id="ev-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. incident-recording-2026.mp4"
                required
                aria-required="true"
              />
            </div>

            <div className="form-group">
              <label htmlFor="ev-case">
                Linked case <span aria-hidden="true">*</span>
                <span className="ev-field-required"> (required)</span>
              </label>
              <select
                id="ev-case"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                required
                aria-required="true"
              >
                <option value="">— Select a case —</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.status})
                  </option>
                ))}
              </select>
              {cases.length === 0 && !casesError && (
                <small className="ev-field-hint">
                  No cases found.{" "}
                  <a href="/case">Create a case first →</a>
                </small>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="ev-owner">Owner organisation</label>
              <select
                id="ev-owner"
                value={ownerOrg}
                onChange={(e) => setOwnerOrg(e.target.value)}
              >
                <option>Digital Forensics</option>
                <option>Security Operations</option>
                <option>Legal Review</option>
                <option>Incident Response</option>
                <option>External Examiner</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="ev-description">Description</label>
              <textarea
                id="ev-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the evidence and its relevance…"
                rows={3}
                maxLength={2000}
              />
            </div>

            <div className="form-group">
              <label htmlFor="ev-tags">Tags</label>
              <input
                id="ev-tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g. network-log, endpoint, malware (comma-separated)"
                maxLength={500}
              />
              <small className="ev-field-hint">Comma-separated keywords for filtering</small>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="error-message" role="alert" aria-live="assertive">
            {error}
          </div>
        )}

        {/* Progress bar */}
        {uploading && (
          <div className="upload-progress" role="status" aria-live="polite">
            <div className="upload-progress-track">
              <div
                className="upload-progress-bar"
                style={{ width: `${progress}%` }}
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                role="progressbar"
                aria-label={`Upload progress: ${progress}%`}
              />
            </div>
            <span>{progress}% uploaded</span>
          </div>
        )}

        <div className="upload-form-actions">
          <button
            className="button button-primary"
            type="submit"
            disabled={uploading || !canEdit || !file}
            aria-disabled={uploading || !canEdit || !file}
          >
            {uploading
              ? <span className="loading-spinner">Uploading…</span>
              : "Register evidence"}
          </button>
          <a className="button button-secondary" href="/evidence">Cancel</a>
        </div>

        {!file && (
          <p className="ev-field-hint" role="note">
            Select a file to enable upload.
          </p>
        )}
      </form>
    </main>
  );
}
