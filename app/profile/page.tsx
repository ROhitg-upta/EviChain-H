"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../auth-context";
import { useNotifications } from "../notification-context";
import {
  getAuditLogs,
  updateProfile,
  changePassword,
  getNotificationPreferences,
  updateNotificationPreferences,
  getProfileSecurity,
  type AuditLog,
  type SecurityOverview,
} from "@/lib/api";
import WorkspaceShell from "@/app/components/ui/workspace-shell";

type Tab = "general" | "security" | "preferences" | "activity";

interface NotificationPrefs {
  caseUpdates: boolean;
  evidenceUploads: boolean;
  custodyTransfers: boolean;
  securityAlerts: boolean;
  auditActivity: boolean;
  reportReady: boolean;
  weeklyDigest: boolean;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading: authLoading, accessToken, signOut } = useAuth();
  const { toast } = useNotifications();
  const [tab, setTab] = useState<Tab>("general");

  // General
  const [name, setName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Security Form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Security Overview
  const [securityData, setSecurityData] = useState<SecurityOverview | null>(null);
  const [loadingSecurity, setLoadingSecurity] = useState(false);

  // Notification prefs
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    caseUpdates: true,
    evidenceUploads: true,
    custodyTransfers: true,
    securityAlerts: true,
    auditActivity: false,
    reportReady: true,
    weeklyDigest: false,
  });
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Activity
  const [activity, setActivity] = useState<AuditLog[]>([]);
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

  // Load security overview
  useEffect(() => {
    if (tab !== "security" || !accessToken) return;
    setLoadingSecurity(true);
    getProfileSecurity(accessToken)
      .then(setSecurityData)
      .catch(() => {})
      .finally(() => setLoadingSecurity(false));
  }, [tab, accessToken]);

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
      await updateProfile(accessToken, { name: name.trim() });
      toast({ type: "success", title: "Profile updated successfully" });
    } catch (err: unknown) {
      toast({
        type: "error",
        title: "Update failed",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);

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
      setPasswordSuccess(true);
      toast({
        type: "success",
        title: "Password Changed",
        message: "All sessions have been revoked. Redirecting to login…",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setTimeout(async () => {
        await signOut();
        router.push("/login");
      }, 2500);
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
      const saved = await updateNotificationPreferences(
        accessToken,
        prefs as unknown as Record<string, boolean>,
      );
      setPrefs((prev) => ({
        ...prev,
        ...(saved as unknown as Partial<NotificationPrefs>),
        securityAlerts: true,
      }));
      toast({ type: "success", title: "Notification preferences saved" });
    } catch (err) {
      toast({
        type: "error",
        title: "Save failed",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSavingPrefs(false);
    }
  }

  function fmtDate(iso?: string | null) {
    if (!iso) return "Never";
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  }

  if (authLoading || !user) {
    return (
      <WorkspaceShell breadcrumbs={[{ label: "Profile" }]}>
        <div style={{ background: "var(--surface-base)", minHeight: "100%", padding: "24px", color: "var(--text-primary)" }}>
          <p className="cases-loading">Loading operator profile…</p>
        </div>
      </WorkspaceShell>
    );
  }

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: "general", label: "General", icon: "👤" },
    { key: "security", label: "Security & Sessions", icon: "🛡️" },
    { key: "preferences", label: "Notifications", icon: "🔔" },
    { key: "activity", label: "Audit Trail", icon: "📊" },
  ];

  return (
    <WorkspaceShell breadcrumbs={[{ label: "Profile" }]}>
      <div style={{ background: "var(--surface-base)", minHeight: "100%", padding: "24px", color: "var(--text-primary)" }}>
        
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--surface-card)", border: "2px solid var(--accent-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, color: "var(--accent-primary)" }}>
              {user.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                  {user.name}
                </h1>
                <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 12, fontWeight: 700, background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", border: "1px solid rgba(59, 130, 246, 0.3)" }}>
                  {user.role}
                </span>
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "4px 0 0" }}>
                {user.email} · Operator ID: {user.id.slice(0, 8)}…
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border-subtle)", marginBottom: 24 }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: active ? "var(--accent-primary)" : "var(--text-secondary)",
                  background: "transparent",
                  border: "none",
                  borderBottom: active ? "2px solid var(--accent-primary)" : "2px solid transparent",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── TAB 1: GENERAL ────────────────────────────────────────── */}
        {tab === "general" && (
          <div style={{ maxWidth: 640 }}>
            <div className="panel" style={{ padding: 24, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>
                Personal Information
              </h2>

              <form onSubmit={handleProfileSave} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                    Full Legal Name
                  </label>
                  <input
                    required
                    className="input"
                    style={{ width: "100%", fontSize: 13 }}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                    Email Address (Read-only)
                  </label>
                  <input
                    disabled
                    className="input"
                    style={{ width: "100%", fontSize: 13, opacity: 0.6, cursor: "not-allowed" }}
                    value={user.email}
                  />
                  <small style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 4, display: "block" }}>
                    Email modification requires administrator intervention.
                  </small>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                    Clearance Role
                  </label>
                  <input
                    disabled
                    className="input"
                    style={{ width: "100%", fontSize: 13, opacity: 0.6, cursor: "not-allowed" }}
                    value={user.role}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="btn btn-primary"
                    style={{ padding: "8px 20px", fontSize: 13, fontWeight: 600 }}
                  >
                    {savingProfile ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── TAB 2: SECURITY & SESSIONS ────────────────────────────── */}
        {tab === "security" && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: 24, alignItems: "start" }}>
            
            {/* Password Change Form */}
            <div className="panel" style={{ padding: 24, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 18 }}>🔑</span>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                  Change Master Password
                </h2>
              </div>

              {passwordSuccess && (
                <div style={{ background: "rgba(34, 197, 94, 0.15)", border: "1px solid rgba(34, 197, 94, 0.3)", color: "#4ade80", padding: "12px 16px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
                  Password changed successfully. All active sessions have been revoked. Redirecting to login…
                </div>
              )}

              {passwordError && (
                <div style={{ background: "rgba(244, 63, 94, 0.15)", border: "1px solid rgba(244, 63, 94, 0.3)", color: "#f87171", padding: "12px 16px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
                  {passwordError}
                </div>
              )}

              <form onSubmit={handlePasswordChange} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                    Current Password
                  </label>
                  <input
                    required
                    type="password"
                    className="input"
                    style={{ width: "100%", fontSize: 13 }}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                    New Password (min 8 characters)
                  </label>
                  <input
                    required
                    type="password"
                    className="input"
                    style={{ width: "100%", fontSize: 13 }}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                    Confirm New Password
                  </label>
                  <input
                    required
                    type="password"
                    className="input"
                    style={{ width: "100%", fontSize: 13 }}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>

                <div style={{ background: "var(--surface-base)", padding: "10px 14px", borderRadius: 6, fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  <strong style={{ color: "var(--text-primary)", display: "block", marginBottom: 2 }}>Security Notice:</strong>
                  Changing your password will instantly revoke all existing refresh tokens and require re-authentication across all devices.
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                  <button
                    type="submit"
                    disabled={savingPassword || passwordSuccess}
                    className="btn btn-primary"
                    style={{ padding: "8px 20px", fontSize: 13, fontWeight: 600 }}
                  >
                    {savingPassword ? "Updating…" : "Update Password & Revoke Sessions"}
                  </button>
                </div>
              </form>
            </div>

            {/* Security Overview & Active Sessions */}
            <div className="panel" style={{ padding: 24, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 18 }}>💻</span>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                  Account Security Health
                </h2>
              </div>

              {loadingSecurity ? (
                <div style={{ color: "var(--text-muted)", fontSize: 13, padding: 16, textAlign: "center" }}>
                  Inspecting security ledger…
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 10, borderBottom: "1px solid var(--border-subtle)" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Active Auth Sessions</span>
                    <strong style={{ color: "var(--accent-primary)", fontFamily: "var(--font-mono)" }}>
                      {securityData?.activeSessions || 1} Active
                    </strong>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 10, borderBottom: "1px solid var(--border-subtle)" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Last Sign-In</span>
                    <span style={{ color: "var(--text-primary)" }}>{fmtDate(securityData?.lastLogin)}</span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 10, borderBottom: "1px solid var(--border-subtle)" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Account Created</span>
                    <span style={{ color: "var(--text-primary)" }}>{fmtDate(securityData?.accountCreated)}</span>
                  </div>

                  <div>
                    <strong style={{ display: "block", color: "var(--text-primary)", marginBottom: 8, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Recent Security Events
                    </strong>
                    {securityData?.recentEvents && securityData.recentEvents.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {securityData.recentEvents.slice(0, 4).map((evt) => (
                          <div key={evt.id} style={{ background: "var(--surface-base)", padding: "8px 12px", borderRadius: 6, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
                            <div>
                              <strong style={{ color: "var(--text-primary)" }}>{evt.action}</strong>
                              <span style={{ color: "var(--text-muted)", display: "block", fontSize: 10 }}>IP: {evt.ipAddress || "127.0.0.1"}</span>
                            </div>
                            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{fmtDate(evt.timestamp)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: "var(--text-muted)", fontSize: 12 }}>No recent security events recorded.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ── TAB 3: NOTIFICATION PREFERENCES ───────────────────────── */}
        {tab === "preferences" && (
          <div style={{ maxWidth: 640 }}>
            <div className="panel" style={{ padding: 24, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
                Notification Channels & Subscriptions
              </h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
                Control which forensic events trigger live alert broadcasts. Critical security alerts cannot be disabled.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  { key: "caseUpdates", label: "Case Assignment & Status Changes", desc: "When cases you lead or participate in are modified" },
                  { key: "evidenceUploads", label: "Evidence Ingestion Alerts", desc: "When new evidence is added to your active investigations" },
                  { key: "custodyTransfers", label: "Chain of Custody Transfers", desc: "When digital custody is transferred to or from your account" },
                  { key: "securityAlerts", label: "Security & Authentication Alerts (Mandatory)", desc: "Password modifications, role updates, and new logins", locked: true },
                  { key: "reportReady", label: "Intelligence Dossier & Export Readiness", desc: "When background PDF dossiers or CSV exports finish generating" },
                  { key: "weeklyDigest", label: "Weekly Forensic Summary Digest", desc: "Weekly email summary of closed cases and audit checkpoints" },
                ].map((item) => (
                  <label key={item.key} style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: item.locked ? "not-allowed" : "pointer" }}>
                    <input
                      type="checkbox"
                      disabled={item.locked}
                      checked={item.locked ? true : prefs[item.key as keyof NotificationPrefs]}
                      onChange={(e) => setPrefs({ ...prefs, [item.key]: e.target.checked })}
                      style={{ width: 16, height: 16, accentColor: "var(--accent-primary)", marginTop: 2 }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: item.locked ? "var(--text-muted)" : "var(--text-primary)" }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{item.desc}</div>
                    </div>
                  </label>
                ))}

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                  <button
                    onClick={handlePrefsSave}
                    disabled={savingPrefs}
                    className="btn btn-primary"
                    style={{ padding: "8px 20px", fontSize: 13, fontWeight: 600 }}
                  >
                    {savingPrefs ? "Saving…" : "Save Preferences"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 4: AUDIT TRAIL ────────────────────────────────────── */}
        {tab === "activity" && (
          <div className="panel" style={{ padding: 24, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>
              Personal Operational Audit Log
            </h2>

            {loadingActivity ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                Loading operator audit trail…
              </div>
            ) : activity.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                No audit activity logged for this account.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
                      <th style={{ padding: "10px 12px" }}>Action</th>
                      <th style={{ padding: "10px 12px" }}>Target</th>
                      <th style={{ padding: "10px 12px" }}>IP Address</th>
                      <th style={{ padding: "10px 12px" }}>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((act) => (
                      <tr key={act.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--text-primary)" }}>{act.action}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                          {act.resourceType}:{act.resourceId?.slice(0, 8)}…
                        </td>
                        <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: 12 }}>{act.ipAddress || "127.0.0.1"}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: 12 }}>{fmtDate(act.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </WorkspaceShell>
  );
}
