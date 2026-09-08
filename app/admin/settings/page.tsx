"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../auth-context";
import { useNotifications } from "../../notification-context";
import { getAdminSettings, updateAdminSettings, type SystemSettings } from "@/lib/api";
import WorkspaceShell from "@/app/components/ui/workspace-shell";

export default function AdminSettingsPage() {
  const { user, loading: authLoading, accessToken } = useAuth();
  const { toast } = useNotifications();

  const [settings, setSettings] = useState<SystemSettings>({
    organizationName: "EviChain Forensic Division",
    retentionPolicyDays: 365,
    requireMfa: false,
    allowPublicVerification: true,
    sessionTimeoutMinutes: 60,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = user?.role === "Administrator";

  useEffect(() => {
    if (!accessToken || !isAdmin) return;
    setLoading(true);
    getAdminSettings(accessToken)
      .then((data) => {
        setSettings(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load system settings");
      })
      .finally(() => setLoading(false));
  }, [accessToken, isAdmin]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setSaving(true);
    setError("");
    try {
      const res = await updateAdminSettings(accessToken, settings);
      setSettings(res.settings);
      toast({
        type: "success",
        title: "Settings Saved",
        message: "System configuration parameters updated and audited.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save settings.";
      setError(msg);
      toast({
        type: "error",
        title: "Configuration Error",
        message: msg,
      });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <WorkspaceShell breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Settings" }]}>
        <div style={{ background: "var(--surface-base)", minHeight: "100%", padding: "24px" }}>
          <p className="cases-loading">Loading system configuration…</p>
        </div>
      </WorkspaceShell>
    );
  }

  if (!isAdmin) {
    return (
      <WorkspaceShell breadcrumbs={[{ label: "Access Denied" }]}>
        <div style={{ background: "var(--surface-base)", minHeight: "100%", padding: "48px 24px", textAlign: "center" }}>
          <div style={{ maxWidth: 480, margin: "0 auto", padding: 32, background: "var(--surface-card)", border: "1px solid var(--accent-danger)", borderRadius: 8 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 8 }}>Restricted Configuration</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.5, marginBottom: 24 }}>
              Your clearance level ({user?.role || "Visitor"}) does not permit modifying system parameters.
            </p>
            <a href="/dashboard" className="btn btn-primary" style={{ textDecoration: "none", display: "inline-block" }}>
              Return to Dashboard
            </a>
          </div>
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Settings" }]}>
      <div style={{ background: "var(--surface-base)", minHeight: "100%", padding: "24px", color: "var(--text-primary)" }}>
        
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚙️</span>
            <p className="eyebrow" style={{ color: "var(--accent-primary)", fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.08em" }}>
              GOVERNANCE & PLATFORM POLICY
            </p>
          </div>
          <h1 style={{ color: "var(--text-primary)", fontSize: 26, fontWeight: 700, margin: "6px 0" }}>
            Global System Configuration
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            Control forensic tenant policies, evidence retention schedules, public verification availability, and session timeouts.
          </p>
        </div>

        {error && (
          <div style={{ color: "var(--accent-danger)", border: "1px solid var(--accent-danger)", background: "rgba(244, 63, 94, 0.1)", padding: "12px 16px", borderRadius: 6, marginBottom: 20, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Main Form */}
          <form onSubmit={handleSave} className="lg:col-span-2 flex flex-col gap-5">
            
            {/* Organization Identity */}
            <div className="panel" style={{ padding: 20, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 16 }}>🌐</span>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>Organization Branding & Scope</h2>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                    Organization / Law Enforcement Agency Name
                  </label>
                  <input
                    required
                    className="input"
                    style={{ width: "100%", fontSize: 13 }}
                    value={settings.organizationName}
                    onChange={(e) => setSettings({ ...settings, organizationName: e.target.value })}
                  />
                  <small style={{ display: "block", color: "var(--text-muted)", fontSize: 11, marginTop: 4 }}>
                    Appears on courtroom-admissible PDF intelligence summaries and exported evidence dossiers.
                  </small>
                </div>
              </div>
            </div>

            {/* Retention & Compliance */}
            <div className="panel" style={{ padding: 20, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 16 }}>🗄️</span>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>Retention & Evidence Custody Policy</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                    Evidence Retention Window (Days)
                  </label>
                  <input
                    type="number"
                    min="30"
                    max="3650"
                    className="input"
                    style={{ width: "100%", fontSize: 13 }}
                    value={settings.retentionPolicyDays}
                    onChange={(e) => setSettings({ ...settings, retentionPolicyDays: parseInt(e.target.value, 10) || 365 })}
                  />
                  <small style={{ display: "block", color: "var(--text-muted)", fontSize: 11, marginTop: 4 }}>
                    Statutory holding period before evidence flag for judicial review.
                  </small>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                    Session Inactivity Timeout (Minutes)
                  </label>
                  <input
                    type="number"
                    min="15"
                    max="1440"
                    className="input"
                    style={{ width: "100%", fontSize: 13 }}
                    value={settings.sessionTimeoutMinutes}
                    onChange={(e) => setSettings({ ...settings, sessionTimeoutMinutes: parseInt(e.target.value, 10) || 60 })}
                  />
                  <small style={{ display: "block", color: "var(--text-muted)", fontSize: 11, marginTop: 4 }}>
                    Idle operators are automatically de-authenticated after this window.
                  </small>
                </div>
              </div>
            </div>

            {/* Security Toggles */}
            <div className="panel" style={{ padding: 20, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 16 }}>🔒</span>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>Security & Public Verification Gateway</h2>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={settings.allowPublicVerification}
                    onChange={(e) => setSettings({ ...settings, allowPublicVerification: e.target.checked })}
                    style={{ width: 16, height: 16, accentColor: "var(--accent-primary)" }}
                  />
                  <span>
                    <strong>Enable Public Evidence Verification Portal (/verify)</strong>
                    <span style={{ display: "block", color: "var(--text-muted)", fontSize: 11 }}>
                      Allows judicial auditors and public counsel to verify SHA-256 fingerprints without active login credentials.
                    </span>
                  </span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={settings.requireMfa}
                    onChange={(e) => setSettings({ ...settings, requireMfa: e.target.checked })}
                    style={{ width: 16, height: 16, accentColor: "var(--accent-primary)" }}
                  />
                  <span>
                    <strong>Enforce Multi-Factor Authentication (MFA) on Critical Role Actions</strong>
                    <span style={{ display: "block", color: "var(--text-muted)", fontSize: 11 }}>
                      Requires TOTP step-up authentication before evidence destruction or root custody overrides.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {/* Submit Action */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary"
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 24px", fontSize: 14, fontWeight: 600 }}
              >
                💾 {saving ? "Saving Policy…" : "Save Configuration"}
              </button>
            </div>
          </form>

          {/* Compliance Sidebar */}
          <aside className="panel" style={{ padding: 20, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 16 }}>🛡️</span>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>Audit Compliance Rules</h3>
            </div>

            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <strong style={{ color: "var(--text-primary)" }}>1. Immutable Audit Ledger</strong>
                <p style={{ margin: "2px 0 0", color: "var(--text-muted)", fontSize: 12 }}>
                  Every configuration change writes an immutable audit record with full before/after diffs and actor IP.
                </p>
              </div>

              <div>
                <strong style={{ color: "var(--text-primary)" }}>2. Strict Administrator Role</strong>
                <p style={{ margin: "2px 0 0", color: "var(--text-muted)", fontSize: 12 }}>
                  Only operators with role <code>ADMINISTRATOR</code> can read or modify system parameters.
                </p>
              </div>

              <div>
                <strong style={{ color: "var(--text-primary)" }}>3. Retention Guarantees</strong>
                <p style={{ margin: "2px 0 0", color: "var(--text-muted)", fontSize: 12 }}>
                  Altering retention periods does not delete past digital assets without judicial signoff.
                </p>
              </div>
            </div>
          </aside>

        </div>

      </div>
    </WorkspaceShell>
  );
}
