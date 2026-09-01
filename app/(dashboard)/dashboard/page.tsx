"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../auth-context";
import { getAuditLogs, getCases, getEvidence } from "@/lib/api";

type Stats = {
  totalCases: number;
  totalEvidence: number;
  totalAuditLogs: number;
};

export default function DashboardPage() {
  const { user, loading: authLoading, accessToken } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentActivity, setRecentActivity] = useState<
    { action: string; createdAt: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) window.location.replace("/login");
  }, [authLoading, user]);

  useEffect(() => {
    if (!accessToken) return;

    async function load() {
      try {
        const [cases, evidence, logs] = await Promise.all([
          getCases(accessToken!),
          getEvidence(accessToken!),
          getAuditLogs(accessToken!, { limit: 20 }),
        ]);

        setStats({
          totalCases: cases.length,
          totalEvidence: evidence.length,
          totalAuditLogs: logs.length,
        });

        setRecentActivity(
          logs.map((l) => ({ action: l.action, createdAt: l.timestamp })),
        );
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [accessToken]);

  if (authLoading || loading) {
    return <div className="cases-loading">Loading…</div>;
  }

  return (
    <div className="dashboard-page">
      {/* Stats */}
      <section className="stats-grid">
        <div className="stat-card">
          <span>Total Cases</span>
          <strong>{String(stats?.totalCases ?? 0).padStart(2, "0")}</strong>
          <small>Registered</small>
        </div>
        <div className="stat-card stat-card--green">
          <span>Total Evidence</span>
          <strong>{String(stats?.totalEvidence ?? 0).padStart(2, "0")}</strong>
          <small>Uploaded</small>
        </div>
        <div className="stat-card stat-card--amber">
          <span>Audit Logs</span>
          <strong>{String(stats?.totalAuditLogs ?? 0).padStart(3, "0")}</strong>
          <small>Events</small>
        </div>
        <div className="stat-card stat-card--muted">
          <span>Operator</span>
          <strong className="operator" style={{ fontSize: 20 }} aria-hidden="true">
            {user?.initials}
          </strong>
          <small>{user?.role}</small>
        </div>
      </section>

      <div className="dashboard-grid">
        {/* Quick actions */}
        <section className="panel" style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 18px", fontSize: 17, letterSpacing: "-0.04em" }}>
            Quick actions
          </h2>
          <div className="quick-actions">
            <a href="/evidence/new" className="action-card">
              <span className="action-card-icon" aria-hidden="true">↑</span>
              <div>
                <h3>Upload evidence</h3>
                <p>Register a new evidence file</p>
              </div>
            </a>
            <a href="/cases/new" className="action-card">
              <span className="action-card-icon" aria-hidden="true">✦</span>
              <div>
                <h3>Create case</h3>
                <p>Start a new investigation</p>
              </div>
            </a>
            <a href="/verify" className="action-card">
              <span className="action-card-icon" aria-hidden="true">✓</span>
              <div>
                <h3>Verify evidence</h3>
                <p>Check file integrity</p>
              </div>
            </a>
            <a href="/audit" className="action-card">
              <span className="action-card-icon" aria-hidden="true">≡</span>
              <div>
                <h3>View audit log</h3>
                <p>Review activity ledger</p>
              </div>
            </a>
          </div>
        </section>

        {/* Recent activity */}
        <section className="panel" style={{ padding: 24 }}>
          <h2 style={{ margin: "0 0 18px", fontSize: 17, letterSpacing: "-0.04em" }}>
            Recent activity
          </h2>
          {recentActivity.length === 0 ? (
            <p className="ev-muted" style={{ fontSize: 13 }}>No recent activity.</p>
          ) : (
            <ol className="audit-timeline" style={{ margin: 0 }}>
              {recentActivity.slice(0, 5).map((activity, i) => (
                <li key={i} className="timeline-item" style={{ paddingLeft: 0, paddingRight: 0 }}>
                  <span className="action-badge action--default" aria-hidden="true">
                    {activity.action.includes("upload")
                      ? "↑"
                      : activity.action.includes("create") || activity.action.includes("register")
                      ? "✦"
                      : "•"}
                  </span>
                  <div className="timeline-item-body">
                    <p className="timeline-action" style={{ margin: 0 }}>
                      {activity.action}
                    </p>
                    <time
                      className="timeline-item-meta"
                      dateTime={activity.createdAt}
                      style={{ fontSize: 10, color: "var(--muted)" }}
                    >
                      {new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(activity.createdAt))}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
