"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../auth-context";
import { useNotifications } from "@/app/notification-context";
import { getAuditLogs, getCases, getEvidence, getIntegrityDashboardSummary } from "@/lib/api";
import type { CaseRecord, EvidenceRecord, AuditLog, IntegrityDashboardSummary } from "@/lib/api";

type DashboardData = {
  cases: CaseRecord[];
  evidence: EvidenceRecord[];
  auditLogs: AuditLog[];
  transfers: number;
};

export default function DashboardPage() {
  const { user, loading: authLoading, accessToken } = useAuth();
  const { needsAttentionQueue, actionRequiredCount } = useNotifications();
  const [data, setData] = useState<DashboardData | null>(null);
  const [integritySummary, setIntegritySummary] = useState<IntegrityDashboardSummary | null>(null);
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
      const [cases, evidence, logsRes, integrityRes] = await Promise.all([
        getCases(accessToken),
        getEvidence(accessToken),
        getAuditLogs(accessToken, { limit: 50 }),
        getIntegrityDashboardSummary(accessToken).catch(() => null),
      ]);

      const logItems = Array.isArray(logsRes) ? logsRes : logsRes.items || [];
      const transfers = logItems.filter((l) => l.action.toLowerCase().includes("transfer")).length;

      setData({
        cases,
        evidence,
        auditLogs: logItems,
        transfers,
      });
      if (integrityRes) {
        setIntegritySummary(integrityRes);
      }
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

      {/* ── MODULE 14: Needs Attention Investigation Alert Widget ──────── */}
      <section
        style={{
          background: "var(--surface-raised, #181b20)",
          border: "1px solid var(--border-default, #23272f)",
          borderRadius: "8px",
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
        aria-label="Needs Attention Alerts"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background:
                  needsAttentionQueue.length > 0
                    ? "var(--accent-warning, #fbbf24)"
                    : "var(--accent-verified, #b5f542)",
                boxShadow:
                  needsAttentionQueue.length > 0
                    ? "0 0 10px rgba(251, 191, 36, 0.6)"
                    : "none",
              }}
              aria-hidden="true"
            />
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0, color: "var(--text-primary, #f8fafc)" }}>
              Needs Attention
            </h2>
            {needsAttentionQueue.length > 0 && (
              <span
                style={{
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "10px",
                  background: "rgba(251, 191, 36, 0.15)",
                  color: "#fbbf24",
                  border: "1px solid rgba(251, 191, 36, 0.3)",
                }}
              >
                {needsAttentionQueue.length} HIGH PRIORITY
              </span>
            )}
          </div>

          <Link
            href="/notifications"
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--brand-400, #4abe94)",
              textDecoration: "none",
            }}
          >
            Open Alert Center →
          </Link>
        </div>

        {needsAttentionQueue.length === 0 ? (
          <div
            style={{
              padding: "16px",
              background: "rgba(74, 190, 148, 0.06)",
              border: "1px solid rgba(74, 190, 148, 0.2)",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <span style={{ color: "var(--brand-400, #4abe94)", fontSize: "18px", fontWeight: 800 }}>✓</span>
            <span style={{ fontSize: "13.5px", color: "var(--text-secondary, #94a3b8)" }}>
              All clear — no action-required evidence events or flagged integrity alerts detected.
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {needsAttentionQueue.slice(0, 5).map((item) => {
              const isCrit = item.severity === "CRITICAL" || item.severity === "SECURITY";
              const badgeColor = isCrit ? "#f43f5e" : "#fbbf24";
              const badgeBg = isCrit ? "rgba(244, 63, 94, 0.15)" : "rgba(251, 191, 36, 0.12)";
              const border = isCrit ? "rgba(244, 63, 94, 0.35)" : "rgba(251, 191, 36, 0.3)";

              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 16px",
                    background: "var(--surface-sunken, #0a0c0e)",
                    border: `1px solid ${border}`,
                    borderRadius: "6px",
                    gap: "16px",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: "240px" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: "10px",
                        fontWeight: 800,
                        padding: "2px 6px",
                        borderRadius: "3px",
                        background: badgeBg,
                        color: badgeColor,
                        border: `1px solid ${border}`,
                        letterSpacing: "0.04em",
                      }}
                    >
                      {item.severity}
                    </span>
                    <div>
                      <strong style={{ display: "block", fontSize: "13px", color: "var(--text-primary, #f8fafc)" }}>
                        {item.title}
                      </strong>
                      <span style={{ fontSize: "12px", color: "var(--text-secondary, #94a3b8)" }}>
                        {item.message}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: "11px",
                        color: "var(--text-muted, #94a3b8)",
                      }}
                    >
                      {item.entityId ? `${item.entityType}: ${item.entityId.slice(0, 8)}…` : ""}
                    </span>
                    <Link
                      href={item.link || "/notifications"}
                      className="btn btn-sm"
                      style={{
                        background: isCrit ? "var(--accent-danger, #f43f5e)" : "var(--brand-500, #4abe94)",
                        color: isCrit ? "#ffffff" : "#0a0c0e",
                        fontWeight: 700,
                        textDecoration: "none",
                        minHeight: "32px",
                        padding: "0 12px",
                      }}
                    >
                      Triage →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── MODULE 15: Forensic Readiness & Evidence Integrity Summary ──────── */}
      <section
        style={{
          background: "var(--surface-raised, #181b20)",
          border: "1px solid var(--border-default, #23272f)",
          borderRadius: "8px",
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
        aria-label="Forensic Readiness & Integrity Intelligence"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.25rem" }} aria-hidden="true">🛡️</span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0, color: "var(--text-primary, #f3f4f6)" }}>
                  Forensic Readiness & Evidence Integrity Engine
                </h2>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    fontFamily: "var(--font-mono, DM Mono)",
                    padding: "2px 8px",
                    borderRadius: "10px",
                    background: "rgba(56, 189, 248, 0.15)",
                    color: "var(--brand-400, #38bdf8)",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  LIVE INTELLIGENCE
                </span>
              </div>
              <p style={{ margin: "2px 0 0 0", fontSize: "0.85rem", color: "var(--text-secondary, #94a3b8)" }}>
                Continuous automated cryptographic verification, custody continuity tracking, and court admissibility readiness.
              </p>
            </div>
          </div>
        </div>

        {/* 4 Forensic Key Metrics */}
        {(() => {
          const critCount = integritySummary?.findingsDistribution?.critical ?? (integritySummary as any)?.criticalCount ?? 0;
          const highCount = integritySummary?.findingsDistribution?.high ?? (integritySummary as any)?.highCount ?? 0;
          const medCount = integritySummary?.findingsDistribution?.medium ?? 0;
          const reviewCount = highCount + medCount;
          const critFindings = integritySummary?.criticalFindings ?? [];
          const avgEvScore = integritySummary?.averageEvidenceScore ?? 100;
          const avgCaseScore = integritySummary?.averageCaseScore ?? 100;

          return (
            <>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "14px",
              }}>
                {/* Average Evidence Health */}
                <div style={{
                  background: "var(--surface-base, #0f1114)",
                  border: "1px solid var(--border-default, #23272f)",
                  borderRadius: "6px",
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}>
                  <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", textTransform: "uppercase" }}>
                    AVG EVIDENCE HEALTH
                  </span>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                    <strong style={{
                      fontSize: "1.75rem",
                      fontWeight: 800,
                      color: avgEvScore >= 90
                        ? "var(--accent-verified, #10b981)"
                        : avgEvScore >= 70
                        ? "var(--accent-pending, #fbbf24)"
                        : "var(--accent-danger, #f43f5e)",
                    }}>
                      {integritySummary ? Math.round(avgEvScore) : "—"}
                    </strong>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>/100</span>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {integritySummary?.evidenceAssessedCount ?? 0} exhibits evaluated
                  </span>
                </div>

                {/* Average Case Readiness */}
                <div style={{
                  background: "var(--surface-base, #0f1114)",
                  border: "1px solid var(--border-default, #23272f)",
                  borderRadius: "6px",
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}>
                  <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", textTransform: "uppercase" }}>
                    AVG CASE READINESS
                  </span>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                    <strong style={{
                      fontSize: "1.75rem",
                      fontWeight: 800,
                      color: avgCaseScore >= 90
                        ? "var(--accent-verified, #10b981)"
                        : avgCaseScore >= 70
                        ? "var(--accent-pending, #fbbf24)"
                        : "var(--accent-danger, #f43f5e)",
                    }}>
                      {integritySummary ? Math.round(avgCaseScore) : "—"}
                    </strong>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>/100</span>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {integritySummary?.casesAssessedCount ?? 0} dossiers evaluated
                  </span>
                </div>

                {/* Critical Anomalies */}
                <div style={{
                  background: "var(--surface-base, #0f1114)",
                  border: `1px solid ${critCount > 0 ? "rgba(244, 63, 94, 0.4)" : "var(--border-default, #23272f)"}`,
                  borderRadius: "6px",
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}>
                  <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-mono)", color: "var(--accent-danger, #f43f5e)", textTransform: "uppercase" }}>
                    CRITICAL BREACHES
                  </span>
                  <strong style={{
                    fontSize: "1.75rem",
                    fontWeight: 800,
                    color: critCount > 0 ? "var(--accent-danger, #f43f5e)" : "var(--accent-verified, #10b981)",
                  }}>
                    {critCount}
                  </strong>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {critCount > 0 ? "Requires Administrator review" : "Zero cryptographic mismatches"}
                  </span>
                </div>

                {/* High / Medium Discrepancies */}
                <div style={{
                  background: "var(--surface-base, #0f1114)",
                  border: "1px solid var(--border-default, #23272f)",
                  borderRadius: "6px",
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}>
                  <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-mono)", color: "var(--accent-pending, #fbbf24)", textTransform: "uppercase" }}>
                    HIGH & REVIEW SIGNALS
                  </span>
                  <strong style={{
                    fontSize: "1.75rem",
                    fontWeight: 800,
                    color: reviewCount > 0
                      ? "var(--accent-pending, #fbbf24)"
                      : "var(--accent-verified, #10b981)",
                  }}>
                    {reviewCount}
                  </strong>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    Custody gaps & metadata anomalies
                  </span>
                </div>
              </div>

              {/* Critical Findings Spotlight if any exist */}
              {critFindings.length > 0 && (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  padding: "14px",
                  borderRadius: "6px",
                  background: "rgba(244, 63, 94, 0.08)",
                  border: "1px solid rgba(244, 63, 94, 0.3)",
                }}>
                  <strong style={{ fontSize: "0.85rem", color: "var(--accent-danger, #f43f5e)" }}>
                    Active Critical Integrity Breaches:
                  </strong>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {critFindings.slice(0, 3).map((cf) => (
                      <div key={cf.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem" }}>
                        <span style={{ color: "var(--text-primary)" }}>
                          {cf.title} {cf.evidence?.name ? `(${cf.evidence.name})` : ""}
                        </span>
                        {cf.evidenceId && (
                          <Link
                            href={`/evidence/${cf.evidenceId}`}
                            style={{ color: "var(--accent-danger, #f43f5e)", fontWeight: 700, textDecoration: "underline" }}
                          >
                            Remediate →
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          );
        })()}
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
