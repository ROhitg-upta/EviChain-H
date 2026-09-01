"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../auth-context";

export default function AdminSettingsPage() {
  const { user, loading: authLoading } = useAuth();

  const [saved, setSaved] = useState(false);

  // Settings state (UI only — persisted to localStorage until backend endpoint exists)
  const [maxFileSize, setMaxFileSize]     = useState("50");
  const [corsOrigin, setCorsOrigin]       = useState("http://localhost:3000");
  const [jwtExpiry, setJwtExpiry]         = useState("15m");
  const [refreshExpiry, setRefreshExpiry] = useState("7d");
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) window.location.replace("/login");
    if (!authLoading && user && user.role !== "Administrator")
      window.location.replace("/");
  }, [authLoading, user]);

  // Restore from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("evichain-admin-settings");
      if (!raw) return;
      const s = JSON.parse(raw) as Record<string, string>;
      if (s.maxFileSize)     setMaxFileSize(s.maxFileSize);
      if (s.corsOrigin)      setCorsOrigin(s.corsOrigin);
      if (s.jwtExpiry)       setJwtExpiry(s.jwtExpiry);
      if (s.refreshExpiry)   setRefreshExpiry(s.refreshExpiry);
      if (s.maintenanceMode) setMaintenanceMode(s.maintenanceMode === "true");
    } catch { /* ignore */ }
  }, []);

  function handleSave() {
    localStorage.setItem("evichain-admin-settings", JSON.stringify({
      maxFileSize, corsOrigin, jwtExpiry, refreshExpiry,
      maintenanceMode: String(maintenanceMode),
    }));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (authLoading) return <main className="cases-shell"><p className="cases-loading">Loading…</p></main>;

  return (
    <main className="cases-shell">
      <header className="ev-topbar">
        <a className="ev-brand" href="/">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span><strong>EviChain</strong><small>Admin · Settings</small></span>
        </a>
        <nav className="ev-nav">
          <a href="/admin">← Admin</a>
          <a href="/admin/users">Users</a>
          {user && <span className="operator" aria-label={user.name}>{user.initials}</span>}
        </nav>
      </header>

      <div className="page-header">
        <div>
          <p className="eyebrow">SYSTEM ADMINISTRATION</p>
          <h1>System settings</h1>
          <p className="ev-page-sub">
            Platform configuration. Changes are saved locally until a backend
            settings endpoint is implemented.
          </p>
        </div>
      </div>

      <div className="case-form-layout">
        <div style={{ display: "grid", gap: 22 }}>

          {/* Upload settings */}
          <div className="form-section">
            <h2>Upload limits</h2>
            <div className="form-group">
              <label htmlFor="max-file-size">Maximum file size (MB)</label>
              <input
                id="max-file-size"
                type="number"
                min="1"
                max="500"
                value={maxFileSize}
                onChange={(e) => setMaxFileSize(e.target.value)}
              />
              <small className="ev-field-hint">
                Backend enforces 50 MB via Multer. Change this in
                <code> evidence.routes.ts</code> and redeploy.
              </small>
            </div>
          </div>

          {/* Auth settings */}
          <div className="form-section">
            <h2>Authentication</h2>
            <div className="case-form-row">
              <div className="form-group">
                <label htmlFor="jwt-expiry">Access token expiry</label>
                <input
                  id="jwt-expiry"
                  type="text"
                  value={jwtExpiry}
                  onChange={(e) => setJwtExpiry(e.target.value)}
                  placeholder="e.g. 15m, 1h"
                />
                <small className="ev-field-hint">Set JWT_EXPIRES_IN in server/.env</small>
              </div>
              <div className="form-group">
                <label htmlFor="refresh-expiry">Refresh token expiry</label>
                <input
                  id="refresh-expiry"
                  type="text"
                  value={refreshExpiry}
                  onChange={(e) => setRefreshExpiry(e.target.value)}
                  placeholder="e.g. 7d, 30d"
                />
                <small className="ev-field-hint">Set REFRESH_EXPIRES_IN in server/.env</small>
              </div>
            </div>
          </div>

          {/* CORS settings */}
          <div className="form-section">
            <h2>CORS / origin</h2>
            <div className="form-group">
              <label htmlFor="cors-origin">Allowed frontend origin</label>
              <input
                id="cors-origin"
                type="text"
                value={corsOrigin}
                onChange={(e) => setCorsOrigin(e.target.value)}
                placeholder="https://yourapp.vercel.app"
              />
              <small className="ev-field-hint">
                Restrict CORS in <code>server/src/index.ts</code> by passing{" "}
                <code>{"{ origin: '<value>' }"}</code> to <code>cors()</code>.
              </small>
            </div>
          </div>

          {/* Maintenance */}
          <div className="form-section">
            <h2>Maintenance</h2>
            <div className="form-group" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <input
                id="maintenance-mode"
                type="checkbox"
                checked={maintenanceMode}
                onChange={(e) => setMaintenanceMode(e.target.checked)}
                style={{ width: 16, height: 16, minHeight: "unset", padding: 0 }}
              />
              <label htmlFor="maintenance-mode" style={{ textTransform: "none", letterSpacing: 0, fontSize: 13 }}>
                Enable maintenance mode (UI indicator only)
              </label>
            </div>
          </div>

          {saved && (
            <div className="ev-info-banner" role="status" aria-live="polite">
              Settings saved locally. Deploy <code>server/.env</code> changes to apply JWT / CORS settings.
            </div>
          )}

          <div className="case-form-actions">
            <button className="button button-primary" type="button" onClick={handleSave}>
              Save settings
            </button>
            <a className="button button-secondary" href="/admin">Cancel</a>
          </div>
        </div>

        {/* Info sidebar */}
        <aside className="info-section">
          <h2>Configuration notes</h2>
          <ol className="info-steps">
            <li>
              <span className="info-step-num" aria-hidden="true">1</span>
              <div>
                <strong>JWT secrets</strong>
                <p>Set <code>JWT_SECRET</code> and <code>REFRESH_SECRET</code> in <code>server/.env</code>. Minimum 32 characters.</p>
              </div>
            </li>
            <li>
              <span className="info-step-num" aria-hidden="true">2</span>
              <div>
                <strong>Database URL</strong>
                <p>Set <code>DATABASE_URL</code> in <code>server/.env</code> with your Neon PostgreSQL connection string.</p>
              </div>
            </li>
            <li>
              <span className="info-step-num" aria-hidden="true">3</span>
              <div>
                <strong>File storage</strong>
                <p>Configure <code>AWS_ACCESS_KEY_ID</code> and S3 bucket for persistent file storage beyond the demo.</p>
              </div>
            </li>
            <li>
              <span className="info-step-num" aria-hidden="true">4</span>
              <div>
                <strong>Run migrations</strong>
                <p>After any schema change run <code>npx prisma migrate dev</code> in <code>server/</code>.</p>
              </div>
            </li>
          </ol>
        </aside>
      </div>
    </main>
  );
}
