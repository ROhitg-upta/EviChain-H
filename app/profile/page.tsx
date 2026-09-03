"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../auth-context";
import { useNotifications } from "../notification-context";
import {
  getAuditLogs,
  updateMyProfile,
  changePassword,
  getNotificationPreferences,
  updateNotificationPreferences,
  type AuditLog,
} from "@/lib/api";
import WorkspaceShell from "@/app/components/ui/workspace-shell";

type Tab = "general" | "security" | "preferences" | "activity";

interface NotificationPrefs {
  caseUpdates:     boolean;
  evidenceUploads: boolean;
  custodyTransfers:boolean;
  securityAlerts:  boolean;
  auditActivity:   boolean;
  reportReady:     boolean;
  weeklyDigest:    boolean;
}

export default function ProfilePage() {
  const { user, loading: authLoading, accessToken, signOut } = useAuth();
  const { toast } = useNotifications();
  const [tab, setTab] = useState<Tab>("general");

  // General
  const [name, setName]               = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Security
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword]   = useState(false);
  const [passwordError, setPasswordError]     = useState("");

  // Notification prefs
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    caseUpdates:     true,
    evidenceUploads: true,
    custodyTransfers:true,
    securityAlerts:  true,
    auditActivity:   false,
    reportReady:     true,
    weeklyDigest:    false,
  });
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Activity
  const [activity, setActivity]         = useState<AuditLog[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  // Seed form from user
  useEffect(() => {
    if (user) setName(user.name);
  }, [user]);

  // Load prefs from backend
  useEffect(() => {
    if (!accessToken) return;
    getNotificationPreferences(accessToken)
      .then((serverPrefs) => {
        setPrefs((prev) => ({
          ...prev,
          ...(serverPrefs as unknown as Partial<NotificationPrefs>),
          securityAlerts: true,
        }));
      })
      .catch(() => {});
  }, [accessToken]);

  // Load activity when tab switches
  useEffect(() => {
    if (tab !== "activity" || !accessToken) return;
    setLoadingActivity(true);
    getAuditLogs(accessToken, { actorUserId: user?.id, limit: 50 })
      .then((res) => setActivity(Array.isArray(res) ? res : res.items || []))
      .catch(() => setActivity([]))
      .finally(() => setLoadingActivity(false));
  }, [tab, accessToken, user?.id]);

  async function handleProfileSave(e: FormEvent) {
    e.preventDefault();
    if (!accessToken || !name.trim()) return;
    setSavingProfile(true);
    try {
      await updateMyProfile(accessToken, { name: name.trim() });
      toast({ type: "success", title: "Profile updated successfully" });
    } catch (err: unknown) {
      toast({ type: "error", title: "Update failed", message: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    setPasswordError("");

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword(accessToken!, {
        currentPassword,
        newPassword,
      });
      toast({ type: "success", title: "Password changed successfully" });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSavingPassword(false);
    }
  }


  async function handlePrefsSave() {
    if (!accessToken) return;
    setSavingPrefs(true);
    try {
      const saved = await updateNotificationPreferences(accessToken, prefs as unknown as Record<string, boolean>);
      setPrefs((prev) => ({
        ...prev,
        ...(saved as unknown as Partial<NotificationPrefs>),
        securityAlerts: true,
      }));
      toast({ type: "success", title: "Notification preferences saved" });
    } catch (err) {
      toast({ type: "error", title: "Save failed", message: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setSavingPrefs(false);
    }
  }

/** Map dot-notation action names to human-readable labels. */
function fmtAction(action: string): string {
  const map: Record<string, string> = {
    "auth.register":       "Account created",
    "auth.login":          "Signed in",
    "evidence.upload":     "Evidence uploaded",
    "evidence.view":       "Evidence viewed",
    "evidence.download":   "Evidence downloaded",
    "evidence.annotate":   "Evidence annotated",
    "case.create":         "Case created",
    "case.update":         "Case updated",
    "case.link_evidence":  "Evidence linked to case",
    "case.comment":        "Comment added",
    "user.update_profile": "Profile updated",
    "user.change_password":"Password changed",
    "user.admin_update":   "User updated by admin",
    "user.delete":         "User deleted",
  };
  return map[action] ?? action.replace(/\./g, " › ").replace(/\b\w/g, (c) => c.toUpperCase());
}

  function fmtDate(iso: string) {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium", timeStyle: "short",
    }).format(new Date(iso));
  }
  if (authLoading || !user) {
    return (
      <WorkspaceShell breadcrumbs={[{ label: 'Profile' }]}>
<div style={{ background: "var(--surface-base)", minHeight: "100%", padding: "24px", color: "var(--text-primary)" }}>
        <p className="cases-loading">Loading…</p>
      </div>
</WorkspaceShell>
    );
  }


  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: "general",     label: "General",          icon: "○" },
    { key: "security",    label: "Security",          icon: "⬡" },
    { key: "preferences", label: "Notifications",     icon: "◉" },
    { key: "activity",    label: "Activity history",  icon: "≡" },
  ];

  return (
    <WorkspaceShell breadcrumbs={[{ label: 'Profile' }]}>
<div style={{ background: "var(--surface-base)", minHeight: "100%", padding: "24px", color: "var(--text-primary)" }}>
      

      <div className="page-header" style={{ marginBottom: "24px" }}>
        <div>
          <p className="eyebrow" style={{ color: "var(--text-disabled)", fontFamily: "var(--font-mono)", fontSize: "12px", textTransform: "uppercase" }}>ACCOUNT</p>
          <h1 style={{ color: "var(--text-primary)", fontSize: "24px", margin: "8px 0" }}>Profile &amp; preferences</h1>
          <p className="ev-page-sub" style={{ color: "var(--text-secondary)" }}>Manage your account, security, and notification settings.</p>
        </div>
      </div>

      <div className="profile-layout">
        {/* Sidebar */}
        <aside className="profile-sidebar">
          <div className="profile-summary">
            <div className="profile-avatar-large" aria-hidden="true">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <p className="profile-name">{user.name}</p>
            <p className="profile-email">{user.email}</p>
            <span className="badge badge-brand">{user.role}</span>
          </div>

          <nav className="profile-nav" aria-label="Profile sections">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`profile-nav-item${tab === t.key ? " active" : ""}`}
                onClick={() => setTab(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
              >
                <span aria-hidden="true">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <section className="profile-content">

          {/* General */}
          {tab === "general" && (
            <div className="profile-card">
              <h2 style={{ color: "var(--text-primary)", fontSize: "18px", marginBottom: "16px" }}>General information</h2>
              <form onSubmit={handleProfileSave} className="profile-form" noValidate>
                <div className="field">
                  <label className="field-label" htmlFor="p-name">Full name</label>
                  <input
                    id="p-name"
                    className="input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="p-email">Email address</label>
                  <input
                    id="p-email"
                    className="input"
                    type="email"
                    value={user.email}
                    disabled
                  />
                  <small className="field-hint">
                    Email cannot be changed. Contact an administrator if needed.
                  </small>
                </div>
                <div className="field">
                  <label className="field-label">Access role</label>
                  <span className="badge badge-brand">{user.role}</span>
                </div>
                <div className="profile-form-actions">
                  <button
                    type="submit"
                    className="btn btn-primary btn-md"
                    disabled={savingProfile || name === user.name}
                  >
                    {savingProfile ? <span className="loading-spinner">Saving…</span> : "Save changes"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Security */}
          {tab === "security" && (
            <div className="profile-card">
              <h2 style={{ color: "var(--text-primary)", fontSize: "18px", marginBottom: "16px" }}>Change password</h2>
              <form onSubmit={handlePasswordChange} className="profile-form" noValidate>
                <div className="field">
                  <label className="field-label" htmlFor="p-cur">Current password</label>
                  <input
                    id="p-cur"
                    className="input"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="p-new">New password</label>
                  <input
                    id="p-new"
                    className="input"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    required
                    autoComplete="new-password"
                  />
                  <small className="field-hint">At least 8 characters.</small>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="p-confirm">Confirm new password</label>
                  <input
                    id="p-confirm"
                    className="input"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </div>
                {passwordError && (
                  <div className="alert-error" role="alert">{passwordError}</div>
                )}
                <div className="profile-form-actions">
                  <button
                    type="submit"
                    className="btn btn-primary btn-md"
                    disabled={savingPassword}
                  >
                    {savingPassword ? <span className="loading-spinner">Updating…</span> : "Update password"}
                  </button>
                </div>
              </form>

              {/* Danger zone */}
              <div className="profile-danger-zone">
                <p className="eyebrow" style={{ color: "var(--danger-text)", fontFamily: "var(--font-mono)", fontSize: "12px", textTransform: "uppercase" }}>Danger zone</p>
                <div className="profile-danger-row">
                  <div>
                    <strong>Sign out everywhere</strong>
                    <p>Clear your session and return to the login page.</p>
                  </div>
                  <button
                    className="btn btn-danger btn-md"
                    onClick={signOut}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Notification preferences */}
          {tab === "preferences" && (
            <div className="profile-card">
              <h2 style={{ color: "var(--text-primary)", fontSize: "18px", marginBottom: "16px" }}>Notification preferences</h2>
              <p className="profile-card-desc">
                Choose which notifications you want to receive. Preferences are saved to your account.
              </p>
              <div className="pref-list">
                {(
                  [
                    { key: "evidenceUploads",  label: "Evidence Uploads",    desc: "Notify me when new evidence is registered or attached to my cases." },
                    { key: "caseUpdates",      label: "Case Updates",        desc: "Notify me when case status, priority, or details are updated." },
                    { key: "custodyTransfers", label: "Custody Transfers",   desc: "Notify me when chain-of-custody transfer events are assigned to me." },
                    { key: "securityAlerts",   label: "Security Alerts",     desc: "Critical integrity mismatches and security events (Always active).", locked: true },
                    { key: "auditActivity",    label: "Audit Ledger Export", desc: "Notify me when asynchronous audit logs or compliance data is generated." },
                    { key: "reportReady",      label: "Judicial Reports",    desc: "Notify me when official case intelligence dossiers are compiled." },
                    { key: "weeklyDigest",     label: "Weekly Digest",       desc: "A periodic summary of case activity and evidence statistics." },
                  ] as const
                ).map((p) => (
                  <label key={p.key} className="pref-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-default)" }}>
                    <div>
                      <p className="pref-title" style={{ fontWeight: 700, margin: "0 0 2px", fontSize: "13px", color: "var(--text-primary)" }}>{p.label}</p>
                      <p className="pref-desc" style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)" }}>{p.desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(prefs[p.key])}
                      disabled={"locked" in p && p.locked}
                      onChange={(e) => setPrefs({ ...prefs, [p.key]: e.target.checked })}
                      aria-label={p.label}
                      style={{ width: "16px", height: "16px", cursor: "locked" in p && p.locked ? "not-allowed" : "pointer" }}
                    />
                  </label>
                ))}
              </div>
              <div className="profile-form-actions">
                <button
                  className="btn btn-primary btn-md"
                  onClick={handlePrefsSave}
                  disabled={savingPrefs}
                >
                  {savingPrefs ? <span className="loading-spinner">Saving…</span> : "Save preferences"}
                </button>
              </div>
            </div>
          )}

          {/* Activity */}
          {tab === "activity" && (
            <div className="profile-card">
              <h2 style={{ color: "var(--text-primary)", fontSize: "18px", marginBottom: "16px" }}>Activity history</h2>
              <p className="profile-card-desc">
                All actions performed under your account, most recent first.
              </p>
              {loadingActivity ? (
                <p className="cases-loading">Loading activity…</p>
              ) : activity.length === 0 ? (
                <div className="ev-empty-state">
                  <strong>No activity recorded yet.</strong>
                </div>
              ) : (
                <ol className="activity-history-list" aria-label="Activity history">
                  {activity.map((a) => (
                    <li key={a.id} className="activity-history-item">
                      <div>
                        <p className="activity-history-action">{fmtAction(a.action)}</p>
                        <p className="activity-history-time">{fmtDate(a.timestamp)}</p>
                      </div>
                      {a.ipAddress && (
                        <code className="activity-history-ip">{a.ipAddress}</code>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
</WorkspaceShell>
  );
}
