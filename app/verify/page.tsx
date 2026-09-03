"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { verifyFile, verifyByHash, type PublicVerifyResult } from "@/lib/api";

type ResultState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: PublicVerifyResult }
  | { status: "error"; message: string };

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export default function PublicVerifyPage() {
  const [activeTab, setActiveTab] = useState<"file" | "hash">("file");
  const [file, setFile] = useState<File | null>(null);
  const [hashInput, setHashInput] = useState("");
  const [result, setResult] = useState<ResultState>({ status: "idle" });

  function reset() { setResult({ status: "idle" }); setFile(null); setHashInput(""); }

  async function handleFileSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setResult({ status: "loading" });
    try { setResult({ status: "done", data: await verifyFile(file) }); }
    catch (err: unknown) { setResult({ status: "error", message: err instanceof Error ? err.message : "Verification failed" }); }
  }

  async function handleHashSubmit(e: FormEvent) {
    e.preventDefault();
    const h = hashInput.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(h)) {
      setResult({ status: "error", message: "Invalid SHA-256 hash — must be exactly 64 hexadecimal characters (0–9, a–f)." });
      return;
    }
    setResult({ status: "loading" });
    try { setResult({ status: "done", data: await verifyByHash(h) }); }
    catch (err: unknown) { setResult({ status: "error", message: err instanceof Error ? err.message : "Lookup failed" }); }
  }

  const s = {
    root: { minHeight: "100vh", background: "var(--surface-base)", color: "var(--text-primary)", fontFamily: "var(--font-sans)" } as React.CSSProperties,
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", borderBottom: "1px solid var(--border-default)" } as React.CSSProperties,
    brand: { display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "var(--text-primary)" } as React.CSSProperties,
    mark: { width: 32, height: 32, display: "grid", placeItems: "center", background: "var(--brand-600)", color: "var(--neutral-50)", borderRadius: "var(--radius-md)", fontSize: 16, fontWeight: 800 } as React.CSSProperties,
    container: { maxWidth: 640, margin: "0 auto", padding: "48px 24px" } as React.CSSProperties,
    card: { background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: 28 } as React.CSSProperties,
    tab: (active: boolean): React.CSSProperties => ({
      padding: "10px 20px", background: active ? "var(--surface-raised)" : "transparent",
      border: active ? "1px solid var(--border-default)" : "1px solid transparent",
      borderBottom: active ? "1px solid var(--surface-raised)" : "1px solid var(--border-default)",
      borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
      color: active ? "var(--text-primary)" : "var(--text-secondary)",
      fontWeight: active ? 600 : 400, fontSize: "var(--text-sm)", cursor: "pointer",
      fontFamily: "var(--font-sans)", marginBottom: -1,
    }),
  };

  return (
    <main style={s.root}>
      {/* Header */}
      <header style={s.header}>
        <a href="/" style={s.brand} aria-label="EviChain home">
          <span style={s.mark} aria-hidden="true">E</span>
          <div>
            <strong style={{ fontSize: "var(--text-md)", fontWeight: 700, letterSpacing: "var(--tracking-tight)" }}>EviChain</strong>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
              Public verification
            </div>
          </div>
        </a>
        <nav style={{ display: "flex", gap: 16, fontSize: "var(--text-sm)" }} aria-label="Navigation">
          <a href="/" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>Home</a>
          <a href="/login" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>Sign in</a>
        </nav>
      </header>

      <div style={s.container}>
        {/* Hero */}
        <div style={{ marginBottom: 32, textAlign: "center" as const }}>
          <p className="eyebrow" style={{ marginBottom: 8 }}>INDEPENDENT VERIFICATION</p>
          <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 800, letterSpacing: "var(--tracking-tight)", color: "var(--text-primary)" }}>
            Verify evidence integrity
          </h1>
          <p style={{ margin: "12px auto 0", maxWidth: 480, fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Check whether a file or hash matches a registered evidence record. No account required.
          </p>
        </div>

        {/* Info box */}
        <div style={{
          display: "flex", gap: 12, padding: "14px 18px", marginBottom: 24,
          background: "var(--accent-active-dim)", border: "1px solid var(--accent-active-border)",
          borderRadius: "var(--radius-md)", fontSize: "var(--text-sm)", color: "var(--accent-active)",
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>ℹ</span>
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            <strong>How it works:</strong> SHA-256 is computed server-side from the uploaded bytes and compared against all registered evidence records.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border-default)", marginBottom: 0 }} role="tablist" aria-label="Verification method">
          <button style={s.tab(activeTab === "file")} role="tab" aria-selected={activeTab === "file"} onClick={() => { setActiveTab("file"); reset(); }}>
            Upload a file
          </button>
          <button style={s.tab(activeTab === "hash")} role="tab" aria-selected={activeTab === "hash"} onClick={() => { setActiveTab("hash"); reset(); }}>
            Enter a hash
          </button>
        </div>

        {/* File panel */}
        <div hidden={activeTab !== "file"} role="tabpanel" style={{ ...s.card, borderTop: "none", borderRadius: "0 0 var(--radius-md) var(--radius-md)" }}>
          <form onSubmit={handleFileSubmit} aria-label="Verify file by upload">
            <h2 style={{ margin: "0 0 8px", fontSize: "var(--text-md)", fontWeight: 700, color: "var(--text-primary)" }}>Upload the file to verify</h2>
            <p style={{ margin: "0 0 20px", fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              The file is sent to our server for SHA-256 computation — it is never stored.
            </p>
            <input
              type="file"
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)}
              aria-label="Choose a file to verify"
              style={{ display: "block", width: "100%", padding: 12, background: "var(--surface-sunken)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", color: "var(--text-primary)", fontSize: "var(--text-sm)" }}
            />
            {file && (
              <p style={{ margin: "12px 0 0", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }} aria-live="polite">
                Selected: <strong style={{ color: "var(--text-primary)" }}>{file.name}</strong> ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
            <button type="submit" className="btn btn-primary btn-lg" disabled={!file || result.status === "loading"} style={{ width: "100%", marginTop: 20 }}>
              {result.status === "loading" ? "Verifying…" : "Verify file"}
            </button>
          </form>
        </div>

        {/* Hash panel */}
        <div hidden={activeTab !== "hash"} role="tabpanel" style={{ ...s.card, borderTop: "none", borderRadius: "0 0 var(--radius-md) var(--radius-md)" }}>
          <form onSubmit={handleHashSubmit} aria-label="Verify by SHA-256 hash">
            <h2 style={{ margin: "0 0 8px", fontSize: "var(--text-md)", fontWeight: 700, color: "var(--text-primary)" }}>Enter the SHA-256 hash</h2>
            <p style={{ margin: "0 0 20px", fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Paste the 64-character hexadecimal fingerprint.
            </p>
            <label style={{ display: "block", marginBottom: 6, fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)" }}>SHA-256 fingerprint</label>
            <input
              type="text" value={hashInput} onChange={(e) => setHashInput(e.target.value)}
              placeholder="9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
              maxLength={64} spellCheck={false} autoComplete="off"
              className="input" style={{ fontFamily: "var(--font-mono)", fontSize: 13, letterSpacing: "0.03em" }}
            />
            <small style={{ display: "block", marginTop: 6, fontSize: 11, color: "var(--text-disabled)" }}>
              Exactly 64 hexadecimal characters (0–9, a–f)
            </small>
            <button type="submit" className="btn btn-primary btn-lg" disabled={result.status === "loading"} style={{ width: "100%", marginTop: 20 }}>
              {result.status === "loading" ? "Checking…" : "Verify hash"}
            </button>
          </form>
        </div>

        {/* Results */}
        <section style={{ marginTop: 24 }} aria-live="polite">
          {result.status === "idle" && (
            <div style={{ textAlign: "center" as const, padding: "32px 16px", color: "var(--text-disabled)", fontSize: "var(--text-sm)" }}>
              Submit a file or hash above to see verification results.
            </div>
          )}

          {result.status === "error" && (
            <div role="alert" style={{
              padding: 20, background: "var(--accent-danger-dim)", border: "1px solid var(--accent-danger-border)",
              borderRadius: "var(--radius-md)", textAlign: "center" as const,
            }}>
              <strong style={{ display: "block", color: "var(--accent-danger)", marginBottom: 8 }}>Verification error</strong>
              <p style={{ margin: "0 0 16px", fontSize: "var(--text-sm)", color: "var(--accent-danger)", opacity: 0.9 }}>{result.message}</p>
              <button className="btn btn-secondary btn-sm" onClick={reset}>Try again</button>
            </div>
          )}

          {result.status === "done" && !result.data.matched && (
            <div style={{
              padding: 28, background: "var(--surface-raised)", border: "1px solid var(--accent-danger-border)",
              borderRadius: "var(--radius-md)", textAlign: "center" as const,
            }}>
              <div style={{ width: 48, height: 48, margin: "0 auto 16px", display: "grid", placeItems: "center", borderRadius: "50%", background: "var(--accent-danger-dim)", color: "var(--accent-danger)", fontSize: 24, fontWeight: 800 }}>✕</div>
              <h2 style={{ margin: "0 0 8px", fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--text-primary)" }}>No matching record found</h2>
              <p style={{ margin: "0 0 16px", fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                The fingerprint does not match any registered evidence.
              </p>
              <div style={{ margin: "16px 0", padding: 16, background: "var(--surface-sunken)", borderRadius: "var(--radius-md)", textAlign: "left" as const }}>
                <span className="eyebrow" style={{ display: "block", marginBottom: 8 }}>SUBMITTED SHA-256</span>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--neutral-700)", wordBreak: "break-all" as const, lineHeight: 1.6 }}>{result.data.sha256}</code>
              </div>
              <button className="btn btn-secondary btn-md" onClick={reset}>Verify another</button>
            </div>
          )}

          {result.status === "done" && result.data.matched && result.data.evidence && (
            <div style={{
              padding: 28, background: "var(--surface-raised)", border: "1px solid var(--accent-verified-border)",
              borderRadius: "var(--radius-md)",
            }}>
              <div style={{ textAlign: "center" as const, marginBottom: 20 }}>
                <div style={{ width: 48, height: 48, margin: "0 auto 16px", display: "grid", placeItems: "center", borderRadius: "50%", background: "var(--accent-verified-dim)", color: "var(--accent-verified)", fontSize: 24, fontWeight: 800 }}>✓</div>
                <h2 style={{ margin: "0 0 8px", fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--text-primary)" }}>Evidence integrity confirmed</h2>
                <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                  SHA-256 fingerprint matches a registered evidence record.
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", padding: "20px 0", borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)" }}>
                {[
                  { label: "Evidence name", value: result.data.evidence.name },
                  { label: "File type", value: result.data.evidence.type },
                  { label: "Owner", value: result.data.evidence.ownerOrg },
                  { label: "Status", value: result.data.evidence.status },
                  { label: "Registered", value: fmtDate(result.data.evidence.registeredAt) },
                ].map(item => (
                  <div key={item.label}>
                    <dt style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--text-disabled)", marginBottom: 4 }}>{item.label}</dt>
                    <dd style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)" }}>{item.value}</dd>
                  </div>
                ))}
              </div>

              <div style={{ margin: "20px 0", padding: 16, background: "var(--surface-sunken)", borderRadius: "var(--radius-md)" }}>
                <span className="eyebrow" style={{ display: "block", marginBottom: 8, color: "var(--accent-verified)" }}>VERIFIED SHA-256</span>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--neutral-700)", wordBreak: "break-all" as const, lineHeight: 1.6 }}>{result.data.sha256}</code>
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <a className="btn btn-primary btn-md" href={`/evidence/${result.data.evidence.id}`}>View full record →</a>
                <button className="btn btn-secondary btn-md" onClick={reset}>Verify another</button>
              </div>
            </div>
          )}
        </section>

        {/* Footer */}
        <footer style={{ marginTop: 48, paddingTop: 20, borderTop: "1px solid var(--border-subtle)", textAlign: "center" as const, fontSize: 11, color: "var(--text-disabled)", fontFamily: "var(--font-mono)" }}>
          EviChain public verification · No account required · SHA-256 computed server-side
        </footer>
      </div>
    </main>
  );
}
