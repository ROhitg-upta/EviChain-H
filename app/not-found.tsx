import Link from "next/link";

export default function NotFound() {
  return (
    <main className="cases-shell" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh", textAlign: "center", padding: "2rem" }}>
      <div className="brand-mark" style={{ width: 64, height: 64, fontSize: 32, marginBottom: 24 }}>E</div>
      <p className="eyebrow" style={{ color: "var(--muted, #6b7280)" }}>404 · RECORD NOT FOUND</p>
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: "8px 0 16px" }}>Page or Evidence Not Found</h1>
      <p style={{ maxWidth: 460, color: "var(--text-secondary, #4b5563)", marginBottom: 32 }}>
        The record, case, or route you requested could not be located in the EviChain ledger. It may have been relocated, or the URL may be invalid.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <Link href="/dashboard" className="button button-primary">
          Return to Dashboard
        </Link>
        <Link href="/evidence" className="button button-secondary">
          Evidence Registry
        </Link>
        <Link href="/verify" className="button button-secondary">
          Verify Hash
        </Link>
      </div>
    </main>
  );
}
