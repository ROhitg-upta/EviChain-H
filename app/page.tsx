"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-context";

// ── Intersection-observer fade-up hook ───────────────────────────
function useFadeUp(threshold = 0.15) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("visible"); obs.disconnect(); } },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return ref;
}

// ── Feature icons (inline SVG — no external lib) ─────────────────
const FeatureIcons = {
  hash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>
      <line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  chain: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  ),
  audit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  verify: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  report: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
};

const FEATURES = [
  { icon: "hash",   color: "#22d3ee",   title: "SHA-256 Fingerprinting",   desc: "Every file is hashed server-side the moment it's uploaded. The fingerprint is immutable — any byte change is instantly detectable." },
  { icon: "chain",  color: "#4abe94",    title: "Chain of Custody",         desc: "Every access, transfer, and download creates a tamper-evident custody event. The full chain is always visible and exportable." },
  { icon: "shield", color: "#b5f542", title: "Role-Based Access",        desc: "Administrators, Investigators, Auditors, and Custodians each have precisely scoped permissions. No privilege creep." },
  { icon: "audit",  color: "#fbbf24", title: "Immutable Audit Ledger",   desc: "Every action is logged with user, IP, timestamp, and resource ID. Export as CSV or JSON for court submissions." },
  { icon: "verify", color: "#22d3ee",   title: "Public Verification",      desc: "Anyone — lawyers, courts, external auditors — can verify a file's integrity without needing an account." },
  { icon: "report", color: "#4abe94",    title: "Analytics & Reports",      desc: "Case trends, evidence volume, resolution time, and top contributors — all in one dashboard with CSV export." },
];

const STEPS = [
  { num: "01", title: "Upload evidence",        desc: "SHA-256 computed server-side" },
  { num: "02", title: "Track custody",          desc: "Every access and transfer logged" },
  { num: "03", title: "Verify and export",      desc: "Anyone can verify integrity" },
];

export default function LandingPage() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  const heroRef    = useFadeUp(0.1);
  const stepsRef   = useFadeUp(0.05) as React.RefObject<HTMLElement>;
  const featRef    = useFadeUp(0.05) as React.RefObject<HTMLElement>;
  const secRef     = useFadeUp(0.1)  as React.RefObject<HTMLElement>;
  const pubRef     = useFadeUp(0.1)  as React.RefObject<HTMLElement>;
  const ctaRef     = useFadeUp(0.2)  as React.RefObject<HTMLElement>;

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <div style={{ backgroundColor: "#0f1114", color: "#e8e6e3", fontFamily: "Inter, sans-serif", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* 1. STICKY HEADER */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        backgroundColor: scrolled ? "rgba(15, 17, 20, 0.9)" : "transparent",
        backdropFilter: scrolled ? "blur(8px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
        transition: "all 0.2s ease"
      }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: "12px", textDecoration: "none", color: "inherit" }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", backgroundColor: "#181b20", border: "1px solid rgba(255,255,255,0.16)", borderRadius: "4px", fontWeight: "bold", color: "#4abe94", fontFamily: "DM Mono, monospace" }}>E</span>
            <span style={{ fontWeight: 600, fontSize: "1.125rem", letterSpacing: "-0.01em" }}>EviChain</span>
          </a>
          <nav style={{ display: "flex", gap: "24px", fontSize: "0.875rem", color: "#7a7d82" }} aria-label="Main navigation">
            <a href="#features" style={{ color: "inherit", textDecoration: "none" }}>Features</a>
            <a href="#how" style={{ color: "inherit", textDecoration: "none" }}>How it works</a>
            <a href="#security" style={{ color: "inherit", textDecoration: "none" }}>Security</a>
            <a href="/verify" style={{ color: "inherit", textDecoration: "none" }}>Verify evidence</a>
          </nav>
          <div style={{ display: "flex", gap: "12px" }}>
            {user ? (
              <a href="/dashboard" style={{ backgroundColor: "#4abe94", color: "#000", padding: "8px 16px", borderRadius: "4px", textDecoration: "none", fontSize: "0.875rem", fontWeight: 500 }}>Open workspace →</a>
            ) : (
              <>
                <a href="/login" style={{ padding: "8px 16px", borderRadius: "4px", textDecoration: "none", fontSize: "0.875rem", color: "#e8e6e3", border: "1px solid rgba(255,255,255,0.08)" }}>Sign in</a>
                <a href="/login" style={{ backgroundColor: "#4abe94", color: "#000", padding: "8px 16px", borderRadius: "4px", textDecoration: "none", fontSize: "0.875rem", fontWeight: 500 }}>Open the vault</a>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section ref={heroRef as React.RefObject<HTMLElement>} style={{ padding: "96px 24px", maxWidth: "1200px", margin: "0 auto", width: "100%", display: "flex", flexWrap: "wrap", gap: "64px", alignItems: "center" }} className="fade-up">
        <div style={{ flex: "1 1 500px", display: "flex", flexDirection: "column", gap: "24px" }}>
          <p className="eyebrow" style={{ fontFamily: "DM Mono, monospace", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.75rem", color: "#22d3ee" }}>
            DIGITAL EVIDENCE / CHAIN OF CUSTODY
          </p>
          <h1 style={{ fontSize: "4rem", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", color: "#e8e6e3", margin: 0 }}>
            Proof that survives scrutiny.
          </h1>
          <p style={{ fontSize: "1.25rem", color: "#7a7d82", lineHeight: 1.6, margin: 0 }}>
            Immutable digital evidence, verified at every handoff.
          </p>
          <div style={{ display: "flex", gap: "16px", marginTop: "8px", flexWrap: "wrap" }}>
            <a href="/login" style={{ backgroundColor: "#4abe94", color: "#000", padding: "12px 24px", borderRadius: "4px", textDecoration: "none", fontSize: "1rem", fontWeight: 500, display: "inline-block" }}>
              Open the vault
            </a>
            <a href="/verify" style={{ backgroundColor: "#181b20", color: "#e8e6e3", padding: "12px 24px", borderRadius: "4px", textDecoration: "none", fontSize: "1rem", fontWeight: 500, border: "1px solid rgba(255,255,255,0.08)", display: "inline-block" }}>
              Verify a hash →
            </a>
          </div>
          <div style={{ display: "flex", gap: "16px", fontSize: "0.75rem", color: "#7a7d82", marginTop: "32px", fontFamily: "DM Mono, monospace", flexWrap: "wrap" }}>
            <span>SHA-256 Verified</span>
            <span>·</span>
            <span>Court-Ready</span>
            <span>·</span>
            <span>RBAC Enforced</span>
            <span>·</span>
            <span>SIH 2026</span>
          </div>
        </div>

        <div style={{ flex: "1 1 400px" }}>
          <div style={{ backgroundColor: "#181b20", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", overflow: "hidden", boxShadow: "0 20px 40px rgba(0,0,0,0.4)" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "DM Mono, monospace", fontSize: "0.75rem", color: "#7a7d82" }}>EVIDENCE VAULT</span>
              <span style={{ fontSize: "0.65rem", padding: "2px 6px", backgroundColor: "#f43f5e", color: "#fff", borderRadius: "4px", textTransform: "uppercase" }}>Product Preview</span>
            </div>
            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: "0.75rem", color: "#7a7d82", marginBottom: "4px" }}>Case ID: <span style={{ fontFamily: "DM Mono, monospace", color: "#e8e6e3" }}>EVC-2026-0042</span></p>
                  <p style={{ fontSize: "1rem", fontWeight: 500, color: "#e8e6e3" }}>incident-report-042.pdf</p>
                  <p style={{ fontSize: "0.75rem", color: "#7a7d82", marginTop: "4px" }}>2.4 MB · PDF</p>
                </div>
                <div>
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#b5f542", borderLeft: "2px solid #b5f542", paddingLeft: "8px", textTransform: "uppercase" }}>VERIFIED</span>
                </div>
              </div>
              <div style={{ backgroundColor: "#0a0c0e", padding: "12px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p style={{ fontSize: "0.75rem", color: "#7a7d82", marginBottom: "4px" }}>SHA-256 Fingerprint</p>
                <code style={{ fontFamily: "DM Mono, monospace", fontSize: "0.875rem", color: "#22d3ee", wordBreak: "break-all" }}>9f86d081884c7d659a2feaa0...</code>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
                <p style={{ fontSize: "0.75rem", color: "#7a7d82" }}>Custody Route</p>
                <div style={{ display: "flex", justifyContent: "space-between", position: "relative", zIndex: 1 }}>
                  <div style={{ position: "absolute", top: "4px", left: "10%", right: "10%", height: "1px", backgroundColor: "rgba(255,255,255,0.1)", zIndex: -1 }}></div>
                  {['Captured', 'Hashed', 'Custodied', 'Court-ready'].map((step, i) => (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: i === 3 ? "#181b20" : "#4abe94", border: i === 3 ? "2px solid rgba(255,255,255,0.2)" : "none" }}></div>
                      <span style={{ fontSize: "0.65rem", color: i === 3 ? "#7a7d82" : "#e8e6e3" }}>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "16px", marginTop: "8px" }}>
                <p style={{ fontSize: "0.75rem", color: "#7a7d82" }}>Current custodian: <span style={{ color: "#e8e6e3" }}>A. Sharma · Investigator</span></p>
                <p style={{ fontSize: "0.75rem", color: "#7a7d82", marginTop: "4px" }}>Latest event: <span style={{ color: "#e8e6e3" }}>Custody transferred · 2m ago</span></p>
              </div>
            </div>
            <div style={{ padding: "8px 16px", borderTop: "1px solid rgba(255,255,255,0.08)", backgroundColor: "#0a0c0e", textAlign: "center" }}>
              <p style={{ fontSize: "0.65rem", color: "#7a7d82" }}>Product preview — not real data</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. CHAIN OF CUSTODY WORKFLOW */}
      <section id="how" ref={stepsRef} className="fade-up" style={{ backgroundColor: "#0a0c0e", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "96px 24px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <p className="eyebrow" style={{ fontFamily: "DM Mono, monospace", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.75rem", color: "#7a7d82", marginBottom: "16px" }}>PROCESS</p>
          <h2 style={{ fontSize: "2.5rem", fontWeight: 600, color: "#e8e6e3", margin: "0 0 64px 0", letterSpacing: "-0.01em" }}>Three steps to court-ready evidence</h2>
          
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", position: "relative" }}>
            {STEPS.map((s, i) => (
              <div key={s.num} style={{ flex: "1 1 250px", backgroundColor: "#181b20", border: "1px solid rgba(255,255,255,0.08)", padding: "32px", borderRadius: "6px", position: "relative" }}>
                <span style={{ fontFamily: "DM Mono, monospace", fontSize: "2rem", color: "rgba(255,255,255,0.1)", fontWeight: 700, position: "absolute", top: "16px", right: "24px" }}>{s.num}</span>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 500, color: "#e8e6e3", marginBottom: "12px", marginTop: "24px" }}>{s.title}</h3>
                <p style={{ fontSize: "0.875rem", color: "#7a7d82", lineHeight: 1.5, margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. FEATURES GRID */}
      <section id="features" ref={featRef} className="fade-up" style={{ padding: "96px 24px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <p className="eyebrow" style={{ fontFamily: "DM Mono, monospace", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.75rem", color: "#7a7d82", marginBottom: "16px", textAlign: "center" }}>CAPABILITIES</p>
          <h2 style={{ fontSize: "2.5rem", fontWeight: 600, color: "#e8e6e3", margin: "0 0 64px 0", letterSpacing: "-0.01em", textAlign: "center" }}>Built for forensic integrity</h2>
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px" }}>
            {FEATURES.map((f, i) => (
              <div key={f.title} style={{ backgroundColor: "#181b20", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", padding: "32px", display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ width: "32px", height: "32px", color: f.color }}>
                  {FeatureIcons[f.icon as keyof typeof FeatureIcons]}
                </div>
                <h3 style={{ fontSize: "1.125rem", fontWeight: 500, color: "#e8e6e3", margin: 0 }}>{f.title}</h3>
                <p style={{ fontSize: "0.875rem", color: "#7a7d82", lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. SECURITY / HASH INTEGRITY */}
      <section id="security" ref={secRef} className="fade-up" style={{ padding: "96px 24px", backgroundColor: "#0a0c0e", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "64px", alignItems: "center" }}>
          <div style={{ flex: "1 1 400px" }}>
            <h2 style={{ fontSize: "2.5rem", fontWeight: 600, color: "#e8e6e3", margin: "0 0 32px 0", letterSpacing: "-0.01em" }}>Trust built into every byte</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "16px" }}>
              {[
                "SHA-256 computed server-side, never client-side",
                "Immutable audit log timestamped with IP address",
                "Four scoped operator roles for strict access control",
                "JWT authentication with configurable token expiry",
                "Encrypted storage and transmission",
              ].map((item, i) => (
                <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: "12px", fontSize: "1rem", color: "#7a7d82" }}>
                  <span style={{ color: "#4abe94", marginTop: "2px" }}>✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          
          <div style={{ flex: "1 1 400px", backgroundColor: "#181b20", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", padding: "32px", boxShadow: "0 20px 40px rgba(0,0,0,0.4)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "50%", backgroundColor: "rgba(181, 245, 66, 0.1)", color: "#b5f542", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.25rem" }}>✓</div>
              <div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 500, color: "#e8e6e3", margin: "0 0 4px 0" }}>Integrity confirmed</h3>
                <p style={{ fontSize: "0.875rem", color: "#7a7d82", margin: 0 }}>Hash matches registered evidence</p>
              </div>
            </div>
            <div style={{ backgroundColor: "#0a0c0e", padding: "16px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.06)", marginBottom: "24px" }}>
              <p style={{ fontFamily: "DM Mono, monospace", fontSize: "0.75rem", color: "#7a7d82", marginBottom: "8px", textTransform: "uppercase" }}>SHA-256</p>
              <code style={{ fontFamily: "DM Mono, monospace", fontSize: "0.875rem", color: "#e8e6e3", wordBreak: "break-all", lineHeight: 1.5 }}>
                9f86d081884c7d659a2feaa0c55ad015<br/>a3bf4f1b2b0b822cd15d6c15b0f00a08
              </code>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: "0.65rem", color: "#7a7d82" }}>Product preview — not real data</p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. PUBLIC VERIFICATION SECTION */}
      <section ref={pubRef} className="fade-up" style={{ padding: "96px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto", backgroundColor: "#1e2228", padding: "48px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h2 style={{ fontSize: "2rem", fontWeight: 600, color: "#e8e6e3", margin: "0 0 16px 0", letterSpacing: "-0.01em" }}>Public Verification</h2>
          <p style={{ fontSize: "1.125rem", color: "#7a7d82", margin: "0 0 32px 0" }}>Anyone can verify evidence integrity — no account required.</p>
          <a href="/verify" style={{ backgroundColor: "#181b20", color: "#e8e6e3", padding: "12px 24px", borderRadius: "4px", textDecoration: "none", fontSize: "1rem", fontWeight: 500, border: "1px solid rgba(255,255,255,0.16)", display: "inline-block" }}>
            Go to verification tool →
          </a>
        </div>
      </section>

      {/* 7. FINAL CTA */}
      <section ref={ctaRef} className="fade-up" style={{ padding: "96px 24px", background: "linear-gradient(180deg, #0f1114 0%, #0d1e18 100%)", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "3rem", fontWeight: 700, color: "#e8e6e3", margin: "0 0 24px 0", letterSpacing: "-0.02em", lineHeight: 1.1 }}>Ready to build an unbreakable evidence record?</h2>
          <a href="/login" style={{ backgroundColor: "#4abe94", color: "#000", padding: "16px 32px", borderRadius: "4px", textDecoration: "none", fontSize: "1.125rem", fontWeight: 500, display: "inline-block", marginTop: "16px" }}>
            Open the vault
          </a>
        </div>
      </section>

      {/* 8. FOOTER */}
      <footer style={{ backgroundColor: "#0a0c0e", padding: "64px 24px 32px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "48px", paddingBottom: "48px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ gridColumn: "1 / -1", maxWidth: "300px" }}>
            <a href="/" style={{ display: "flex", alignItems: "center", gap: "12px", textDecoration: "none", color: "inherit", marginBottom: "16px" }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", backgroundColor: "#181b20", border: "1px solid rgba(255,255,255,0.16)", borderRadius: "4px", fontWeight: "bold", color: "#4abe94", fontFamily: "DM Mono, monospace" }}>E</span>
              <span style={{ fontWeight: 600, fontSize: "1.125rem", letterSpacing: "-0.01em" }}>EviChain</span>
            </a>
            <p style={{ fontSize: "0.875rem", color: "#7a7d82", lineHeight: 1.6, margin: 0 }}>
              SHA-256 verified chain-of-custody evidence management for investigative teams.
            </p>
          </div>
          
          <div>
            <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#e8e6e3", marginBottom: "16px" }}>Product</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.875rem" }}>
              <li><a href="/dashboard" style={{ color: "#7a7d82", textDecoration: "none" }}>Dashboard</a></li>
              <li><a href="/cases" style={{ color: "#7a7d82", textDecoration: "none" }}>Case Management</a></li>
            </ul>
          </div>

          <div>
            <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#e8e6e3", marginBottom: "16px" }}>Resources</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.875rem" }}>
              <li><a href="/verify" style={{ color: "#7a7d82", textDecoration: "none" }}>Public Verify</a></li>
              <li><a href="/login" style={{ color: "#7a7d82", textDecoration: "none" }}>Sign in</a></li>
            </ul>
          </div>

          <div>
            <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#e8e6e3", marginBottom: "16px" }}>Legal</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.875rem" }}>
              <li><a href="#" style={{ color: "#7a7d82", textDecoration: "none" }}>Privacy Policy</a></li>
              <li><a href="#" style={{ color: "#7a7d82", textDecoration: "none" }}>Terms of Service</a></li>
            </ul>
          </div>
        </div>
        
        <div style={{ maxWidth: "1200px", margin: "0 auto", paddingTop: "32px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", color: "#7a7d82", flexWrap: "wrap", gap: "16px" }}>
          <p style={{ margin: 0 }}>© 2026 EviChain. Built for Smart India Hackathon.</p>
        </div>
      </footer>
    </div>
  );
}
