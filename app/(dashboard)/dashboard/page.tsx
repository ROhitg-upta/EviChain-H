"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../auth-context";
import { getAuditLogs, getCases, getEvidence } from "@/lib/api";
import type { CaseRecord, EvidenceRecord, AuditLog } from "@/lib/api";

type DashboardData = {
  cases: CaseRecord[];
  evidence: EvidenceRecord[];
  auditLogs: AuditLog[];
  transfers: number;
};

export default function DashboardPage() {
  const { user, loading: authLoading, accessToken } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      window.location.replace("/login");
    }
  }, [authLoading, user]);

  const loadData = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [cases, evidence, logs] = await Promise.all([
        getCases(accessToken),
        getEvidence(accessToken),
        getAuditLogs(accessToken, { limit: 50 }),
      ]);

      const transfers = logs.filter((l) => l.action.toLowerCase().includes("transfer")).length;

      setData({
        cases,
        evidence,
        auditLogs: logs,
        transfers,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [accessToken]);

  if (authLoading || loading) {
    return (
      <div style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
        <div style={{ height: "64px", background: "var(--surface-raised, #181b20)", borderRadius: "6px" }} className="skeleton" />
        <div style={{ height: "120px", background: "var(--surface-raised, #181b20)", borderRadius: "6px" }} className="skeleton" />
        <div style={{ height: "400px", background: "var(--surface-raised, #181b20)", borderRadius: "6px" }} className="skeleton" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "32px", color: "var(--accent-alert, #f43f5e)", fontFamily: "var(--font-sans, Inter)" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "16px" }}>Failed to load dashboard</h2>
        <p style={{ marginBottom: "24px", color: "var(--text-secondary, #7a7d82)" }}>{error}</p>
        <button 
          onClick={loadData}
          style={{
            background: "var(--surface-raised, #181b20)",
            color: "var(--text-primary, #e8e6e3)",
            border: "1px solid var(--border-default, rgba(255,255,255,0.1))",
            padding: "8px 16px",
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const activeCases = data.cases.filter((c) => c.status.toLowerCase() !== "closed").slice(0, 5);
  const recentEvidence = data.evidence.slice(0, 5);
  const recentAudit = data.auditLogs.slice(0, 8);

  const getStatusColor = (status: string) => {
    const s = status.toLowerCase();
    if (s === "active") return "var(--accent-active, #22d3ee)";
    if (s === "verified") return "var(--accent-verified, #b5f542)";
    if (s === "pending") return "var(--accent-pending, #fbbf24)";
    if (s === "closed") return "var(--text-secondary, #7a7d82)";
    return "var(--text-primary, #e8e6e3)";
  };

  const activeCasesCount = data.cases.filter((c) => c.status.toLowerCase() !== "closed").length;

  const formatRelativeTime = (timestamp: string) => {
    const d = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  return (
    <div style={{ 
      padding: "32px", 
      display: "flex", 
      flexDirection: "column", 
      gap: "32px",
      fontFamily: "var(--font-sans, Inter)",
      color: "var(--text-primary, #e8e6e3)",
      background: "var(--surface-base, #0f1114)",
      minHeight: "100%"
    }}>
      {/* Header */}
      <header style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span className="eyebrow" style={{ 
          color: "var(--text-secondary, #7a7d82)", 
          fontSize: "0.75rem", 
          fontWeight: 600, 
          letterSpacing: "0.05em",
          textTransform: "uppercase" 
        }}>
          COMMAND CENTER
        </span>
        <h1 style={{ fontSize: "2rem", fontWeight: 600, margin: 0, letterSpacing: "-0.02em" }}>Dashboard</h1>
        <p style={{ color: "var(--text-secondary, #7a7d82)", fontSize: "1rem", margin: 0 }}>
          Welcome back, {user?.name} ({user?.role})
        </p>
      </header>

      {/* Stats Strip */}
      <section style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
        gap: "16px" 
      }}>
        {[
          { label: "ACTIVE CASES", value: activeCasesCount, desc: "Currently open" },
          { label: "EVIDENCE ITEMS", value: data.evidence.length, desc: "Total registered" },
          { label: "RECENT TRANSFERS", value: data.transfers, desc: "Custody changes" },
          { label: "AUDIT EVENTS", value: data.auditLogs.length, desc: "Total logged" },
        ].map((stat, i) => (
          <div key={i} style={{
            background: "var(--surface-raised, #181b20)",
            border: "1px solid var(--border-default, rgba(255,255,255,0.1))",
            borderRadius: "6px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "8px"
          }}>
            <span style={{ 
              fontFamily: "var(--font-mono, DM Mono)", 
              fontSize: "0.75rem", 
              color: "var(--text-secondary, #7a7d82)",
              textTransform: "uppercase"
            }}>
              {stat.label}
            </span>
            <strong style={{ fontSize: "2.5rem", fontWeight: 500, lineHeight: 1 }}>
              {stat.value}
            </strong>
            <span style={{ fontSize: "0.875rem", color: "var(--text-secondary, #7a7d82)" }}>
              {stat.desc}
            </span>
          </div>
        ))}
      </section>

      {/* Main Two-Column Layout */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "2fr 1fr", 
        gap: "24px",
        alignItems: "start"
      }}>
        {/* Left Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* Active Cases */}
          <section style={{
            background: "var(--surface-raised, #181b20)",
            border: "1px solid var(--border-default, rgba(255,255,255,0.1))",
            borderRadius: "8px",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "16px"
          }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 500, margin: 0 }}>Active Cases</h2>
            
            {activeCases.length === 0 ? (
              <p style={{ color: "var(--text-secondary, #7a7d82)", fontSize: "0.875rem" }}>No active cases found.</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
                {activeCases.map(c => (
                  <li key={c.id}>
                    <Link href={`/cases/${c.id}`} style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px",
                      background: "var(--surface-overlay, #1e2228)",
                      border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
                      borderRadius: "6px",
                      textDecoration: "none",
                      color: "inherit"
                    }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontWeight: 500, fontSize: "0.9375rem" }}>{c.title}</span>
                        <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary, #7a7d82)" }}>
                          {c.evidenceCount ?? 0} evidence items • Updated {new Date(c.updatedAt || c.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <span style={{
                        fontSize: "0.75rem",
                        fontFamily: "var(--font-mono, DM Mono)",
                        padding: "4px 8px",
                        background: "var(--surface-sunken, #0a0c0e)",
                        color: "var(--text-primary, #e8e6e3)",
                        borderLeft: `2px solid ${getStatusColor(c.status)}`,
                        borderRadius: "2px",
                        textTransform: "uppercase"
                      }}>
                        {c.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            
            <Link href="/cases" style={{ 
              fontSize: "0.875rem", 
              color: "var(--accent-active, #22d3ee)", 
              textDecoration: "none", 
              alignSelf: "flex-start",
              marginTop: "8px"
            }}>
              View all cases →
            </Link>
          </section>

          {/* Recent Evidence */}
          <section style={{
            background: "var(--surface-raised, #181b20)",
            border: "1px solid var(--border-default, rgba(255,255,255,0.1))",
            borderRadius: "8px",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "16px"
          }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 500, margin: 0 }}>Recent Evidence</h2>
            
            {recentEvidence.length === 0 ? (
              <p style={{ color: "var(--text-secondary, #7a7d82)", fontSize: "0.875rem" }}>No evidence found.</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
                {recentEvidence.map(e => (
                  <li key={e.id}>
                    <Link href={`/evidence/${e.id}`} style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px",
                      background: "var(--surface-overlay, #1e2228)",
                      border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
                      borderRadius: "6px",
                      textDecoration: "none",
                      color: "inherit"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{
                          width: "32px",
                          height: "32px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "var(--surface-sunken, #0a0c0e)",
                          border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
                          borderRadius: "4px",
                          color: "var(--text-secondary, #7a7d82)",
                          fontSize: "0.875rem"
                        }}>
                          {e.mimeType?.includes("image") ? "🖼" : e.mimeType?.includes("video") ? "🎬" : "📄"}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span style={{ fontWeight: 500, fontSize: "0.9375rem" }}>{e.name}</span>
                          <span style={{ 
                            fontSize: "0.75rem", 
                            fontFamily: "var(--font-mono, DM Mono)", 
                            color: "var(--text-secondary, #7a7d82)" 
                          }}>
                            {e.sha256 ? `${e.sha256.substring(0, 16)}...` : "NO HASH"}
                          </span>
                        </div>
                      </div>
                      <span style={{
                        fontSize: "0.75rem",
                        fontFamily: "var(--font-mono, DM Mono)",
                        padding: "4px 8px",
                        background: "var(--surface-sunken, #0a0c0e)",
                        color: "var(--text-primary, #e8e6e3)",
                        borderLeft: `2px solid ${getStatusColor(e.status)}`,
                        borderRadius: "2px",
                        textTransform: "uppercase"
                      }}>
                        {e.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

        </div>

        {/* Right Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* Quick Actions */}
          <section style={{
            background: "var(--surface-raised, #181b20)",
            border: "1px solid var(--border-default, rgba(255,255,255,0.1))",
            borderRadius: "8px",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "16px"
          }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 500, margin: 0 }}>Quick Actions</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <Link href="/cases/new" style={{
                background: "var(--surface-overlay, #1e2228)",
                border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
                borderRadius: "6px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                textDecoration: "none",
                color: "inherit"
              }}>
                <span style={{ color: "var(--accent-active, #22d3ee)", fontSize: "1.25rem" }}>✦</span>
                <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>New Case</span>
              </Link>
              <Link href="/evidence/new" style={{
                background: "var(--surface-overlay, #1e2228)",
                border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
                borderRadius: "6px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                textDecoration: "none",
                color: "inherit"
              }}>
                <span style={{ color: "var(--accent-active, #22d3ee)", fontSize: "1.25rem" }}>↑</span>
                <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Upload Evidence</span>
              </Link>
              <Link href="/verify" style={{
                background: "var(--surface-overlay, #1e2228)",
                border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
                borderRadius: "6px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                textDecoration: "none",
                color: "inherit"
              }}>
                <span style={{ color: "var(--accent-verified, #b5f542)", fontSize: "1.25rem" }}>✓</span>
                <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Verify Hash</span>
              </Link>
              <Link href="/audit/export" style={{
                background: "var(--surface-overlay, #1e2228)",
                border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
                borderRadius: "6px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                textDecoration: "none",
                color: "inherit"
              }}>
                <span style={{ color: "var(--text-secondary, #7a7d82)", fontSize: "1.25rem" }}>↓</span>
                <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Export Audit</span>
              </Link>
            </div>
          </section>

          {/* Audit Stream */}
          <section style={{
            background: "var(--surface-raised, #181b20)",
            border: "1px solid var(--border-default, rgba(255,255,255,0.1))",
            borderRadius: "8px",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "16px"
          }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 500, margin: 0 }}>Audit Stream</h2>
            
            {recentAudit.length === 0 ? (
              <p style={{ color: "var(--text-secondary, #7a7d82)", fontSize: "0.875rem" }}>No recent audit events.</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "16px" }}>
                {recentAudit.map((log) => (
                  <li key={log.id} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                    <div style={{ 
                      width: "8px", 
                      height: "8px", 
                      borderRadius: "50%", 
                      background: "var(--border-strong, rgba(255,255,255,0.16))",
                      marginTop: "6px"
                    }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                      <span style={{ 
                        fontFamily: "var(--font-mono, DM Mono)", 
                        fontSize: "0.8125rem",
                        color: "var(--text-primary, #e8e6e3)" 
                      }}>
                        {log.action}
                      </span>
                      <div style={{ 
                        display: "flex", 
                        justifyContent: "space-between", 
                        fontSize: "0.75rem", 
                        color: "var(--text-secondary, #7a7d82)" 
                      }}>
                        <span>{log.actor?.name || "System"}</span>
                        <span>{formatRelativeTime(log.timestamp)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
