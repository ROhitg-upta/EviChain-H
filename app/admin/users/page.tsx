"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../auth-context";
import { useNotifications } from "../../notification-context";
import {
  getAdminUsers,
  createAdminUser,
  updateAdminUserRole,
  updateAdminUserStatus,
  deleteUser,
  type UserRecord,
} from "@/lib/api";
import WorkspaceShell from "@/app/components/ui/workspace-shell";

function fmtDate(iso?: string | null) {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default function AdminUsersPage() {
  const { user, loading: authLoading, accessToken } = useAuth();
  const { toast } = useNotifications();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "INVESTIGATOR" as "ADMINISTRATOR" | "INVESTIGATOR" | "AUDITOR" | "CUSTODIAN",
  });
  const [creating, setCreating] = useState(false);

  // Confirmation Modal State
  const [confirmAction, setConfirmAction] = useState<{
    type: "ROLE" | "STATUS" | "DELETE";
    user: UserRecord;
    newRole?: "ADMINISTRATOR" | "INVESTIGATOR" | "AUDITOR" | "CUSTODIAN";
    newStatus?: boolean;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const isAdmin = user?.role === "Administrator";

  const loadUsers = async () => {
    if (!accessToken || !isAdmin) return;
    setFetching(true);
    setError("");
    try {
      const res = await getAdminUsers(accessToken, {
        page,
        pageSize: 15,
        role: roleFilter !== "ALL" ? roleFilter : undefined,
        status: statusFilter !== "ALL" ? statusFilter.toLowerCase() : undefined,
        q: search.trim() || undefined,
      });
      setUsers(res.items || res.users || []);
      setTotalPages(res.pagination.totalPages || 1);
      setTotalItems(res.pagination.totalItems || 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load users");
      setUsers([]);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [accessToken, page, roleFilter, statusFilter, isAdmin]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadUsers();
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setCreating(true);
    try {
      await createAdminUser(accessToken, createForm);
      toast({
        type: "success",
        title: "User Provisioned",
        message: `Account for ${createForm.name} (${createForm.role}) was created successfully.`,
      });
      setShowCreateModal(false);
      setCreateForm({ name: "", email: "", password: "", role: "INVESTIGATOR" });
      loadUsers();
    } catch (err) {
      toast({
        type: "error",
        title: "Provisioning Failed",
        message: err instanceof Error ? err.message : "Failed to create user account.",
      });
    } finally {
      setCreating(false);
    }
  };

  const executeConfirmAction = async () => {
    if (!accessToken || !confirmAction) return;
    setActionLoading(true);
    try {
      if (confirmAction.type === "ROLE" && confirmAction.newRole) {
        await updateAdminUserRole(accessToken, confirmAction.user.id, confirmAction.newRole);
        toast({
          type: "success",
          title: "Clearance Role Updated",
          message: `${confirmAction.user.name}'s role was changed to ${confirmAction.newRole}.`,
        });
      } else if (confirmAction.type === "STATUS" && confirmAction.newStatus !== undefined) {
        await updateAdminUserStatus(accessToken, confirmAction.user.id, confirmAction.newStatus);
        toast({
          type: "success",
          title: confirmAction.newStatus ? "Account Activated" : "Account Deactivated",
          message: `${confirmAction.user.name} is now ${confirmAction.newStatus ? "active" : "deactivated and signed out"}.`,
        });
      } else if (confirmAction.type === "DELETE") {
        await deleteUser(accessToken, confirmAction.user.id);
        toast({
          type: "success",
          title: "Account Removed",
          message: `Account ${confirmAction.user.email} was permanently deleted.`,
        });
      }
      setConfirmAction(null);
      loadUsers();
    } catch (err) {
      toast({
        type: "error",
        title: "Operation Failed",
        message: err instanceof Error ? err.message : "Failed to execute administrative action.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  if (authLoading) {
    return (
      <WorkspaceShell breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Users" }]}>
        <div style={{ background: "var(--surface-base)", minHeight: "100%", padding: "24px" }}>
          <p className="cases-loading">Verifying administrative credentials…</p>
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
            <h2 style={{ fontSize: 20, color: "var(--text-primary)", marginBottom: 8 }}>Restricted Administrative Portal</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.5, marginBottom: 24 }}>
              Your clearance level ({user?.role || "Visitor"}) does not permit user directory access or operator role manipulation.
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
    <WorkspaceShell breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Users" }]}>
      <div style={{ background: "var(--surface-base)", minHeight: "100%", padding: "24px", color: "var(--text-primary)" }}>
        
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>🛡️</span>
              <p className="eyebrow" style={{ color: "var(--accent-primary)", fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.08em" }}>
                OPERATOR ACCESS & IDENTITY CONTROL
              </p>
            </div>
            <h1 style={{ color: "var(--text-primary)", fontSize: 26, fontWeight: 700, margin: "6px 0" }}>
              User Directory & Role Management
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
              Manage forensic investigator clearance, provision new operators, and monitor account authentication status.
            </p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600 }}
          >
            ➕ Provision Operator
          </button>
        </div>

        {/* Filters & Search */}
        <div className="panel" style={{ padding: 16, marginBottom: 20, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
          <form onSubmit={handleSearchSubmit} style={{ display: "flex", flex: "1 1 300px", gap: 8 }}>
            <div style={{ position: "relative", width: "100%" }}>
              <input
                className="input"
                style={{ width: "100%", fontSize: 13 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Search operators by name or email…"
              />
            </div>
            <button type="submit" className="btn btn-secondary" style={{ padding: "8px 16px", fontSize: 13 }}>
              Search
            </button>
          </form>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              className="input"
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              style={{ fontSize: 13, padding: "6px 12px", width: "auto" }}
            >
              <option value="ALL">All Roles</option>
              <option value="ADMINISTRATOR">Administrator</option>
              <option value="INVESTIGATOR">Investigator</option>
              <option value="AUDITOR">Auditor</option>
              <option value="CUSTODIAN">Custodian</option>
            </select>

            <select
              className="input"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              style={{ fontSize: 13, padding: "6px 12px", width: "auto" }}
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Deactivated</option>
            </select>
          </div>
        </div>

        {error && (
          <div style={{ color: "var(--accent-danger)", border: "1px solid var(--accent-danger)", background: "rgba(244, 63, 94, 0.1)", padding: "12px 16px", borderRadius: 6, marginBottom: 20, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Directory Table */}
        <div className="panel" style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: 8, overflow: "hidden" }}>
          {fetching ? (
            <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
              Loading identity records from database…
            </div>
          ) : users.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center" }}>
              <p style={{ color: "var(--text-primary)", fontWeight: 600, marginBottom: 4 }}>No operators found</p>
              <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Try adjusting search parameters or provision a new user.</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--surface-base)", borderBottom: "1px solid var(--border-subtle)" }}>
                    <th style={{ padding: "12px 16px", color: "var(--text-secondary)", fontWeight: 600 }}>Operator</th>
                    <th style={{ padding: "12px 16px", color: "var(--text-secondary)", fontWeight: 600 }}>Clearance Role</th>
                    <th style={{ padding: "12px 16px", color: "var(--text-secondary)", fontWeight: 600 }}>Account Status</th>
                    <th style={{ padding: "12px 16px", color: "var(--text-secondary)", fontWeight: 600 }}>Last Authentication</th>
                    <th style={{ padding: "12px 16px", color: "var(--text-secondary)", fontWeight: 600 }}>Registered</th>
                    <th style={{ padding: "12px 16px", color: "var(--text-secondary)", fontWeight: 600, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isActive = u.isActive !== false;
                    const isSelf = u.id === user?.id;

                    return (
                      <tr key={u.id} style={{ borderBottom: "1px solid var(--border-subtle)", opacity: isActive ? 1 : 0.65 }}>
                        {/* User Identity */}
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--surface-base)", border: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, color: "var(--accent-primary)" }}>
                              {u.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                                {u.name} {isSelf && <span style={{ fontSize: 10, padding: "2px 6px", background: "rgba(59, 130, 246, 0.2)", color: "#60a5fa", borderRadius: 4, marginLeft: 6 }}>YOU</span>}
                              </div>
                              <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{u.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Role Select */}
                        <td style={{ padding: "14px 16px" }}>
                          <select
                            className="input"
                            value={u.role}
                            style={{ fontSize: 12, padding: "4px 8px", width: "auto", cursor: "pointer", fontWeight: 600 }}
                            onChange={(e) => {
                              const newRole = e.target.value as "ADMINISTRATOR" | "INVESTIGATOR" | "AUDITOR" | "CUSTODIAN";
                              if (newRole !== u.role) {
                                setConfirmAction({
                                  type: "ROLE",
                                  user: u,
                                  newRole,
                                });
                              }
                            }}
                          >
                            <option value="ADMINISTRATOR">ADMINISTRATOR</option>
                            <option value="INVESTIGATOR">INVESTIGATOR</option>
                            <option value="AUDITOR">AUDITOR</option>
                            <option value="CUSTODIAN">CUSTODIAN</option>
                          </select>
                        </td>

                        {/* Status Badge */}
                        <td style={{ padding: "14px 16px" }}>
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "3px 10px",
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 600,
                            background: isActive ? "rgba(34, 197, 94, 0.15)" : "rgba(244, 63, 94, 0.15)",
                            color: isActive ? "#4ade80" : "#f87171",
                            border: `1px solid ${isActive ? "rgba(34, 197, 94, 0.3)" : "rgba(244, 63, 94, 0.3)"}`,
                          }}>
                            {isActive ? "● Active" : "○ Deactivated"}
                          </span>
                        </td>

                        {/* Last Login */}
                        <td style={{ padding: "14px 16px", color: "var(--text-secondary)", fontSize: 12 }}>
                          {fmtDate(u.lastLogin)}
                        </td>

                        {/* Created At */}
                        <td style={{ padding: "14px 16px", color: "var(--text-muted)", fontSize: 12 }}>
                          {fmtDate(u.createdAt)}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: "14px 16px", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: 8 }}>
                            <button
                              onClick={() => setConfirmAction({
                                type: "STATUS",
                                user: u,
                                newStatus: !isActive,
                              })}
                              className={`btn ${isActive ? "btn-secondary" : "btn-primary"}`}
                              style={{ padding: "4px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
                            >
                              {isActive ? "Deactivate" : "Activate"}
                            </button>

                            {!isSelf && (
                              <button
                                onClick={() => setConfirmAction({
                                  type: "DELETE",
                                  user: u,
                                })}
                                className="btn btn-secondary"
                                style={{ padding: "4px 8px", color: "var(--accent-danger)", border: "1px solid rgba(244, 63, 94, 0.3)" }}
                                title="Permanently delete user"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: "1px solid var(--border-subtle)", fontSize: 13 }}>
              <span style={{ color: "var(--text-muted)" }}>
                Showing page {page} of {totalPages} ({totalItems} operators total)
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="btn btn-secondary"
                  style={{ padding: "4px 12px", fontSize: 12 }}
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="btn btn-secondary"
                  style={{ padding: "4px 12px", fontSize: 12 }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Create User Modal */}
        {showCreateModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
            <div className="panel" style={{ width: "100%", maxWidth: 460, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ fontSize: 18, color: "var(--text-primary)", fontWeight: 700 }}>Provision New Operator</h3>
                <button onClick={() => setShowCreateModal(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18 }}>✕</button>
              </div>

              <form onSubmit={handleCreateUser} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Full Name</label>
                  <input
                    required
                    className="input"
                    style={{ width: "100%", fontSize: 13 }}
                    placeholder="e.g. Agent Sarah Connor"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Official Email</label>
                  <input
                    required
                    type="email"
                    className="input"
                    style={{ width: "100%", fontSize: 13 }}
                    placeholder="s.connor@forensics.gov"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Temporary Password (min 8 chars)</label>
                  <input
                    required
                    type="password"
                    className="input"
                    style={{ width: "100%", fontSize: 13 }}
                    placeholder="••••••••••••"
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Clearance Role</label>
                  <select
                    className="input"
                    style={{ width: "100%", fontSize: 13 }}
                    value={createForm.role}
                    onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as "ADMINISTRATOR" | "INVESTIGATOR" | "AUDITOR" | "CUSTODIAN" })}
                  >
                    <option value="INVESTIGATOR">Investigator (Lead cases, upload & transfer evidence)</option>
                    <option value="AUDITOR">Auditor (Read-only forensic ledger & report inspection)</option>
                    <option value="CUSTODIAN">Custodian (Evidence intake & custody management)</option>
                    <option value="ADMINISTRATOR">Administrator (Full tenant access & user provisioning)</option>
                  </select>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
                  <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary" style={{ padding: "8px 16px", fontSize: 13 }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={creating} className="btn btn-primary" style={{ padding: "8px 18px", fontSize: 13 }}>
                    {creating ? "Provisioning…" : "Create Operator Account"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Confirmation Modal */}
        {confirmAction && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
            <div className="panel" style={{ width: "100%", maxWidth: 440, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <h3 style={{ fontSize: 18, color: "var(--text-primary)", fontWeight: 700 }}>
                  Confirm Administrative Action
                </h3>
              </div>

              <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
                {confirmAction.type === "ROLE" && (
                  <>Are you sure you want to change <strong>{confirmAction.user.name}</strong>'s clearance role to <strong>{confirmAction.newRole}</strong>?</>
                )}
                {confirmAction.type === "STATUS" && (
                  <>Are you sure you want to {confirmAction.newStatus ? "reactivate" : "deactivate"} <strong>{confirmAction.user.name}</strong>? {!confirmAction.newStatus && "This will immediately revoke all active sessions and block authentication."}</>
                )}
                {confirmAction.type === "DELETE" && (
                  <>Are you sure you want to permanently delete <strong>{confirmAction.user.name}</strong> ({confirmAction.user.email})? This action cannot be undone.</>
                )}
              </p>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  className="btn btn-secondary"
                  style={{ padding: "8px 16px", fontSize: 13 }}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeConfirmAction}
                  className="btn btn-primary"
                  style={{ padding: "8px 18px", fontSize: 13 }}
                  disabled={actionLoading}
                >
                  {actionLoading ? "Processing…" : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </WorkspaceShell>
  );
}
