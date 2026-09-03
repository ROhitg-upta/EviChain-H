"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth-context";

export default function LoginPage() {
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");
  const [role, setRole]         = useState<"Administrator" | "Investigator" | "Auditor" | "Custodian">("Investigator");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Shake form on error
  useEffect(() => {
    if (!error || !formRef.current) return;
    formRef.current.classList.remove("shake");
    // Force reflow so re-adding the class triggers the animation again
    void formRef.current.offsetWidth;
    formRef.current.classList.add("shake");
  }, [error]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
      } else {
        await signUp(email, password, name, role);
      }
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  // Styles using CSS custom properties
  const styles: { [key: string]: React.CSSProperties } = {
    main: {
      backgroundColor: "var(--surface-base, #0f1114)",
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      overflow: "hidden",
      fontFamily: "var(--font-sans, Inter, sans-serif)",
      color: "var(--text-primary, #e8e6e3)",
      padding: "1rem",
    },
    meshContainer: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      overflow: "hidden",
      zIndex: 0,
      pointerEvents: "none",
    },
    mesh1: {
      position: "absolute",
      top: "-10%",
      left: "-10%",
      width: "40vw",
      height: "40vw",
      background: "radial-gradient(circle, rgba(34, 211, 238, 0.05) 0%, transparent 70%)",
      borderRadius: "50%",
    },
    mesh2: {
      position: "absolute",
      bottom: "-10%",
      right: "-10%",
      width: "50vw",
      height: "50vw",
      background: "radial-gradient(circle, rgba(181, 245, 66, 0.03) 0%, transparent 70%)",
      borderRadius: "50%",
    },
    card: {
      backgroundColor: "var(--surface-raised, #181b20)",
      border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
      borderRadius: "var(--radius-lg, 8px)",
      padding: "2.5rem",
      width: "100%",
      maxWidth: "420px",
      position: "relative",
      zIndex: 1,
      display: "flex",
      flexDirection: "column",
      gap: "1.5rem",
      boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
    },
    header: {
      display: "flex",
      alignItems: "center",
      gap: "1rem",
      marginBottom: "0.25rem",
      justifyContent: "center",
    },
    brandMark: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "40px",
      height: "40px",
      backgroundColor: "var(--accent-verified, #b5f542)",
      color: "#000",
      fontWeight: "bold",
      fontSize: "1.25rem",
      borderRadius: "var(--radius-sm, 4px)",
    },
    brandText: {
      fontSize: "1.5rem",
      fontWeight: "600",
      letterSpacing: "-0.025em",
      margin: 0,
      color: "var(--text-primary, #e8e6e3)",
    },
    subTitle: {
      color: "var(--text-secondary, #7a7d82)",
      margin: 0,
      fontSize: "0.875rem",
      textAlign: "center",
    },
    toggleContainer: {
      display: "flex",
      gap: "1rem",
      justifyContent: "center",
      marginBottom: "0.5rem",
    },
    toggleBtn: {
      background: "none",
      border: "none",
      color: "var(--text-secondary, #7a7d82)",
      cursor: "pointer",
      fontSize: "0.875rem",
      fontWeight: "500",
      padding: "0.25rem 0.5rem",
      transition: "color 0.2s, border-color 0.2s",
      borderBottom: "2px solid transparent",
    },
    toggleBtnActive: {
      color: "var(--text-primary, #e8e6e3)",
      borderBottom: "2px solid var(--accent-active, #22d3ee)",
    },
    formGroup: {
      display: "flex",
      flexDirection: "column",
      gap: "0.5rem",
      marginBottom: "1.25rem",
    },
    label: {
      fontSize: "0.875rem",
      fontWeight: "500",
      color: "var(--text-primary, #e8e6e3)",
    },
    customInput: {
      backgroundColor: "var(--surface-sunken, #0a0c0e)",
      border: "1px solid var(--border-default, rgba(255,255,255,0.1))",
      color: "var(--text-primary, #e8e6e3)",
      outline: "none",
    },
    alertError: {
      backgroundColor: "rgba(244, 63, 94, 0.1)",
      borderLeft: "4px solid var(--accent-alert, #f43f5e)",
      color: "var(--accent-alert, #f43f5e)",
      padding: "0.75rem 1rem",
      borderRadius: "var(--radius-sm, 4px)",
      fontSize: "0.875rem",
      display: "flex",
      gap: "0.5rem",
      alignItems: "center",
      marginBottom: "1rem",
    },
    trustIndicators: {
      fontFamily: "var(--font-mono, DM Mono, monospace)",
      fontSize: "0.75rem",
      color: "var(--text-secondary, #7a7d82)",
      textAlign: "center",
      marginTop: "1.5rem",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      gap: "0.5rem",
    },
    primaryBtn: {
      backgroundColor: "var(--accent-verified, #b5f542)",
      color: "#000",
      border: "none",
    }
  };

  if (user) {
    return (
      <main style={styles.main}>
        <section style={styles.card}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <span style={styles.brandMark} aria-hidden="true">E</span>
          </div>
          <p className="eyebrow" style={{ textAlign: "center", margin: "0.5rem 0 0", color: "var(--accent-active, #22d3ee)" }}>
            Active session
          </p>
          <h1 style={{ ...styles.brandText, textAlign: "center" }}>Already signed in</h1>
          <p style={{ color: "var(--text-secondary, #7a7d82)", textAlign: "center", margin: 0 }}>
            {user.name} · {user.role}
          </p>
          <a className="btn btn-primary" href="/dashboard" style={{ ...styles.primaryBtn, width: "100%", justifyContent: "center", display: "flex", marginTop: "1rem", textDecoration: "none" }}>
            Continue to workspace →
          </a>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      {/* Ambient background mesh */}
      <div style={styles.meshContainer} aria-hidden="true">
        <div style={styles.mesh1} />
        <div style={styles.mesh2} />
      </div>

      <section style={styles.card} role="main">
        {/* Header */}
        <div>
          <div style={styles.header}>
            <span style={styles.brandMark} aria-hidden="true">E</span>
            <h1 style={styles.brandText}>EviChain</h1>
          </div>
          <p style={styles.subTitle}>Evidence Integrity Network</p>
        </div>

        {/* Toggle Sign in / Create account */}
        <div style={styles.toggleContainer} role="tablist">
          <button
            type="button"
            style={{ ...styles.toggleBtn, ...(mode === "login" ? styles.toggleBtnActive : {}) }}
            role="tab"
            aria-selected={mode === "login"}
            onClick={() => { setMode("login"); setError(""); }}
          >
            Sign in
          </button>
          <button
            type="button"
            style={{ ...styles.toggleBtn, ...(mode === "register" ? styles.toggleBtnActive : {}) }}
            role="tab"
            aria-selected={mode === "register"}
            onClick={() => { setMode("register"); setError(""); }}
          >
            Create account
          </button>
        </div>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          suppressHydrationWarning
          noValidate
          role="tabpanel"
          style={{ display: "flex", flexDirection: "column" }}
        >
          {mode === "register" && (
            <div style={styles.formGroup}>
              <label style={styles.label} htmlFor="name">Full name</label>
              <input
                id="name"
                className="input"
                style={styles.customInput}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Dr. Anjali Sharma"
                autoComplete="name"
                suppressHydrationWarning
              />
            </div>
          )}

          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="email">Email address</label>
            <input
              id="email"
              className="input"
              style={styles.customInput}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="operator@evichain.local"
              autoComplete="email"
              suppressHydrationWarning
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              style={styles.customInput}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Min. 8 characters"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              suppressHydrationWarning
            />
          </div>

          {mode === "register" && (
            <div style={styles.formGroup}>
              <label style={styles.label} htmlFor="role">Access role</label>
              <select
                id="role"
                className="input"
                style={styles.customInput}
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as "Administrator" | "Investigator" | "Auditor" | "Custodian")
                }
                suppressHydrationWarning
              >
                <option value="Administrator">Administrator</option>
                <option value="Investigator">Investigator</option>
                <option value="Custodian">Custodian (evidence storage)</option>
                <option value="Auditor">Auditor (read-only)</option>
              </select>
            </div>
          )}

          {error && (
            <div style={styles.alertError} role="alert" aria-live="assertive">
              <span aria-hidden="true">⚠</span>
              {error}
            </div>
          )}

          <button
            className={`btn btn-primary ${loading ? "btn-loading" : ""}`}
            style={{ ...styles.primaryBtn, width: "100%", justifyContent: "center" }}
            type="submit"
            disabled={loading}
            suppressHydrationWarning
          >
            {!loading && (mode === "login" ? "Sign in" : "Create account")}
          </button>
        </form>

        <div style={styles.trustIndicators}>
          <span>SHA-256 Verified</span>
          <span>·</span>
          <span>Court-Ready</span>
          <span>·</span>
          <span>Secure</span>
        </div>
      </section>
    </main>
  );
}
