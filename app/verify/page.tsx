"use client";

import { ChangeEvent, DragEvent, FormEvent, useState } from "react";
import { verifyEvidenceFile, verifyEvidenceHash, type PublicVerifyResult } from "@/lib/api";

type ResultState =
  | { status: "idle" }
  | { status: "loading"; mode: "file" | "hash"; progress?: number }
  | { status: "done"; data: PublicVerifyResult }
  | { status: "error"; message: string };

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function fmtBytes(bytes?: number) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

async function computeBrowserSha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function PublicVerifyPage() {
  const [activeTab, setActiveTab] = useState<"hash" | "file">("hash");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [hashInput, setHashInput] = useState("");
  const [clientComputedHash, setClientComputedHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<ResultState>({ status: "idle" });

  function reset() {
    setResult({ status: "idle" });
    setFile(null);
    setHashInput("");
    setClientComputedHash(null);
    setCopied(false);
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      const clean = text.trim();
      setHashInput(clean);
    } catch {
      // ignore clipboard error
    }
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  }

  async function handleHashSubmit(e: FormEvent) {
    e.preventDefault();
    const h = hashInput.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(h)) {
      setResult({
        status: "error",
        message: "Invalid SHA-256 fingerprint — must be exactly 64 hexadecimal characters (0–9, a–f).",
      });
      return;
    }
    setResult({ status: "loading", mode: "hash" });
    try {
      const res = await verifyEvidenceHash(h);
      setResult({ status: "done", data: res });
    } catch (err: unknown) {
      setResult({
        status: "error",
        message: err instanceof Error ? err.message : "Verification lookup failed",
      });
    }
  }

  async function handleFileSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      setResult({
        status: "error",
        message: "File exceeds 50MB verification limit.",
      });
      return;
    }

    setResult({ status: "loading", mode: "file", progress: 0 });

    try {
      // 1. Fast client-side hash calculation for instantaneous verification preview
      computeBrowserSha256(file)
        .then((browserHash) => setClientComputedHash(browserHash))
        .catch(() => {});

      // 2. Authoritative server verification
      const res = await verifyEvidenceFile(file, (pct) => {
        setResult((prev) =>
          prev.status === "loading" ? { ...prev, progress: pct } : prev,
        );
      });

      setResult({ status: "done", data: res });
    } catch (err: unknown) {
      setResult({
        status: "error",
        message: err instanceof Error ? err.message : "File verification failed",
      });
    }
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setResult({ status: "idle" });
      setClientComputedHash(null);
    }
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setFile(f);
      setResult({ status: "idle" });
      setClientComputedHash(null);
    }
  }

  const cleanHash = hashInput.trim();
  const isValidHex = /^[a-f0-9]{0,64}$/i.test(cleanHash);
  const isFullLength = cleanHash.length === 64;

  return (
    <main style={{ minHeight: "100vh", background: "var(--surface-base)", color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
      {/* Navigation Header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", borderBottom: "1px solid var(--border-default)", background: "var(--surface-raised)" }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "var(--text-primary)" }} aria-label="EviChain home">
          <span style={{ width: 32, height: 32, display: "grid", placeItems: "center", background: "var(--brand-600)", color: "var(--neutral-50)", borderRadius: "var(--radius-md)", fontSize: 16, fontWeight: 800 }}>E</span>
          <div>
            <strong style={{ fontSize: "var(--text-md)", fontWeight: 700, letterSpacing: "var(--tracking-tight)" }}>EviChain</strong>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--brand-600)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Public Evidence Verification
            </div>
          </div>
        </a>
        <nav style={{ display: "flex", gap: 16, fontSize: "var(--text-sm)" }}>
          <a href="/" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>Home</a>
          <a href="/login" className="btn btn-secondary btn-sm">Sign In →</a>
        </nav>
      </header>

      {/* Main Container */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 80px" }}>
        {/* Header Hero */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <p className="eyebrow" style={{ color: "var(--brand-600)", marginBottom: 8 }}>INTEGRITY CHECKPOINT</p>
          <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 800, letterSpacing: "var(--tracking-tight)", color: "var(--text-primary)" }}>
            Verify Evidence Integrity
          </h1>
          <p style={{ margin: "12px auto 0", maxWidth: 540, fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Confirm whether a digital file or cryptographic fingerprint matches an authentic, registered EviChain evidence record. No account required.
          </p>
        </div>

        {/* Console Box */}
        <div className="verify-console">
          {/* Tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid var(--border-default)" }} role="tablist">
            <button
              onClick={() => { setActiveTab("hash"); reset(); }}
              role="tab"
              aria-selected={activeTab === "hash"}
              className={`btn ${activeTab === "hash" ? "btn-primary" : "btn-secondary"} btn-md`}
              style={{ flex: 1 }}
            >
              # Verify SHA-256 Hash
            </button>
            <button
              onClick={() => { setActiveTab("file"); reset(); }}
              role="tab"
              aria-selected={activeTab === "file"}
              className={`btn ${activeTab === "file" ? "btn-primary" : "btn-secondary"} btn-md`}
              style={{ flex: 1 }}
            >
              📁 Verify File Upload
            </button>
          </div>

          {/* Mode A: Hash Verification */}
          {activeTab === "hash" && (
            <form onSubmit={handleHashSubmit} aria-label="Verify SHA-256 hash">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)" }}>
                  SHA-256 Fingerprint (64 hexadecimal characters)
                </label>
                <button
                  type="button"
                  onClick={handlePaste}
                  style={{ background: "none", border: "none", color: "var(--brand-600)", fontSize: "var(--text-xs)", cursor: "pointer", fontWeight: 600 }}
                >
                  Paste from clipboard
                </button>
              </div>

              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  value={hashInput}
                  onChange={(e) => setHashInput(e.target.value)}
                  placeholder="e.g. e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
                  maxLength={64}
                  spellCheck={false}
                  autoComplete="off"
                  className="input"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    letterSpacing: "0.04em",
                    paddingRight: 70,
                    borderColor: cleanHash && (!isValidHex || !isFullLength) ? "var(--accent-pending)" : undefined,
                  }}
                />
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontFamily: "var(--font-mono)", fontSize: 11, color: isFullLength ? "var(--accent-verified)" : "var(--text-disabled)" }}>
                  {cleanHash.length}/64
                </span>
              </div>

              {cleanHash && !isValidHex && (
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--accent-danger)" }}>
                  Contains invalid non-hexadecimal characters.
                </p>
              )}

              <button
                type="submit"
                disabled={!isFullLength || !isValidHex || result.status === "loading"}
                className="btn btn-primary btn-lg btn-full"
                style={{ marginTop: 20 }}
              >
                {result.status === "loading" ? "Searching evidence ledger…" : "Verify cryptographic hash"}
              </button>
            </form>
          )}

          {/* Mode B: File Verification */}
          {activeTab === "file" && (
            <form onSubmit={handleFileSubmit} aria-label="Verify file by upload">
              <div
                className={`verify-dropzone ${dragActive ? "drag-active" : ""}`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => document.getElementById("file-verify-input")?.click()}
              >
                <input
                  id="file-verify-input"
                  type="file"
                  style={{ display: "none" }}
                  onChange={onFileChange}
                />
                <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.8 }}>📁</div>
                <strong style={{ display: "block", color: "var(--text-primary)", fontSize: "var(--text-md)", marginBottom: 4 }}>
                  {file ? file.name : "Drag & drop an evidence file here"}
                </strong>
                <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
                  {file ? `${fmtBytes(file.size)} · Click to change file` : "or browse from your device (up to 50MB)"}
                </p>
              </div>

              {file && clientComputedHash && (
                <div style={{ marginTop: 16, padding: "12px 16px", background: "var(--surface-sunken)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                  <span className="eyebrow" style={{ display: "block", marginBottom: 4, color: "var(--text-secondary)" }}>LOCAL DIGEST COMPUTED</span>
                  <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--neutral-400)", wordBreak: "break-all" }}>{clientComputedHash}</code>
                </div>
              )}

              <button
                type="submit"
                disabled={!file || result.status === "loading"}
                className="btn btn-primary btn-lg btn-full"
                style={{ marginTop: 20 }}
              >
                {result.status === "loading" ? "Computing SHA-256 & checking registry…" : "Verify file integrity"}
              </button>
            </form>
          )}
        </div>

        {/* Verification Results Panel */}
        <section style={{ marginTop: 28 }} aria-live="polite">
          {result.status === "loading" && (
            <div style={{ padding: "36px 20px", background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", textAlign: "center" }} className="scanline">
              <div style={{ width: 40, height: 40, margin: "0 auto 16px", border: "3px solid var(--border-default)", borderTopColor: "var(--brand-500)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <strong style={{ color: "var(--text-primary)", fontSize: "var(--text-md)", display: "block" }}>
                Verifying Against EviChain Evidence Ledger
              </strong>
              <p style={{ margin: "6px 0 0", fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
                Validating cryptographic checksum against registered records...
              </p>
            </div>
          )}

          {result.status === "error" && (
            <div role="alert" style={{ padding: 24, background: "var(--accent-danger-dim)", border: "1px solid var(--accent-danger-border)", borderRadius: "var(--radius-md)", textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 8, color: "var(--accent-danger)" }}>⚠</div>
              <strong style={{ display: "block", color: "var(--accent-danger)", fontSize: "var(--text-md)", marginBottom: 6 }}>Verification Error</strong>
              <p style={{ margin: "0 0 16px", fontSize: "var(--text-sm)", color: "var(--accent-danger)", opacity: 0.9 }}>{result.message}</p>
              <button className="btn btn-secondary btn-sm" onClick={reset}>Try Again</button>
            </div>
          )}

          {result.status === "done" && !result.data.verified && !result.data.matched && (
            <div style={{ padding: 32, background: "var(--surface-raised)", border: "1px solid var(--accent-danger-border)", borderRadius: "var(--radius-md)", textAlign: "center" }}>
              <div className="verify-result-badge verify-not-found" style={{ marginBottom: 16 }}>
                ✕ Not Found in Ledger
              </div>
              <h2 style={{ margin: "0 0 8px", fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--text-primary)" }}>
                No Matching Evidence Record
              </h2>
              <p style={{ margin: "0 auto 20px", maxWidth: 460, fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                The cryptographic SHA-256 fingerprint does not match any registered evidence record in this EviChain environment. This indicates the file is uncertified, altered, or was not registered.
              </p>

              <div style={{ padding: 16, background: "var(--surface-sunken)", borderRadius: "var(--radius-md)", textAlign: "left", marginBottom: 20 }}>
                <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>SUBMITTED SHA-256</span>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--neutral-400)", wordBreak: "break-all" }}>{result.data.sha256}</code>
              </div>

              <button className="btn btn-secondary btn-md" onClick={reset}>Verify Another Item</button>
            </div>
          )}

          {result.status === "done" && (result.data.verified || result.data.matched) && result.data.evidence && (
            <div style={{ padding: 32, background: "var(--surface-raised)", border: "1px solid var(--accent-verified-border)", borderRadius: "var(--radius-md)" }}>
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div className="verify-result-badge verify-verified" style={{ marginBottom: 16 }}>
                  ✓ Cryptographic Integrity Confirmed
                </div>
                <h2 style={{ margin: "0 0 6px", fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--text-primary)" }}>
                  Authentic Evidence Record
                </h2>
                <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                  This fingerprint precisely matches a registered item in the official EviChain chain-of-custody ledger.
                </p>
              </div>

              {/* Public metadata */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16, padding: "20px 0", borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)" }}>
                <div>
                  <span className="eyebrow" style={{ display: "block", marginBottom: 4 }}>EVIDENCE NAME</span>
                  <strong style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>{result.data.evidence.name || result.data.evidence.filename}</strong>
                </div>
                <div>
                  <span className="eyebrow" style={{ display: "block", marginBottom: 4 }}>CATEGORY</span>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>{result.data.evidence.type || result.data.evidence.fileType}</span>
                </div>
                <div>
                  <span className="eyebrow" style={{ display: "block", marginBottom: 4 }}>ORIGINATING ORG</span>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>{result.data.evidence.ownerOrg}</span>
                </div>
                <div>
                  <span className="eyebrow" style={{ display: "block", marginBottom: 4 }}>FILE SIZE</span>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>{fmtBytes(result.data.evidence.fileSize || result.data.evidence.sizeBytes)}</span>
                </div>
                <div>
                  <span className="eyebrow" style={{ display: "block", marginBottom: 4 }}>STATUS</span>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--accent-verified)", fontWeight: 600 }}>{result.data.evidence.status}</span>
                </div>
                <div>
                  <span className="eyebrow" style={{ display: "block", marginBottom: 4 }}>REGISTERED AT</span>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>{fmtDate(result.data.evidence.registeredAt)}</span>
                </div>
              </div>

              {/* Fingerprint block */}
              <div style={{ margin: "20px 0", padding: 16, background: "var(--surface-sunken)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span className="eyebrow" style={{ color: "var(--accent-verified)" }}>VERIFIED SHA-256 CHECKSUM</span>
                  <button
                    onClick={() => handleCopy(result.data.sha256)}
                    style={{ background: "none", border: "none", color: "var(--brand-500)", fontSize: 11, cursor: "pointer", fontWeight: 600 }}
                  >
                    {copied ? "✓ Copied" : "Copy Checksum"}
                  </button>
                </div>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--neutral-400)", wordBreak: "break-all", lineHeight: 1.6 }}>
                  {result.data.sha256}
                </code>
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <a className="btn btn-primary btn-md" href={`/evidence/${result.data.evidence.id}`}>
                  View Authenticated Record →
                </a>
                <button className="btn btn-secondary btn-md" onClick={reset}>
                  Verify Another Item
                </button>
              </div>
            </div>
          )}
        </section>

        {/* 3-Step Verification Protocol */}
        <section style={{ marginTop: 56, paddingTop: 36, borderTop: "1px solid var(--border-default)" }}>
          <h3 style={{ textAlign: "center", fontSize: "var(--text-md)", fontWeight: 700, color: "var(--text-primary)", marginBottom: 24 }}>
            How EviChain Verification Works
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 18 }}>
            {[
              { num: "01", title: "Calculate Fingerprint", desc: "Computes a collision-resistant 256-bit cryptographic digest from the raw binary stream." },
              { num: "02", title: "Query Vault Ledger", desc: "Compares the fingerprint against immutable evidence records registered by authorized investigators." },
              { num: "03", title: "Confirm Chain of Custody", desc: "Validates tamper-free state and returns court-admissible public integrity confirmation." },
            ].map((step) => (
              <div key={step.num} style={{ padding: 20, background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--brand-600)", display: "block", marginBottom: 6 }}>{step.num}</span>
                <strong style={{ color: "var(--text-primary)", fontSize: "var(--text-sm)", display: "block", marginBottom: 4 }}>{step.title}</strong>
                <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>{step.desc}</p>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24, padding: "14px 18px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", textAlign: "center", fontSize: 11, color: "var(--text-disabled)" }}>
            🔒 <strong>Privacy Guarantee:</strong> Uploaded verification binaries are processed in-memory solely to compute checksums. No file bytes or personal identifiers are stored or retained on disk.
          </div>
        </section>
      </div>
    </main>
  );
}
