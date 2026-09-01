"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../auth-context";
import { getCases, getEvidence, getAuditLogs } from "@/lib/api";

export default function MobileDashboard() {
  const { accessToken } = useAuth();
  const [stats, setStats] = useState({ cases: 0, evidence: 0 });
  const [activity, setActivity] = useState<{ action: string; timestamp: string }[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      getCases(accessToken),
      getEvidence(accessToken),
      getAuditLogs(accessToken, { limit: 5 }),
    ]).then(([cs, ev, logs]) => {
      setStats({ cases: cs.length, evidence: ev.length });
      setActivity(logs.map((l) => ({ action: l.action, timestamp: l.timestamp })));
    }).catch(() => {/* silent — offline fallback */});
  }, [accessToken]);

  function fmtRelative(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3_600_000);
    return h < 1 ? "Just now" : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
  }

  return (
    <div className="mobile-dashboard">
      {/* Stats */}
      <section className="mobile-stats" aria-label="Summary">
        <div className="mobile-stat-card">
          <div className="mobile-stat-icon" aria-hidden="true">▣</div>
          <div className="mobile-stat-value">{stats.cases}</div>
          <div className="mobile-stat-label">Cases</div>
        </div>
        <div className="mobile-stat-card">
          <div className="mobile-stat-icon" aria-hidden="true">◈</div>
          <div className="mobile-stat-value">{stats.evidence}</div>
          <div className="mobile-stat-label">Evidence</div>
        </div>
      </section>

      {/* Quick actions */}
      <section className="mobile-quick-actions">
        <h2>Quick actions</h2>
        <div className="mobile-actions-grid">
          {[
            { href: "/evidence/new",          icon: "↑", label: "Upload"  },
            { href: "/verify",                icon: "✓", label: "Verify"  },
            { href: "/cases",                 icon: "▣", label: "Cases"   },
            { href: "/mobile/evidence/camera",icon: "◎", label: "Camera"  },
          ].map(({ href, icon, label }) => (
            <a key={href} href={href} className="mobile-action-card" aria-label={label}>
              <span className="mobile-action-icon" aria-hidden="true">{icon}</span>
              <span>{label}</span>
            </a>
          ))}
        </div>
      </section>

      {/* Recent activity */}
      <section className="mobile-recent">
        <h2>Recent activity</h2>
        {activity.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>No recent activity.</p>
        ) : (
          <div className="mobile-activity-list">
            {activity.map((a, i) => (
              <div key={i} className="mobile-activity-item">
                <span className="mobile-activity-icon" aria-hidden="true">•</span>
                <div className="mobile-activity-info">
                  <p className="mobile-activity-title">{a.action}</p>
                  <p className="mobile-activity-time">{fmtRelative(a.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
