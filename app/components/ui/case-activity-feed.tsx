"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/app/auth-context";
import { getCaseActivity, type CaseActivityItem } from "@/lib/api";
import { Activity, MessageSquare, Pin, HardDrive, Shield, FileText, Filter, Clock } from "@/app/components/ui/icons";

interface CaseActivityFeedProps {
  caseId: string;
}

const TYPE_CONFIG = {
  comment: {
    label: "Comment",
    color: "var(--accent-active, #22d3ee)",
    bg: "rgba(34, 211, 238, 0.12)",
    border: "rgba(34, 211, 238, 0.3)",
    icon: MessageSquare,
  },
  annotation: {
    label: "Annotation",
    color: "var(--accent-pending, #fbbf24)",
    bg: "rgba(251, 191, 36, 0.12)",
    border: "rgba(251, 191, 36, 0.3)",
    icon: Pin,
  },
  custody: {
    label: "Custody",
    color: "var(--accent-verified, #b5f542)",
    bg: "rgba(181, 245, 66, 0.12)",
    border: "rgba(181, 245, 66, 0.3)",
    icon: Shield,
  },
  upload: {
    label: "Evidence Upload",
    color: "var(--brand-400, #38bdf8)",
    bg: "rgba(56, 189, 248, 0.12)",
    border: "rgba(56, 189, 248, 0.3)",
    icon: HardDrive,
  },
  audit: {
    label: "Audit Event",
    color: "var(--text-secondary, #9ca3af)",
    bg: "rgba(255, 255, 255, 0.05)",
    border: "var(--border-default)",
    icon: FileText,
  },
};

export default function CaseActivityFeed({ caseId }: CaseActivityFeedProps) {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<CaseActivityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadActivity = useCallback(() => {
    if (!accessToken || !caseId) return;
    setLoading(true);
    setError("");

    getCaseActivity(accessToken, caseId, {
      type: filter === "all" ? undefined : filter,
      page,
      pageSize: 20,
    })
      .then((res) => {
        setItems(res.items || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load activity feed");
      })
      .finally(() => setLoading(false));
  }, [accessToken, caseId, filter, page]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  const filterOptions = [
    { id: "all", label: "All Events" },
    { id: "comment", label: "Comments" },
    { id: "annotation", label: "Annotations" },
    { id: "custody", label: "Custody Transfers" },
    { id: "upload", label: "Evidence" },
    { id: "audit", label: "Audit Ledger" },
  ];

  return (
    <div className="case-activity-feed" style={{ marginTop: 24 }}>
      {/* Header & Filter Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Activity width={18} height={18} style={{ color: "var(--brand-400)" }} />
          <h3 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: 700, color: "var(--text-primary)" }}>
            Case Activity Timeline
          </h3>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--border-subtle)",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--text-secondary)",
            }}
          >
            {total} records
          </span>
        </div>

        {/* Filter Pills */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <Filter width={14} height={14} style={{ color: "var(--text-disabled)", marginRight: 2 }} />
          {filterOptions.map((opt) => {
            const isActive = filter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setFilter(opt.id);
                  setPage(1);
                }}
                style={{
                  padding: "4px 10px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 500,
                  cursor: "pointer",
                  background: isActive ? "var(--brand-600)" : "var(--surface-sunken)",
                  color: isActive ? "#ffffff" : "var(--text-secondary)",
                  border: `1px solid ${isActive ? "var(--brand-500)" : "var(--border-default)"}`,
                  transition: "all 0.15s ease",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div
          role="alert"
          style={{
            padding: "10px 14px",
            background: "var(--accent-danger-dim)",
            border: "1px solid var(--accent-danger-border)",
            borderRadius: "var(--radius-md)",
            color: "var(--accent-danger)",
            fontSize: "var(--text-sm)",
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div style={{ display: "grid", gap: 10, padding: "16px 0" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 68, borderRadius: "var(--radius-md)" }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px 16px",
            background: "var(--surface-sunken)",
            border: "1px dashed var(--border-default)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-secondary)",
          }}
        >
          <Clock width={32} height={32} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
          <strong style={{ display: "block", color: "var(--text-primary)", fontSize: "var(--text-sm)" }}>
            No activity recorded for this filter
          </strong>
          <p style={{ margin: "4px 0 0", fontSize: "var(--text-xs)", color: "var(--text-disabled)" }}>
            Case comments, annotations, custody changes, and uploads will appear here in real-time.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((it) => {
            const conf = TYPE_CONFIG[it.type] || TYPE_CONFIG.audit;
            const IconComp = conf.icon;
            const formattedDate = new Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(it.timestamp));

            return (
              <div
                key={it.id + it.type}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  padding: "12px 16px",
                  background: "var(--surface-sunken)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md)",
                  transition: "border-color 0.15s ease",
                }}
              >
                {/* Type Icon Badge */}
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "var(--radius-sm)",
                    background: conf.bg,
                    border: `1px solid ${conf.border}`,
                    color: conf.color,
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                  title={conf.label}
                >
                  <IconComp width={16} height={16} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: "var(--font-mono)",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          padding: "1px 6px",
                          borderRadius: 3,
                          color: conf.color,
                          background: conf.bg,
                          border: `1px solid ${conf.border}`,
                        }}
                      >
                        {conf.label}
                      </span>
                      <strong style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>
                        {it.title}
                      </strong>
                    </div>

                    <time
                      dateTime={it.timestamp}
                      style={{ fontSize: 11, color: "var(--text-disabled)", fontFamily: "var(--font-mono)" }}
                    >
                      {formattedDate}
                    </time>
                  </div>

                  {it.description && (
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: "var(--text-xs)",
                        color: "var(--text-secondary)",
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {it.description}
                    </p>
                  )}

                  {/* Actor details */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 11, color: "var(--text-disabled)" }}>
                    <span>Actor: <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>{it.actor?.name || "System"}</strong></span>
                    {it.actor?.role && (
                      <>
                        <span>·</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{it.actor.role}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Previous
              </button>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
