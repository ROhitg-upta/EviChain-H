"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { verifyFile, verifyByHash, type PublicVerifyResult } from "@/lib/api";

type ResultState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: PublicVerifyResult }
  | { status: "error"; message: string };

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(iso));
}

export default function PublicVerifyPage() {
  const [activeTab, setActiveTab] = useState<"file" | "hash">("file");
  const [file, setFile] = useState<File | null>(null);
  const [hashInput, setHashInput] = useState("");
  const [result, setResult] = useState<ResultState>({ status: "idle" });

  function reset() {
    setResult({ status: "idle" });
    setFile(null);
    setHashInput("");
  }

  async function handleFileSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setResult({ status: "loading" });
    try {
      const data = await verifyFile(file);
      setResult({ status: "done", data });
    } catch (err: unknown) {
      setResult({
        status: "error",
        message: err instanceof Error ? err.message : "Verification failed",
      });
    }
  }

  async function handleHashSubmit(e: FormEvent) {
    e.preventDefault();
    const h = hashInput.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(h)) {
      setResult({
        status: "error",
        message: "Invalid SHA-256 hash — must be exactly 64 hexadecimal characters (0–9, a–f).",
      });
      return;
    }
    setResult({ status: "loading" });
    try {
      const data = await verifyByHash(h);
      setResult({ status: "done", data });
    } catch (err: unknown) {
      setResult({
        status: "error",
        message: err instanceof Error ? err.message : "Lookup failed",
      });
    }
  }

  return (
    <main className="verify-shell">
      <header className="public-topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">E</span>
          <div>
            <strong>EviChain</strong>
            <small>Public verification portal</small>
          </div>
        </div>
        <nav className="case-nav" aria-label="Primary navigation">
          <a href="/">Dashboard</a>
          <a href="/evidence">Registry</a>
          <a href="/cases">Cases</a>
        </nav>
      </header>

      {/* Hero */}
      <section className="verify-hero">
        <p className="eyebrow">INDEPENDENT VERIFICATION</p>
        <h1>Verify evidence integrity</h1>
        <p className="verify-hero-sub">
          Check whether a file or hash matches a registered evidence record in the
          EviChain database. No account required.
        </p>
        <div className="verify-info" aria-label="How verification works">
          <span className="verify-info-icon" aria-hidden="true">ℹ</span>
          <p>
            <strong>How it works:</strong> When you upload a file, its SHA-256
            fingerprint is computed and compared against every registered evidence
            record. A match means the file is byte-for-byte identical to what was
            originally registered. A mismatch does not confirm tampering on its own —
            the file may simply be unregistered.
          </p>
        </div>
      </section>

      {/* Tabs */}
      <div className="login-tabs verify-tabs" role="tablist" aria-label="Verification method">
        <button
          className={`tab ${activeTab === "file" ? "active" : ""}`}
          role="tab"
          aria-selected={activeTab === "file"}
          aria-controls="verify-panel-file"
          id="verify-tab-file"
          onClick={() => { setActiveTab("file"); reset(); }}
        >
          Upload a file
        </button>
        <button
          className={`tab ${activeTab === "hash" ? "active" : ""}`}
          role="tab"
          aria-selected={activeTab === "hash"}
          aria-controls="verify-panel-hash"
          id="verify-tab-hash"
          onClick={() => { setActiveTab("hash"); reset(); }}
        >
          Enter a hash
        </button>
      </div>

      {/* File panel */}
      <div
        id="verify-panel-file"
        role="tabpanel"
        aria-labelledby="verify-tab-file"
        hidden={activeTab !== "file"}
      >
        <form className="verify-card" onSubmit={handleFileSubmit} aria-label="Verify file by upload">
          <h2>Upload the file to verify</h2>
          <p className="verify-card-desc">
            Select the original file. EviChain computes its SHA-256 fingerprint
            and checks it against every registered evidence record. The file is
            sent to our server for verification — it is never stored.
          </p>
          <label htmlFor="verify-file-pick" className="ev-file-pick-label">
            <input
              id="verify-file-pick"
              type="file"
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setFile(e.target.files?.[0] ?? null)
              }
              aria-label="Choose a file to verify"
            />
          </label>
          {file && (
            <p className="verify-file-info" aria-live="polite">
              Selected: <strong>{file.name}</strong>{" "}
              ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
          <button
            className="button button-primary button-full"
            type="submit"
            disabled={!file || result.status === "loading"}
            aria-disabled={!file || result.status === "loading"}
          >
            {result.status === "loading"
              ? <span className="loading-spinner">Verifying…</span>
              : "Verify file"}
          </button>
        </form>
      </div>

      {/* Hash panel */}
      <div
        id="verify-panel-hash"
        role="tabpanel"
        aria-labelledby="verify-tab-hash"
        hidden={activeTab !== "hash"}
      >
        <form className="verify-card" onSubmit={handleHashSubmit} aria-label="Verify by SHA-256 hash">
          <h2>Enter the SHA-256 hash</h2>
          <p className="verify-card-desc">
            Paste the 64-character hexadecimal fingerprint of the evidence file.
            The format is validated before the lookup is sent.
          </p>
          <div className="form-group">
            <label htmlFor="hash-input">SHA-256 fingerprint</label>
            <input
              id="hash-input"
              type="text"
              value={hashInput}
              onChange={(e) => setHashInput(e.target.value)}
              placeholder="9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
              maxLength={64}
              spellCheck={false}
              autoComplete="off"
              aria-describedby="hash-input-hint"
            />
            <small id="hash-input-hint" className="ev-field-hint">
              Exactly 64 hexadecimal characters (0–9, a–f)
            </small>
          </div>
          <button
            className="button button-primary button-full"
            type="submit"
            disabled={result.status === "loading"}
          >
            {result.status === "loading"
              ? <span className="loading-spinner">Checking…</span>
              : "Verify hash"}
          </button>
        </form>
      </div>

      {/* Result panel */}
      <section className="verify-result-section" aria-live="polite">
        {result.status === "idle" && (
          <div className="verify-result verify-result--idle">
            <p>Submit a file or hash above to see verification results.</p>
          </div>
        )}

        {result.status === "error" && (
          <div className="verify-result verify-result--error" role="alert">
            <strong>Verification error</strong>
            <p>{result.message}</p>
            <button className="button button-secondary small-button" onClick={reset}>
              Try again
            </button>
          </div>
        )}

        {result.status === "done" && !result.data.matched && (
          <div className="verify-result verify-result--fail">
            <div className="verify-result-icon" aria-hidden="true">✕</div>
            <h2>No matching record found</h2>
            <p>
              The SHA-256 fingerprint{" "}
              <code>{result.data.sha256.slice(0, 16)}…{result.data.sha256.slice(-8)}</code>{" "}
              does not match any registered evidence in the EviChain database.
            </p>
            <p className="verify-result-note">
              This could mean the file is unregistered, has been modified since
              registration, or is unrelated to any case on file.
            </p>
            <div className="verify-computed-hash">
              <span className="eyebrow">SUBMITTED SHA-256</span>
              <code>{result.data.sha256}</code>
            </div>
            <button className="button button-secondary small-button" onClick={reset}>
              Verify another
            </button>
          </div>
        )}

        {result.status === "done" && result.data.matched && result.data.evidence && (
          <div className="verify-result verify-result--match">
            <div className="verify-result-icon" aria-hidden="true">✓</div>
            <h2>Evidence integrity confirmed</h2>
            <p>
              This file matches a registered evidence record. The SHA-256
              fingerprint is identical to what was recorded at the time of
              registration.
            </p>

            <dl className="verify-match-meta">
              <div>
                <dt>Evidence name</dt>
                <dd>{result.data.evidence.name}</dd>
              </div>
              <div>
                <dt>File type</dt>
                <dd>{result.data.evidence.type}</dd>
              </div>
              <div>
                <dt>Owner organisation</dt>
                <dd>{result.data.evidence.ownerOrg}</dd>
              </div>
              <div>
                <dt>Registry status</dt>
                <dd>
                  <span
                    className={`status ${result.data.evidence.status.toLowerCase()}`}
                    aria-label={`Status: ${result.data.evidence.status}`}
                  >
                    <span aria-hidden="true" />
                    {result.data.evidence.status.charAt(0) +
                      result.data.evidence.status.slice(1).toLowerCase()}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Registered</dt>
                <dd>{fmtDate(result.data.evidence.registeredAt)}</dd>
              </div>
            </dl>

            <div className="verify-computed-hash">
              <span className="eyebrow">VERIFIED SHA-256</span>
              <code>{result.data.sha256}</code>
            </div>

            <div className="verify-result-actions">
              <a
                className="button button-primary small-button"
                href={`/evidence/${result.data.evidence.id}`}
              >
                View full record →
              </a>
              <button className="button button-secondary small-button" onClick={reset}>
                Verify another
              </button>
            </div>
          </div>
        )}
      </section>

      <footer className="public-footer">
        <p>
          EviChain public verification · No account required ·
          SHA-256 computed server-side from uploaded bytes
        </p>
      </footer>
    </main>
  );
}
