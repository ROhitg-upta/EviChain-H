"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../auth-context";

type UserRecord = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

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

  const [users, setUsers]       = useState<UserRecord[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError]       = useState("");
  const [search, setSearch]     = useState("");

  useEffect(() => {
    if (!authLoading && !user) window.location.replace("/login");
    if (!authLoading && user && user.role !== "Administrator")
      window.location.replace("/");
  }, [authLoading, user]);

  useEffect(() => {
    if (!accessToken) return;
    setFetching(true);
    fetch(`${API_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch users");
        return res.json() as Promise<UserRecord[]>;
      })
      .then(setUsers)
      .catch((err: unknown) => {
        // endpoint may not exist yet — show placeholder
        setError(err instanceof Error ? err.message : "Failed to load users");
        setUsers([]);
      })
      .finally(() => setFetching(false));
  }, [accessToken]);

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    return !q || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q);
  });

  if (authLoading) return <main className="cases-shell"><p className="cases-loading">Loading…</p></main>;

  return (
    <main className="cases-shell">
      <header className="ev-topbar">
        <a className="ev-brand" href="/">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span><strong>EviChain</strong><small>Admin · Users</small></span>
        </a>
        <nav className="ev-nav">
          <a href="/admin">← Admin</a>
          <a href="/admin/settings">Settings</a>
          {user && <span className="operator" aria-label={user.name}>{user.initials}</span>}
        </nav>
      </header>

      <div className="page-header">
        <div>
          <p className="eyebrow">SYSTEM ADMINISTRATION</p>
          <h1>User management</h1>
          <p className="ev-page-sub">All registered operator accounts.</p>
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
        <div className="ev-info-banner" role="status">
          {error.includes("Failed to fetch users")
            ? "The /admin/users endpoint is not yet implemented on the backend. Showing placeholder UI."
            : error}
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
                      <span className={`case-status-badge ${ROLE_CLASS[u.role] ?? "case-status--archived"}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>{fmtDate(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
