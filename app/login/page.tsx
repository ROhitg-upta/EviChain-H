"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth-context";

export default function LoginPage() {
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");
  const [role, setRole]         = useState<"Administrator" | "Investigator" | "Auditor">("Investigator");
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
      window.location.href = "/";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  if (user) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <span className="auth-brand-mark" aria-hidden="true">E</span>
          <p className="eyebrow" style={{ textAlign: "center", marginBottom: "var(--space-2)" }}>
            Active session
          </p>
          <h1 className="auth-title">Already signed in</h1>
          <p className="auth-sub">{user.name} · {user.role}</p>
          <a className="btn btn-primary btn-lg btn-full" href="/" style={{ marginTop: "var(--space-4)" }}>
            Continue to workspace →
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      {/* Ambient background mesh */}
      <div className="auth-mesh" aria-hidden="true">
        <div className="auth-mesh-circle auth-mesh-1" />
        <div className="auth-mesh-circle auth-mesh-2" />
      </div>

      <section className="auth-card" role="main">
        {/* Header */}
        <div className="auth-header">
          <span className="auth-brand-mark" aria-hidden="true">E</span>
          <div>
            <h1 className="auth-title">EviChain</h1>
            <p className="auth-subtitle">Evidence Integrity Network</p>
          </div>
        </div>

        {/* Segmented tab control */}
        <div className="seg-control" role="tablist" aria-label="Authentication mode">
          <button
            className={`seg-btn ${mode === "login" ? "seg-btn-active" : ""}`}
            role="tab"
            aria-selected={mode === "login"}
            onClick={() => { setMode("login"); setError(""); }}
          >
            Sign in
          </button>
          <button
            className={`seg-btn ${mode === "register" ? "seg-btn-active" : ""}`}
            role="tab"
            aria-selected={mode === "register"}
            onClick={() => { setMode("register"); setError(""); }}
          >
            Register
          </button>
        </div>

        <p className="auth-copy">
          {mode === "login"
            ? "Enter your credentials to access the evidence workspace."
            : "Create an operator account to start managing evidence."}
        </p>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="auth-form"
          suppressHydrationWarning
          noValidate
          role="tabpanel"
        >
          {mode === "register" && (
            <div className="field">
              <label className="field-label" htmlFor="name">Full name</label>
              <input
                id="name"
                className="input"
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

          <div className="field">
            <label className="field-label" htmlFor="email">Email address</label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="operator@evichain.local"
              autoComplete="email"
              suppressHydrationWarning
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
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
            <div className="field">
              <label className="field-label" htmlFor="role">Access role</label>
              <select
                id="role"
                className="input"
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as "Administrator" | "Investigator" | "Auditor")
                }
                suppressHydrationWarning
              >
                <option value="Administrator">Administrator</option>
                <option value="Investigator">Investigator</option>
                <option value="Auditor">Auditor (read-only)</option>
              </select>
            </div>
          )}

          {error && (
            <div className="alert-error" role="alert" aria-live="assertive">
              <span aria-hidden="true">⚠</span>
              {error}
            </div>
          )}

          <button
            className={`btn btn-primary btn-lg btn-full${loading ? " btn-loading" : ""}`}
            type="submit"
            disabled={loading}
            suppressHydrationWarning
          >
            {!loading && (mode === "login" ? "Sign in" : "Create account")}
          </button>

          <div className="auth-divider" aria-hidden="true">
            <span>or</span>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-md btn-full"
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            suppressHydrationWarning
          >
            {mode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
          </button>
        </form>

        <footer className="auth-footer">
          <p>By continuing you agree to EviChain&rsquo;s Terms of Service and Privacy Policy.</p>
        </footer>
      </section>
    </main>
  );
}
