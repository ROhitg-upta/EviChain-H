"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "../../auth-context";
import { useNotifications } from "@/app/notification-context";
import {
  getWorkspaceBriefing,
  getCases,
  type WorkspaceBriefingData,
  type CaseRecord,
} from "@/lib/api";
import { getOfflineDrafts, syncOfflineDrafts, type OfflineEvidenceDraft } from "@/lib/offline-queue";

type DensityMode = "comfortable" | "compact";
type QueueTab = "assigned" | "evidence_review" | "offline_sync" | "activity";

export default function DashboardPage() {
  const { user, loading: authLoading, accessToken } = useAuth();
  const { toast } = useNotifications();

  const [briefing, setBriefing] = useState<WorkspaceBriefingData | null>(null);
  const [allCases, setAllCases] = useState<CaseRecord[]>([]);
  const [offlineDrafts, setOfflineDrafts] = useState<OfflineEvidenceDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Personalization
  const [density, setDensity] = useState<DensityMode>("comfortable");
  const [activeQueueTab, setActiveQueueTab] = useState<QueueTab>("assigned");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [readinessFilter, setReadinessFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"updated" | "priority" | "readiness">("updated");

  // Load density from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("evichain_ws_density");
      if (saved === "compact" || saved === "comfortable") {
        setDensity(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleDensityToggle = () => {
    const next = density === "comfortable" ? "compact" : "comfortable";
    setDensity(next);
    try {
      localStorage.setItem("evichain_ws_density", next);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      window.location.replace("/login");
    }
  }, [authLoading, user]);

  const loadData = async () => {
    if (!accessToken || !user) return;
    setLoading(true);
    setError(null);
    try {
      const [briefingRes, casesRes, drafts] = await Promise.all([
        getWorkspaceBriefing(accessToken),
        getCases(accessToken).catch(() => [] as CaseRecord[]),
        getOfflineDrafts(user.id).catch(() => [] as OfflineEvidenceDraft[]),
      ]);

      setBriefing(briefingRes);
      setAllCases(casesRes);
      setOfflineDrafts(drafts.filter((d) => d.status !== "SYNCED"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load operational briefing");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [accessToken, user?.id]);

  const handleSyncOfflineQueue = async () => {
    if (!accessToken || !user) return;
    setSyncingOffline(true);
    try {
      const result = await syncOfflineDrafts(user.id, accessToken);
      toast({
        type: result.successCount > 0 ? "success" : "info",
        title: "Offline Sync Completed",
        message: `Successfully synchronized ${result.successCount} exhibits to the evidence ledger.`,
      });
      // Refresh drafts
      const remaining = await getOfflineDrafts(user.id);
      setOfflineDrafts(remaining.filter((d) => d.status !== "SYNCED"));
    } catch (err) {
      toast({
        type: "error",
        title: "Sync Failed",
        message: err instanceof Error ? err.message : "Error syncing offline drafts",
      });
    } finally {
      setSyncingOffline(false);
    }
  };

  // Case filtering & sorting
  const filteredCases = useMemo(() => {
    let result = [...allCases];

    // Status filter
    if (statusFilter !== "ALL") {
      result = result.filter((c) => c.status.toUpperCase() === statusFilter);
    }

    // Readiness filter
    if (readinessFilter !== "ALL") {
      result = result.filter((c) => {
        const score = (c as any).readinessScore ?? null;
        if (readinessFilter === "HEALTHY") return score !== null && score >= 90;
        if (readinessFilter === "REVIEW") return score !== null && score >= 70 && score < 90;
        if (readinessFilter === "AT_RISK") return score !== null && score >= 50 && score < 70;
        if (readinessFilter === "CRITICAL") return score !== null && score < 50;
        if (readinessFilter === "UNASSESSED") return score === null;
        return true;
      });
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q),
      );
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === "readiness") {
        const scoreA = (a as any).readinessScore ?? -1;
        const scoreB = (b as any).readinessScore ?? -1;
        return scoreA - scoreB; // Lowest readiness first to prioritize attention
      }
      if (sortBy === "priority") {
        const pOrder: Record<string, number> = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        const pA = pOrder[a.priority?.toUpperCase() || "MEDIUM"] || 0;
        const pB = pOrder[b.priority?.toUpperCase() || "MEDIUM"] || 0;
        return pB - pA;
      }
      // default: updated
      const dateA = new Date(a.updatedAt || a.createdAt).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt).getTime();
      return dateB - dateA;
    });

    return result;
  }, [allCases, statusFilter, readinessFilter, searchQuery, sortBy]);

  const formatRelativeTime = (timestamp: string) => {
    const d = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  const getStatusBadgeStyle = (status: string) => {
    const s = status.toUpperCase();
    if (s === "ACTIVE" || s === "OPEN") {
      return { bg: "rgba(56, 189, 248, 0.12)", color: "#38bdf8", border: "rgba(56, 189, 248, 0.3)" };
    }
    if (s === "CLOSED" || s === "VERIFIED") {
      return { bg: "rgba(16, 185, 129, 0.12)", color: "#10b981", border: "rgba(16, 185, 129, 0.3)" };
    }
    if (s === "PENDING_REVIEW" || s === "REVIEW") {
      return { bg: "rgba(251, 191, 36, 0.12)", color: "#fbbf24", border: "rgba(251, 191, 36, 0.3)" };
    }
    return { bg: "rgba(148, 163, 184, 0.12)", color: "#94a3b8", border: "rgba(148, 163, 184, 0.3)" };
  };

  const getPriorityBadgeStyle = (priority: string) => {
    const p = priority.toUpperCase();
    if (p === "URGENT" || p === "CRITICAL") {
      return { bg: "rgba(244, 63, 94, 0.15)", color: "#f43f5e", border: "rgba(244, 63, 94, 0.3)" };
    }
    if (p === "HIGH") {
      return { bg: "rgba(251, 191, 36, 0.15)", color: "#fbbf24", border: "rgba(251, 191, 36, 0.3)" };
    }
    return { bg: "rgba(148, 163, 184, 0.12)", color: "#94a3b8", border: "rgba(148, 163, 184, 0.2)" };
  };

  if (authLoading || loading) {
    return (
      <div style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
        <div style={{ height: "64px", background: "var(--surface-raised, #181b20)", borderRadius: "6px" }} className="skeleton" />
        <div style={{ height: "140px", background: "var(--surface-raised, #181b20)", borderRadius: "6px" }} className="skeleton" />
        <div style={{ height: "380px", background: "var(--surface-raised, #181b20)", borderRadius: "6px" }} className="skeleton" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "32px", color: "var(--accent-alert, #f43f5e)", fontFamily: "var(--font-sans, Inter)" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "16px" }}>Failed to load operations workspace</h2>
        <p style={{ marginBottom: "24px", color: "var(--text-secondary, #7a7d82)" }}>{error}</p>
        <button
          onClick={loadData}
          style={{
            background: "var(--surface-raised, #181b20)",
            color: "var(--text-primary, #e8e6e3)",
            border: "1px solid var(--border-default, rgba(255,255,255,0.1))",
            padding: "8px 16px",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const ws = briefing?.workspace;
  const health = briefing?.systemHealth;
  const metrics = briefing?.briefing;
  const readiness = briefing?.caseReadiness;
  const queues = briefing?.queues;

  const hasUrgentIssues = (metrics?.criticalFindings ?? 0) > 0 || (metrics?.highPriorityAlerts ?? 0) > 0;
  const isCompact = density === "compact";

  return (
    <div
      style={{
        padding: isCompact ? "18px 24px" : "28px 32px",
        display: "flex",
        flexDirection: "column",
        gap: isCompact ? "20px" : "28px",
        fontFamily: "var(--font-sans, Inter)",
        color: "var(--text-primary, #e8e6e3)",
        background: "var(--surface-base, #0f1114)",
        minHeight: "100%",
      }}
    >
      {/* ── SECTION 1: OPERATIONS COMMAND HEADER ────────────────────── */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "16px",
          borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
          paddingBottom: "18px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span
              style={{
                color: "var(--brand-400, #38bdf8)",
                fontSize: "0.75rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {ws?.organizationName || "NATIONAL FORENSICS OPERATIONS WORKSPACE"}
            </span>
            {ws?.unitName && (
              <>
                <span style={{ color: "var(--text-muted, #64748b)" }}>•</span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary, #94a3b8)", fontFamily: "var(--font-mono)" }}>
                  {ws.unitName}
                </span>
              </>
            )}
            {ws?.jurisdictionLabel && (
              <>
                <span style={{ color: "var(--text-muted, #64748b)" }}>•</span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary, #94a3b8)", fontFamily: "var(--font-mono)" }}>
                  {ws.jurisdictionLabel}
                </span>
              </>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <h1 style={{ fontSize: isCompact ? "1.6rem" : "1.85rem", fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
              Operations Console
            </h1>
            <span
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono, monospace)",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: "4px",
                background: "rgba(59, 130, 246, 0.15)",
                color: "#60a5fa",
                border: "1px solid rgba(59, 130, 246, 0.3)",
              }}
            >
              {user?.role} CLEARANCE
            </span>
            <span
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono, monospace)",
                padding: "2px 8px",
                borderRadius: "4px",
                background: "var(--surface-sunken, #0a0c0e)",
                color: health?.api === "operational" ? "var(--accent-verified, #10b981)" : "var(--accent-danger, #f43f5e)",
                border: `1px solid ${health?.api === "operational" ? "rgba(16, 185, 129, 0.3)" : "rgba(244, 63, 94, 0.3)"}`,
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
              title={`Checked at ${health?.checkedAt || "now"} (DB: ${health?.database}, Storage: ${health?.storage})`}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: health?.api === "operational" ? "#10b981" : "#f43f5e",
                }}
              />
              SYSTEM: {health?.api?.toUpperCase() || "OPERATIONAL"}
            </span>
          </div>

          <p style={{ color: "var(--text-secondary, #94a3b8)", fontSize: "0.875rem", margin: 0 }}>
            Active duty console for <strong>{user?.name}</strong> • Cryptographic ledger synchronized
          </p>
        </div>

        {/* Action Controls & Density Switcher */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Density Toggle */}
          <button
            onClick={handleDensityToggle}
            className="btn btn-sm"
            style={{
              background: "var(--surface-raised, #181b20)",
              color: "var(--text-secondary, #94a3b8)",
              border: "1px solid var(--border-default, rgba(255,255,255,0.1))",
              fontSize: "12px",
              padding: "6px 10px",
              borderRadius: "5px",
              cursor: "pointer",
            }}
            title="Toggle between Comfortable and Compact UI density"
          >
            Density: <strong style={{ color: "var(--text-primary)" }}>{density}</strong>
          </button>

          {/* Refresh Briefing */}
          <button
            onClick={loadData}
            className="btn btn-sm"
            style={{
              background: "var(--surface-raised, #181b20)",
              color: "var(--text-secondary, #94a3b8)",
              border: "1px solid var(--border-default, rgba(255,255,255,0.1))",
              fontSize: "12px",
              padding: "6px 12px",
              borderRadius: "5px",
              cursor: "pointer",
            }}
            title="Refresh workspace briefing"
          >
            ↻ Refresh
          </button>

          <Link
            href="/cases/new"
            className="btn btn-sm"
            style={{
              background: "var(--brand-600, #2563eb)",
              color: "#ffffff",
              fontWeight: 600,
              fontSize: "12px",
              padding: "6px 14px",
              borderRadius: "5px",
              textDecoration: "none",
            }}
          >
            + New Case
          </Link>
          <Link
            href="/evidence/new"
            className="btn btn-sm"
            style={{
              background: "var(--surface-overlay, #22272e)",
              color: "var(--text-primary, #f8fafc)",
              border: "1px solid var(--border-default, rgba(255,255,255,0.15))",
              fontWeight: 600,
              fontSize: "12px",
              padding: "6px 14px",
              borderRadius: "5px",
              textDecoration: "none",
            }}
          >
            ↑ Ingest Exhibit
          </Link>
        </div>
      </header>

      {/* ── SECTION 2: TODAY'S OPERATIONS BRIEF HERO ────────────────── */}
      <section
        style={{
          background: "var(--surface-raised, #181b20)",
          border: hasUrgentIssues
            ? "1px solid rgba(244, 63, 94, 0.4)"
            : "1px solid var(--border-default, #23272f)",
          borderRadius: "8px",
          padding: isCompact ? "16px 20px" : "20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: isCompact ? "14px" : "18px",
        }}
        aria-label="Today's Operations Briefing"
      >
        {/* Banner Alert or Nominal State */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: hasUrgentIssues
                  ? "var(--accent-danger, #f43f5e)"
                  : "var(--accent-verified, #10b981)",
                boxShadow: hasUrgentIssues ? "0 0 10px rgba(244, 63, 94, 0.8)" : "none",
              }}
            />
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--text-primary, #f8fafc)" }}>
              {hasUrgentIssues ? "Priority Intelligence Action Required" : "Today's Operations Status: Nominal"}
            </h2>
            {hasUrgentIssues && (
              <span
                style={{
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 800,
                  padding: "2px 8px",
                  borderRadius: "4px",
                  background: "rgba(244, 63, 94, 0.2)",
                  color: "#f43f5e",
                  border: "1px solid rgba(244, 63, 94, 0.4)",
                  letterSpacing: "0.04em",
                }}
              >
                {(metrics?.criticalFindings ?? 0) + (metrics?.highPriorityAlerts ?? 0)} HIGH SIGNALS
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {offlineDrafts.length > 0 && (
              <button
                onClick={handleSyncOfflineQueue}
                disabled={syncingOffline}
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "4px",
                  background: "rgba(251, 191, 36, 0.15)",
                  color: "#fbbf24",
                  border: "1px solid rgba(251, 191, 36, 0.3)",
                  cursor: "pointer",
                }}
              >
                {syncingOffline ? "Syncing…" : `⚡ Sync Offline Vault (${offlineDrafts.length})`}
              </button>
            )}
            <Link
              href="/notifications"
              style={{
                fontSize: "12.5px",
                fontWeight: 600,
                color: "var(--brand-400, #38bdf8)",
                textDecoration: "none",
              }}
            >
              Open Alert Command Center →
            </Link>
          </div>
        </div>

        {/* 6 Key Operational Metrics */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "12px",
          }}
        >
          {/* Active Cases */}
          <div
            style={{
              background: "var(--surface-base, #0f1114)",
              border: "1px solid var(--border-default, #23272f)",
              borderRadius: "6px",
              padding: isCompact ? "10px 14px" : "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", textTransform: "uppercase" }}>
              ACTIVE DOSSIERS
            </span>
            <strong style={{ fontSize: "1.75rem", fontWeight: 800, lineHeight: 1, color: "var(--text-primary)" }}>
              {metrics?.activeCases ?? 0}
            </strong>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Scoped to duty role
            </span>
          </div>

          {/* Evidence in Scope */}
          <div
            style={{
              background: "var(--surface-base, #0f1114)",
              border: "1px solid var(--border-default, #23272f)",
              borderRadius: "6px",
              padding: isCompact ? "10px 14px" : "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", textTransform: "uppercase" }}>
              EVIDENCE EXHIBITS
            </span>
            <strong style={{ fontSize: "1.75rem", fontWeight: 800, lineHeight: 1, color: "var(--text-primary)" }}>
              {metrics?.totalEvidenceInScope ?? 0}
            </strong>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Under active custody
            </span>
          </div>

          {/* Critical / High Findings */}
          <div
            style={{
              background: "var(--surface-base, #0f1114)",
              border: `1px solid ${(metrics?.criticalFindings ?? 0) > 0 ? "rgba(244, 63, 94, 0.4)" : "var(--border-default, #23272f)"}`,
              borderRadius: "6px",
              padding: isCompact ? "10px 14px" : "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-mono)", color: (metrics?.criticalFindings ?? 0) > 0 ? "var(--accent-danger, #f43f5e)" : "var(--text-secondary)", textTransform: "uppercase" }}>
              CRITICAL / HIGH ANOMALIES
            </span>
            <strong
              style={{
                fontSize: "1.75rem",
                fontWeight: 800,
                lineHeight: 1,
                color: (metrics?.criticalFindings ?? 0) > 0 ? "var(--accent-danger, #f43f5e)" : "var(--accent-verified, #10b981)",
              }}
            >
              {(metrics?.criticalFindings ?? 0) + (metrics?.highPriorityAlerts ?? 0)}
            </strong>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {(metrics?.criticalFindings ?? 0) > 0 ? "Requires remediation" : "Integrity intact"}
            </span>
          </div>

          {/* Pending Integrity Assessments */}
          <div
            style={{
              background: "var(--surface-base, #0f1114)",
              border: "1px solid var(--border-default, #23272f)",
              borderRadius: "6px",
              padding: isCompact ? "10px 14px" : "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", textTransform: "uppercase" }}>
              PENDING ASSESSMENTS
            </span>
            <strong style={{ fontSize: "1.75rem", fontWeight: 800, lineHeight: 1, color: "var(--accent-pending, #fbbf24)" }}>
              {metrics?.pendingIntegrityAssessments ?? 0}
            </strong>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Awaiting verification
            </span>
          </div>

          {/* Custody Actions Required */}
          <div
            style={{
              background: "var(--surface-base, #0f1114)",
              border: "1px solid var(--border-default, #23272f)",
              borderRadius: "6px",
              padding: isCompact ? "10px 14px" : "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", textTransform: "uppercase" }}>
              CUSTODY ACTIONS
            </span>
            <strong style={{ fontSize: "1.75rem", fontWeight: 800, lineHeight: 1, color: "var(--text-primary)" }}>
              {metrics?.custodyActionsRequired ?? 0}
            </strong>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Transfers & handoffs
            </span>
          </div>

          {/* Offline Draft Vault */}
          <div
            style={{
              background: "var(--surface-base, #0f1114)",
              border: `1px solid ${offlineDrafts.length > 0 ? "rgba(251, 191, 36, 0.4)" : "var(--border-default, #23272f)"}`,
              borderRadius: "6px",
              padding: isCompact ? "10px 14px" : "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", textTransform: "uppercase" }}>
              OFFLINE VAULT
            </span>
            <strong
              style={{
                fontSize: "1.75rem",
                fontWeight: 800,
                lineHeight: 1,
                color: offlineDrafts.length > 0 ? "#fbbf24" : "var(--text-primary)",
              }}
            >
              {offlineDrafts.length}
            </strong>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {offlineDrafts.length > 0 ? "Pending device sync" : "All drafts synced"}
            </span>
          </div>
        </div>
      </section>

      {/* ── SECTION 3: ACTIVE CASE OPERATIONS BOARD ────────────────── */}
      <section
        style={{
          background: "var(--surface-raised, #181b20)",
          border: "1px solid var(--border-default, #23272f)",
          borderRadius: "8px",
          padding: isCompact ? "18px 20px" : "22px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
        aria-label="Active Case Operations Board"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-primary, #f8fafc)" }}>
              Active Case Operations Board
            </h2>
            <p style={{ margin: "2px 0 0 0", fontSize: "0.825rem", color: "var(--text-secondary, #94a3b8)" }}>
              Live dossier health, priority assignments, and court-admissibility readiness scores.
            </p>
          </div>

          <Link
            href="/cases"
            style={{
              fontSize: "12.5px",
              fontWeight: 600,
              color: "var(--brand-400, #38bdf8)",
              textDecoration: "none",
            }}
          >
            Explore All Dossiers ({allCases.length}) →
          </Link>
        </div>

        {/* Filter and Search Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            background: "var(--surface-base, #0f1114)",
            padding: "10px 14px",
            borderRadius: "6px",
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
          }}
        >
          {/* Search Input */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: "220px" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "14px" }}>🔍</span>
            <input
              type="text"
              placeholder="Filter by case title or identifier…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-primary)",
                fontSize: "13px",
                width: "100%",
                outline: "none",
              }}
            />
          </div>

          {/* Filters */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {/* Status select */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                background: "var(--surface-raised, #181b20)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-default, #30363d)",
                fontSize: "12px",
                padding: "4px 8px",
                borderRadius: "4px",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="ALL">Status: All</option>
              <option value="OPEN">Open / Active</option>
              <option value="PENDING_REVIEW">Pending Review</option>
              <option value="CLOSED">Closed</option>
            </select>

            {/* Readiness filter */}
            <select
              value={readinessFilter}
              onChange={(e) => setReadinessFilter(e.target.value)}
              style={{
                background: "var(--surface-raised, #181b20)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-default, #30363d)",
                fontSize: "12px",
                padding: "4px 8px",
                borderRadius: "4px",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="ALL">Readiness: All</option>
              <option value="HEALTHY">Healthy (90+)</option>
              <option value="REVIEW">Needs Review (70-89)</option>
              <option value="AT_RISK">At Risk (50-69)</option>
              <option value="CRITICAL">Critical (&lt;50)</option>
            </select>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                background: "var(--surface-raised, #181b20)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-default, #30363d)",
                fontSize: "12px",
                padding: "4px 8px",
                borderRadius: "4px",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="updated">Sort: Last Activity</option>
              <option value="priority">Sort: Priority</option>
              <option value="readiness">Sort: Lowest Readiness First</option>
            </select>
          </div>
        </div>

        {/* Case Cards Grid */}
        {filteredCases.length === 0 ? (
          <div
            style={{
              padding: "32px",
              textAlign: "center",
              color: "var(--text-muted, #64748b)",
              fontSize: "0.875rem",
              background: "var(--surface-sunken, #0a0c0e)",
              borderRadius: "6px",
              border: "1px dashed var(--border-subtle, rgba(255,255,255,0.08))",
            }}
          >
            No active cases match the specified operational criteria.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isCompact ? "repeat(auto-fill, minmax(280px, 1fr))" : "repeat(auto-fill, minmax(320px, 1fr))",
              gap: isCompact ? "10px" : "14px",
            }}
          >
            {filteredCases.slice(0, 8).map((c) => {
              const statusStyle = getStatusBadgeStyle(c.status);
              const priorityStyle = getPriorityBadgeStyle(c.priority || "MEDIUM");
              const rScore = (c as any).readinessScore ?? null;
              const openFindings = (c as any).openFindingsCount ?? 0;

              return (
                <Link
                  key={c.id}
                  href={`/cases/${c.id}`}
                  style={{
                    background: "var(--surface-overlay, #1e2228)",
                    border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
                    borderRadius: "6px",
                    padding: isCompact ? "12px 14px" : "16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    textDecoration: "none",
                    color: "inherit",
                    transition: "border-color 0.15s ease, transform 0.15s ease",
                  }}
                  className="hover:border-slate-500"
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                      <strong
                        style={{
                          fontSize: isCompact ? "0.9rem" : "0.95rem",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {c.title}
                      </strong>
                      <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                        {`CASE-${c.id.slice(0, 8).toUpperCase()}`}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "4px" }}>
                      <span
                        style={{
                          fontSize: "9.5px",
                          fontFamily: "var(--font-mono)",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "3px",
                          background: priorityStyle.bg,
                          color: priorityStyle.color,
                          border: `1px solid ${priorityStyle.border}`,
                          textTransform: "uppercase",
                        }}
                      >
                        {c.priority || "MED"}
                      </span>
                      <span
                        style={{
                          fontSize: "9.5px",
                          fontFamily: "var(--font-mono)",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "3px",
                          background: statusStyle.bg,
                          color: statusStyle.color,
                          border: `1px solid ${statusStyle.border}`,
                          textTransform: "uppercase",
                        }}
                      >
                        {c.status}
                      </span>
                    </div>
                  </div>

                  {/* Readiness Meter & Exhibits Info */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "0.8rem",
                      color: "var(--text-secondary)",
                      borderTop: "1px solid var(--border-subtle, rgba(255,255,255,0.05))",
                      paddingTop: "8px",
                    }}
                  >
                    <span>{c.evidenceCount ?? 0} exhibits registered</span>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>READINESS:</span>
                      {rScore !== null ? (
                        <strong
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.85rem",
                            color:
                              rScore >= 90
                                ? "var(--accent-verified, #10b981)"
                                : rScore >= 70
                                ? "var(--accent-pending, #fbbf24)"
                                : "var(--accent-danger, #f43f5e)",
                          }}
                        >
                          {Math.round(rScore)}%
                        </strong>
                      ) : (
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>UNASSESSED</span>
                      )}
                    </div>
                  </div>

                  {/* Open Findings Alert Pill if present */}
                  {openFindings > 0 && (
                    <div
                      style={{
                        fontSize: "0.75rem",
                        padding: "3px 8px",
                        borderRadius: "3px",
                        background: "rgba(244, 63, 94, 0.12)",
                        color: "#f43f5e",
                        border: "1px solid rgba(244, 63, 94, 0.25)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <span>⚠</span>
                      <span>{openFindings} open integrity findings requiring review</span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ── SECTION 4: 4 WORKLOAD QUEUES ───────────────────────────── */}
      <section
        style={{
          background: "var(--surface-raised, #181b20)",
          border: "1px solid var(--border-default, #23272f)",
          borderRadius: "8px",
          padding: isCompact ? "18px 20px" : "22px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
        aria-label="Operational Workload Queues"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-primary, #f8fafc)" }}>
              Operational Workload Queues
            </h2>
            <p style={{ margin: "2px 0 0 0", fontSize: "0.825rem", color: "var(--text-secondary, #94a3b8)" }}>
              Direct duty assignments, pending exhibit reviews, offline client synchronization, and custody trail.
            </p>
          </div>

          {/* Queue Tab Buttons */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {[
              { key: "assigned" as QueueTab, label: `Assigned to Me (${queues?.assignedToMe?.length ?? 0})` },
              { key: "evidence_review" as QueueTab, label: `Needs Review (${queues?.needsEvidenceReview?.length ?? 0})` },
              { key: "offline_sync" as QueueTab, label: `Offline Sync (${offlineDrafts.length})` },
              { key: "activity" as QueueTab, label: `Chain Activity (${queues?.recentActivity?.length ?? 0})` },
            ].map((tab) => {
              const active = activeQueueTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveQueueTab(tab.key)}
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "6px 12px",
                    borderRadius: "4px",
                    background: active ? "var(--brand-600, #2563eb)" : "var(--surface-base, #0f1114)",
                    color: active ? "#ffffff" : "var(--text-secondary, #94a3b8)",
                    border: `1px solid ${active ? "transparent" : "var(--border-default, #30363d)"}`,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        {/* ── QUEUE 1: ASSIGNED TO ME ── */}
        {activeQueueTab === "assigned" && (
          <div>
            {queues?.assignedToMe && queues.assignedToMe.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {queues.assignedToMe.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 16px",
                      background: "var(--surface-sunken, #0a0c0e)",
                      border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
                      borderRadius: "6px",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "220px" }}>
                      <span
                        style={{
                          fontSize: "10px",
                          fontFamily: "var(--font-mono)",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "3px",
                          background: "rgba(59, 130, 246, 0.15)",
                          color: "#60a5fa",
                        }}
                      >
                        {item.relationship}
                      </span>
                      <div>
                        <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>{item.title}</strong>
                        <span style={{ fontSize: "11.5px", color: "var(--text-muted)", display: "block" }}>
                          {item.evidenceCount} exhibits • Updated {formatRelativeTime(item.updatedAt)}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      {item.readinessScore !== null && (
                        <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                          Score: <strong>{Math.round(item.readinessScore)}%</strong>
                        </span>
                      )}
                      <Link
                        href={`/cases/${item.id}`}
                        className="btn btn-sm"
                        style={{
                          background: "var(--surface-raised, #181b20)",
                          color: "var(--brand-400, #38bdf8)",
                          border: "1px solid var(--border-default, #30363d)",
                          fontSize: "12px",
                          padding: "4px 12px",
                          borderRadius: "4px",
                          textDecoration: "none",
                        }}
                      >
                        Open Dossier →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                No active duty cases assigned directly to your clearance profile.
              </div>
            )}
          </div>
        )}

        {/* ── QUEUE 2: NEEDS EVIDENCE REVIEW ── */}
        {activeQueueTab === "evidence_review" && (
          <div>
            {queues?.needsEvidenceReview && queues.needsEvidenceReview.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {queues.needsEvidenceReview.map((item) => {
                  const isCrit = item.highestSeverity === "CRITICAL";
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "12px 16px",
                        background: "var(--surface-sunken, #0a0c0e)",
                        border: `1px solid ${isCrit ? "rgba(244, 63, 94, 0.3)" : "rgba(251, 191, 36, 0.3)"}`,
                        borderRadius: "6px",
                        gap: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "220px" }}>
                        <span
                          style={{
                            fontSize: "10px",
                            fontFamily: "var(--font-mono)",
                            fontWeight: 800,
                            padding: "2px 6px",
                            borderRadius: "3px",
                            background: isCrit ? "rgba(244, 63, 94, 0.15)" : "rgba(251, 191, 36, 0.15)",
                            color: isCrit ? "#f43f5e" : "#fbbf24",
                            border: `1px solid ${isCrit ? "rgba(244, 63, 94, 0.3)" : "rgba(251, 191, 36, 0.3)"}`,
                          }}
                        >
                          {item.highestSeverity}
                        </span>
                        <div>
                          <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>{item.name}</strong>
                          <span style={{ fontSize: "11.5px", color: "var(--text-muted)", display: "block" }}>
                            {item.findingTitle || "Integrity anomaly detected"} • SHA-256: {item.sha256 ? `${item.sha256.slice(0, 12)}…` : "None"}
                          </span>
                        </div>
                      </div>

                      <Link
                        href={`/evidence/${item.id}`}
                        className="btn btn-sm"
                        style={{
                          background: isCrit ? "var(--accent-danger, #f43f5e)" : "var(--brand-500, #38bdf8)",
                          color: isCrit ? "#ffffff" : "#0a0c0e",
                          fontWeight: 700,
                          fontSize: "12px",
                          padding: "4px 12px",
                          borderRadius: "4px",
                          textDecoration: "none",
                        }}
                      >
                        Inspect Exhibit →
                      </Link>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--accent-verified, #10b981)", fontSize: "13px" }}>
                ✓ No exhibits currently require urgent forensic integrity review.
              </div>
            )}
          </div>
        )}

        {/* ── QUEUE 3: PENDING OFFLINE SYNC ── */}
        {activeQueueTab === "offline_sync" && (
          <div>
            {offlineDrafts.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                    {offlineDrafts.length} exhibit(s) waiting in local IndexedDB vault for ledger sync.
                  </span>
                  <button
                    onClick={handleSyncOfflineQueue}
                    disabled={syncingOffline}
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      padding: "6px 14px",
                      borderRadius: "4px",
                      background: "var(--brand-600, #2563eb)",
                      color: "#ffffff",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {syncingOffline ? "Synchronizing…" : "⚡ Sync All to Ledger"}
                  </button>
                </div>

                {offlineDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      background: "var(--surface-sunken, #0a0c0e)",
                      border: "1px solid rgba(251, 191, 36, 0.2)",
                      borderRadius: "6px",
                      fontSize: "12.5px",
                    }}
                  >
                    <div>
                      <strong style={{ color: "var(--text-primary)" }}>{draft.name}</strong>
                      <span style={{ color: "var(--text-muted)", display: "block", fontSize: "11px" }}>
                        {draft.mimeType} • {(draft.fileSize / 1024).toFixed(1)} KB • Queued {new Date(draft.createdAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <span
                      style={{
                        fontSize: "10px",
                        fontFamily: "var(--font-mono)",
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: "3px",
                        background: "rgba(251, 191, 36, 0.15)",
                        color: "#fbbf24",
                      }}
                    >
                      {draft.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--accent-verified, #10b981)", fontSize: "13px" }}>
                ✓ Local offline vault is completely synchronized. Zero pending offline items.
              </div>
            )}
          </div>
        )}

        {/* ── QUEUE 4: CHAIN ACTIVITY STREAM ── */}
        {activeQueueTab === "activity" && (
          <div>
            {queues?.recentActivity && queues.recentActivity.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {queues.recentActivity.map((act) => (
                  <div
                    key={act.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      background: "var(--surface-sunken, #0a0c0e)",
                      border: "1px solid var(--border-subtle, rgba(255,255,255,0.05))",
                      borderRadius: "6px",
                      fontSize: "12.5px",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "14px" }}>
                        {act.type === "CUSTODY" ? "🔄" : act.type === "EVIDENCE_UPLOAD" ? "📦" : "🛡️"}
                      </span>
                      <div>
                        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                          {act.action}
                        </span>
                        <span style={{ color: "var(--text-muted)", display: "block", fontSize: "11px" }}>
                          by <strong>{act.actorName}</strong> ({act.actorRole}) • {formatRelativeTime(act.timestamp)}
                        </span>
                      </div>
                    </div>

                    <Link
                      href={act.link}
                      style={{
                        fontSize: "12px",
                        color: "var(--brand-400, #38bdf8)",
                        textDecoration: "none",
                        fontWeight: 600,
                      }}
                    >
                      View Record →
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                No recent chain of custody or audit records found.
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── SECTION 5: FORENSIC READINESS OVERVIEW ──────────────────── */}
      <section
        style={{
          background: "var(--surface-raised, #181b20)",
          border: "1px solid var(--border-default, #23272f)",
          borderRadius: "8px",
          padding: isCompact ? "18px 20px" : "20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
        aria-label="Forensic Readiness Distribution"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--text-primary, #f8fafc)" }}>
              Forensic Readiness Distribution
            </h2>
            <p style={{ margin: "2px 0 0 0", fontSize: "0.825rem", color: "var(--text-secondary, #94a3b8)" }}>
              Aggregate integrity health across all {readiness?.totalCases ?? 0} active dossiers.
            </p>
          </div>

          <Link
            href="/verify"
            style={{
              fontSize: "12.5px",
              fontWeight: 600,
              color: "var(--accent-verified, #10b981)",
              textDecoration: "none",
            }}
          >
            Public Hash & Proof Verification →
          </Link>
        </div>

        {/* Multi-Segment Health Bar */}
        {(() => {
          const total = readiness?.totalCases || 1;
          const healthyPct = Math.round(((readiness?.healthy || 0) / total) * 100);
          const reviewPct = Math.round(((readiness?.needsReview || 0) / total) * 100);
          const atRiskPct = Math.round(((readiness?.atRisk || 0) / total) * 100);
          const critPct = Math.round(((readiness?.critical || 0) / total) * 100);

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div
                style={{
                  height: "12px",
                  borderRadius: "6px",
                  background: "#1e293b",
                  display: "flex",
                  overflow: "hidden",
                  width: "100%",
                }}
              >
                <div style={{ width: `${healthyPct}%`, background: "#10b981" }} title={`Healthy: ${readiness?.healthy || 0}`} />
                <div style={{ width: `${reviewPct}%`, background: "#fbbf24" }} title={`Needs Review: ${readiness?.needsReview || 0}`} />
                <div style={{ width: `${atRiskPct}%`, background: "#f97316" }} title={`At Risk: ${readiness?.atRisk || 0}`} />
                <div style={{ width: `${critPct}%`, background: "#f43f5e" }} title={`Critical: ${readiness?.critical || 0}`} />
              </div>

              {/* Legend */}
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "11.5px", color: "var(--text-secondary)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }} />
                  Healthy (90-100%): <strong>{readiness?.healthy || 0}</strong>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#fbbf24" }} />
                  Needs Review (70-89%): <strong>{readiness?.needsReview || 0}</strong>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f97316" }} />
                  At Risk (50-69%): <strong>{readiness?.atRisk || 0}</strong>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f43f5e" }} />
                  Critical (&lt;50%): <strong>{readiness?.critical || 0}</strong>
                </span>
              </div>
            </div>
          );
        })()}
      </section>
    </div>
  );
}

