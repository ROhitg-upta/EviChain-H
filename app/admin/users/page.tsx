"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../auth-context";
import { useNotifications } from "../../notification-context";
import { getAllUsers, updateUserRole, type UserRecord } from "@/lib/api";
import WorkspaceShell from "@/app/components/ui/workspace-shell";



const ROLE_CLASS: Record<string, string> = {
  ADMINISTRATOR: "case-status--active",
  INVESTIGATOR:  "case-status--review",
  AUDITOR:       "case-status--closed",
  CUSTODIAN:     "case-status--archived",
};

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(iso));
}

export default function AdminUsersPage() {
  const { user, loading: authLoading, accessToken } = useAuth();
  const { toast } = useNotifications();

  const [users, setUsers]       = useState<UserRecord[]>([]);

  const [fetching, setFetching] = useState(true);
  const [error, setError]       = useState("");
  const [search, setSearch]     = useState("");

  

  useEffect(() => {
    if (!accessToken) return;
    setFetching(true);
    getAllUsers(accessToken)
      .then(setUsers)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load users");
        setUsers([]);
      })
      .finally(() => setFetching(false));
  }, [accessToken]);


  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    return !q || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q);
  });

  if (authLoading) return <WorkspaceShell breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Users' }]}>
<div style={{ background: "var(--surface-base)", minHeight: "100%", padding: "24px", color: "var(--text-primary)" }}><p className="cases-loading">Loading…</p></div>
</WorkspaceShell>;

  return (
    <WorkspaceShell breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Users' }]}>
<div style={{ background: "var(--surface-base)", minHeight: "100%", padding: "24px", color: "var(--text-primary)" }}>
      

      <div className="page-header" style={{ marginBottom: "24px" }}>
        <div>
          <p className="eyebrow" style={{ color: "var(--text-disabled)", fontFamily: "var(--font-mono)", fontSize: "12px", textTransform: "uppercase" }}>SYSTEM ADMINISTRATION</p>
          <h1 style={{ color: "var(--text-primary)", fontSize: "24px", margin: "8px 0" }}>User management</h1>
          <p className="ev-page-sub" style={{ color: "var(--text-secondary)" }}>All registered operator accounts.</p>
        </div>
      </div>

      <div className="filters-section">
        <input
          className="ev-search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or role…"
          aria-label="Search users"
        />
      </div>

      {error && (
        <div className="error-message" style={{ color: "var(--accent-danger)", border: "1px solid var(--accent-danger)", background: "rgba(244, 63, 94, 0.1)", padding: "12px", borderRadius: "6px" }} role="alert">
          {error}
        </div>
      )}


      <div className="evidence-table panel">
        {fetching ? (
          <p className="audit-loading" role="status">Loading users…</p>
        ) : filtered.length === 0 ? (
          <div className="ev-empty-state">
            <strong>{users.length === 0 ? "No users found." : "No users match your search."}</strong>
          </div>
        ) : (
          <div className="table-container">
            <table aria-label="User accounts">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="file-cell">
                        <span className="operator" style={{ fontSize: 10 }} aria-hidden="true">
                          {u.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <strong>{u.name}</strong>
                          <small>{u.id.slice(0, 8)}</small>
                        </div>
                      </div>
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <select
                        className="input"
                        value={u.role}
                        style={{ fontSize: 12, padding: "2px 8px", width: "auto", cursor: "pointer" }}
                        onChange={async (e) => {
                          const newRole = e.target.value as "ADMINISTRATOR" | "INVESTIGATOR" | "AUDITOR" | "CUSTODIAN";
                          try {
                            await updateUserRole(accessToken!, u.id, newRole);
                            setUsers((prev) =>
                              prev.map((item) => (item.id === u.id ? { ...item, role: newRole } : item)),
                            );
                            toast({
                              type: "success",
                              title: "Role updated",
                              message: `Updated ${u.name}'s role to ${newRole}`,
                            });
                          } catch (err) {
                            toast({
                              type: "error",
                              title: "Failed to update role",
                              message: err instanceof Error ? err.message : "Error updating role",
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
                    <td>{fmtDate(u.createdAt)}</td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
</WorkspaceShell>
  );
}
