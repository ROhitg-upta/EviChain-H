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

// ── Counting number animation ────────────────────────────────────
function CountUp({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      obs.disconnect();
      const dur = 1400;
      const start = performance.now();
      function tick(now: number) {
        const t = Math.min((now - start) / dur, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        setVal(Math.round(ease * target));
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [target]);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
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
  { icon: "hash",   color: "brand",   title: "SHA-256 Fingerprinting",   desc: "Every file is hashed server-side the moment it's uploaded. The fingerprint is immutable — any byte change is instantly detectable." },
  { icon: "chain",  color: "info",    title: "Chain of Custody",         desc: "Every access, transfer, and download creates a tamper-evident custody event. The full chain is always visible and exportable." },
  { icon: "shield", color: "success", title: "Role-Based Access",        desc: "Administrators, Investigators, Auditors, and Custodians each have precisely scoped permissions. No privilege creep." },
  { icon: "audit",  color: "warning", title: "Immutable Audit Ledger",   desc: "Every action is logged with user, IP, timestamp, and resource ID. Export as CSV or JSON for court submissions." },
  { icon: "verify", color: "brand",   title: "Public Verification",      desc: "Anyone — lawyers, courts, external auditors — can verify a file's integrity without needing an account." },
  { icon: "report", color: "info",    title: "Analytics & Reports",      desc: "Case trends, evidence volume, resolution time, and top contributors — all in one dashboard with CSV export." },
];

const STEPS = [
  { num: "01", title: "Upload evidence",        desc: "Drag and drop any file. SHA-256 is computed on the server from the original bytes — not the client." },
  { num: "02", title: "Track custody",          desc: "Every access and transfer is logged automatically. The custody chain builds itself as the investigation progresses." },
  { num: "03", title: "Verify and export",      desc: "Anyone can verify a file's integrity at any time. Export the full audit ledger for court or compliance review." },
];

export default function LandingPage() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  const heroRef    = useFadeUp(0.1);
  const featRef    = useFadeUp(0.05) as React.RefObject<HTMLElement>;
  const stepsRef   = useFadeUp(0.05) as React.RefObject<HTMLElement>;
  const statsRef   = useFadeUp(0.1)  as React.RefObject<HTMLElement>;
  const secRef     = useFadeUp(0.1)  as React.RefObject<HTMLElement>;
  const ctaRef     = useFadeUp(0.2)  as React.RefObject<HTMLElement>;

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <div className="land-root">

      {/* ── Sticky header ────────────────────────────────────────── */}
      <header className={`land-header ${scrolled ? "land-header--scrolled" : ""}`}>
        <div className="land-container land-header-inner">
          <a href="/" className="land-logo" aria-label="EviChain home">
            <span className="land-logo-mark" aria-hidden="true">E</span>
            <span className="land-logo-name">EviChain</span>
          </a>
          <nav className="land-nav" aria-label="Main navigation">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#security">Security</a>
            <a href="/verify">Verify evidence</a>
          </nav>
          <div className="land-header-cta">
            {user ? (
              <a href="/evidence" className="btn btn-primary btn-md">Open workspace →</a>
            ) : (
              <>
                <a href="/login" className="btn btn-ghost btn-md">Sign in</a>
                <a href="/login" className="btn btn-primary btn-md">Get started</a>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="land-hero" ref={heroRef as React.RefObject<HTMLElement>}>
        <div className="land-hero-mesh" aria-hidden="true">
          <div className="land-mesh-1" /><div className="land-mesh-2" /><div className="land-mesh-3" />
        </div>
        <div className="land-container land-hero-inner fade-up">
          <div className="land-hero-left">
            <p className="eyebrow" style={{ marginBottom: "var(--space-4)" }}>
              Built for SIH 2026
            </p>
            <h1 className="land-hero-headline">
              Evidence integrity<br />
              <span className="land-hero-gradient">you can prove.</span>
            </h1>
            <p className="land-hero-sub">
              SHA-256 verified chain of custody for digital evidence — from the
              moment of upload to the courtroom.
            </p>
            <div className="land-hero-actions">
              <a href="/login" className="btn btn-primary btn-xl land-cta-glow">
                Get started free
              </a>
              <a href="/verify" className="btn btn-secondary btn-xl">
                <span aria-hidden="true">✓</span> Verify evidence
              </a>
            </div>
            <div className="land-trust-row" aria-label="Trust indicators">
              <span>SHA-256 Verified</span>
              <span aria-hidden="true">·</span>
              <span>Court-Ready Reports</span>
              <span aria-hidden="true">·</span>
              <span>RBAC Enforced</span>
              <span aria-hidden="true">·</span>
              <span>Built for SIH 2026</span>
            </div>
          </div>

          <div className="land-hero-right" aria-hidden="true">
            <div className="land-hero-visual">
              <div className="land-ev-card land-ev-card-1">
                <div className="land-ev-header">
                  <span className="land-ev-icon">▶</span>
                  <div>
                    <p className="land-ev-name">incident-video-042.mp4</p>
                    <p className="land-ev-meta">284 MB · Digital Forensics</p>
                  </div>
                  <span className="land-ev-badge">Verified ✓</span>
                </div>
                <div className="land-ev-hash">
                  <span className="land-ev-hash-label">SHA-256</span>
                  <code>9f86d081884c7d659a2feaa0…</code>
                </div>
              </div>
              <div className="land-ev-card land-ev-card-2">
                <div className="land-ev-header">
                  <span className="land-ev-icon">▣</span>
                  <div>
                    <p className="land-ev-name">system-logs.zip</p>
                    <p className="land-ev-meta">18.4 MB · Security Ops</p>
                  </div>
                  <span className="land-ev-badge land-ev-badge-pending">Pending</span>
                </div>
                <div className="land-ev-hash">
                  <span className="land-ev-hash-label">SHA-256</span>
                  <code>60303ae22b99886…</code>
                </div>
              </div>
              <div className="land-ev-card land-ev-card-3">
                <div className="land-custody">
                  <div className="land-custody-dot" />
                  <div>
                    <p className="land-custody-action">Verified by A. Sharma</p>
                    <p className="land-custody-time">Today at 09:32</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust strip ──────────────────────────────────────────── */}
      <div className="land-trust-strip">
        <div className="land-container">
          <p className="land-trust-strip-text">
            Trusted by investigative teams for forensic integrity
          </p>
        </div>
      </div>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section id="features" className="land-section" ref={featRef}>
        <div className="land-container">
          <div className="land-section-header fade-up">
            <p className="eyebrow">What EviChain does</p>
            <h2 className="land-section-title">Everything a custody chain needs</h2>
            <p className="land-section-sub">
              From upload to courtroom — every feature built for defensible evidence handling.
            </p>
          </div>
          <div className="land-features-grid">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="land-feature-card fade-up card card-interactive"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <span className={`land-feature-icon land-feature-icon--${f.color}`} aria-hidden="true">
                  {FeatureIcons[f.icon as keyof typeof FeatureIcons]}
                </span>
                <h3 className="land-feature-title">{f.title}</h3>
                <p className="land-feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section id="how" className="land-section land-section--tinted" ref={stepsRef}>
        <div className="land-container">
          <div className="land-section-header fade-up">
            <p className="eyebrow">Process</p>
            <h2 className="land-section-title">Three steps to a verified record</h2>
          </div>
          <div className="land-steps">
            {STEPS.map((s, i) => (
              <div
                key={s.num}
                className="land-step fade-up"
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <div className="land-step-num" aria-hidden="true">{s.num}</div>
                {i < STEPS.length - 1 && <div className="land-step-connector" aria-hidden="true" />}
                <h3 className="land-step-title">{s.title}</h3>
                <p className="land-step-desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats band ───────────────────────────────────────────── */}
      <section className="land-stats-band" ref={statsRef}>
        <div className="land-container land-stats-grid fade-up">
          {[
            { n: 100,  s: "+", label: "Evidence records" },
            { n: 50,   s: "+", label: "Cases managed" },
            { n: 99.9, s: "%", label: "Integrity accuracy" },
            { n: 0,    s: "",  label: "Tamper incidents" },
          ].map((stat) => (
            <div key={stat.label} className="land-stat">
              <p className="land-stat-value">
                <CountUp target={stat.n} suffix={stat.s} />
              </p>
              <p className="land-stat-label">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Security ─────────────────────────────────────────────── */}
      <section id="security" className="land-section" ref={secRef}>
        <div className="land-container land-security-grid">
          <div className="land-security-left fade-up">
            <p className="eyebrow">Security & compliance</p>
            <h2 className="land-section-title" style={{ textAlign: "left" }}>
              Built for trust from day one
            </h2>
            <p className="land-security-sub">
              Every design decision in EviChain starts with the question:
              <em> "Could this hold up in court?"</em>
            </p>
            <ul className="land-checklist" aria-label="Security features">
              {[
                "SHA-256 fingerprinting — computed server-side, never client-side",
                "Immutable audit log — every action timestamped with IP address",
                "Role-based access control — four scoped operator roles",
                "JWT authentication with configurable token expiry",
                "PostgreSQL on Neon — encrypted at rest and in transit",
                "Public verification — no account required for hash lookup",
              ].map((item) => (
                <li key={item} className="land-check-item">
                  <span className="land-check-icon" aria-hidden="true">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="land-security-right fade-up" aria-hidden="true">
            <div className="land-verify-mockup">
              <div className="land-verify-header">
                <span className="land-verify-check">✓</span>
                <div>
                  <p className="land-verify-title">Integrity confirmed</p>
                  <p className="land-verify-sub">Hash matches registered evidence</p>
                </div>
              </div>
              <div className="land-verify-hash">
                <span className="land-verify-hash-label">SHA-256</span>
                <code>9f86d081884c7d659a2feaa0c55ad015<br />a3bf4f1b2b0b822cd15d6c15b0f00a08</code>
              </div>
              <div className="land-verify-meta">
                <div>
                  <span>Registered</span>
                  <p>25 Aug 2026, 09:14</p>
                </div>
                <div>
                  <span>Status</span>
                  <p className="land-verify-status">Verified</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────── */}
      <section className="land-cta-band" ref={ctaRef}>
        <div className="land-container land-cta-inner fade-up">
          <h2 className="land-cta-headline">
            Ready to build an unbreakable evidence record?
          </h2>
          <p className="land-cta-sub">
            Start for free. No credit card. Court-ready from day one.
          </p>
          <a href="/login" className="btn btn-xl land-cta-btn land-cta-glow">
            Get started — it&rsquo;s free
          </a>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="land-footer">
        <div className="land-container land-footer-inner">
          <div className="land-footer-brand">
            <a href="/" className="land-logo" aria-label="EviChain home">
              <span className="land-logo-mark land-logo-mark--sm" aria-hidden="true">E</span>
              <span className="land-logo-name">EviChain</span>
            </a>
            <p className="land-footer-desc">
              SHA-256 verified chain-of-custody evidence management for investigative teams.
            </p>
          </div>
          <nav aria-label="Product links">
            <p className="land-footer-heading">Product</p>
            <ul>
              <li><a href="/evidence">Evidence Registry</a></li>
              <li><a href="/cases">Case Management</a></li>
              <li><a href="/audit">Audit Ledger</a></li>
              <li><a href="/reports">Reports</a></li>
            </ul>
          </nav>
          <nav aria-label="Resources links">
            <p className="land-footer-heading">Resources</p>
            <ul>
              <li><a href="/verify">Public Verify</a></li>
              <li><a href="/login">Sign in</a></li>
              <li><a href="/server/README.md">API Docs</a></li>
            </ul>
          </nav>
          <nav aria-label="Legal links">
            <p className="land-footer-heading">Legal</p>
            <ul>
              <li><a href="#">Privacy Policy</a></li>
              <li><a href="#">Terms of Service</a></li>
            </ul>
          </nav>
        </div>
        <div className="land-footer-bar">
          <div className="land-container">
            <p>© 2026 EviChain. Built for Smart India Hackathon.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
