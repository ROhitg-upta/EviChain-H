"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/auth-context";
import {
  globalSearch,
  type GlobalSearchResponse,
} from "@/lib/api";
import WorkspaceShell from "@/app/components/ui/workspace-shell";

const RECENT_SEARCHES_KEY = "evichain_recent_searches_v1";

const TYPE_ICONS: Record<string, string> = {
  CASE:         "▣",
  EVIDENCE:     "◈",
  AUDIT:        "≡",
  USER:         "○",
  NOTIFICATION: "🔔",
  CUSTODY:      "⇄",
};

const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  CASE:         { color: "var(--brand-400)",      bg: "var(--brand-900)" },
  EVIDENCE:     { color: "var(--accent-active)",  bg: "var(--accent-active-dim)" },
  AUDIT:        { color: "var(--accent-info)",    bg: "var(--accent-info-dim)" },
  USER:         { color: "var(--text-primary)",   bg: "var(--surface-sunken)" },
  NOTIFICATION: { color: "var(--accent-warning)", bg: "var(--accent-warning-dim)" },
  CUSTODY:      { color: "var(--accent-warning)", bg: "var(--accent-warning-dim)" },
};

function SearchContent() {
  const { user, accessToken, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery]               = useState(searchParams.get("q") || "");
  const [selectedType, setSelectedType] = useState<string>(searchParams.get("types") || "ALL");
  const [fromDate, setFromDate]         = useState(searchParams.get("from") || "");
  const [toDate, setToDate]             = useState(searchParams.get("to") || "");
  const [page, setPage]                 = useState(1);

  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [searchData, setSearchData]     = useState<GlobalSearchResponse | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) setRecentSearches(JSON.parse(stored).slice(0, 8));
    } catch {}
  }, []);

  const saveRecent = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 50) return;
    setRecentSearches((prev) => {
      const next = [trimmed, ...prev.filter((i) => i.toLowerCase() !== trimmed.toLowerCase())].slice(0, 8);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {}
    setRecentSearches([]);
  }, []);

  const executeSearch = useCallback(async (q: string, type: string, from?: string, to?: string, p: number = 1) => {
    if (!accessToken || q.trim().length < 2) {
      setSearchData(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await globalSearch(accessToken, {
        q: q.trim(),
        types: type === "ALL" ? undefined : type,
        from: from || undefined,
        to: to || undefined,
        page: p,
        pageSize: 20,
        mode: "full",
      });
      setSearchData(res);
      saveRecent(q.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setSearchData(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, saveRecent]);

  // Initial trigger from URL params
  useEffect(() => {
    const initialQ = searchParams.get("q");
    if (initialQ && initialQ.trim().length >= 2) {
      setQuery(initialQ);
      executeSearch(initialQ, selectedType, fromDate, toDate, 1);
    }
  }, [searchParams, executeSearch, selectedType, fromDate, toDate]);

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length >= 2) {
      setPage(1);
      executeSearch(query.trim(), selectedType, fromDate, toDate, 1);
      const params = new URLSearchParams();
      params.set("q", query.trim());
      if (selectedType !== "ALL") params.set("types", selectedType);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      router.push(`/search?${params.toString()}`);
    }
  }

  function handleTypeChange(type: string) {
    setSelectedType(type);
    if (query.trim().length >= 2) {
      setPage(1);
      executeSearch(query.trim(), type, fromDate, toDate, 1);
    }
  }

  if (authLoading) {
    return (
      <div style={{ padding: "32px" }}>
        <div className="skeleton" style={{ height: "40px", width: "260px", marginBottom: "20px" }} />
        <div className="skeleton" style={{ height: "200px", width: "100%" }} />
      </div>
    );
  }

  return (
    <div style={{ padding: "28px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--brand-400)", textTransform: "uppercase" }}>
            INDEX DISCOVERY CONSOLE
          </span>
        </div>
        <h1 style={{ fontSize: "26px", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
          Global Evidence Search
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--text-secondary)" }}>
          Federated index search across active cases, evidence fingerprints, SHA-256 hashes, and compliance ledgers.
        </p>
      </div>

      {/* Search Bar & Filters Form */}
      <form onSubmit={handleFormSubmit} style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by case title, evidence filename, 64-char SHA-256 hash, or audit action…"
              style={{
                width: "100%",
                background: "var(--surface-raised)",
                border: "1px solid var(--border-default)",
                borderRadius: "8px",
                padding: "12px 16px 12px 40px",
                color: "var(--text-primary)",
                fontSize: "14px",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
            <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-disabled)", fontSize: "16px" }}>
              ⌕
            </span>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-md"
            disabled={loading || query.trim().length < 2}
            style={{ padding: "0 24px" }}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        {/* Filter Pills */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {(
              [
                { key: "ALL",          label: "All Sources" },
                { key: "CASE",         label: "Cases" },
                { key: "EVIDENCE",     label: "Evidence" },
                { key: "AUDIT",        label: "Audit Ledger" },
                { key: "NOTIFICATION", label: "Notifications" },
                ...(user?.role === "Administrator" ? [{ key: "USER", label: "Users" }] : []),
              ] as const
            ).map((t) => {
              const active = selectedType === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => handleTypeChange(t.key)}
                  style={{
                    background: active ? "var(--surface-raised)" : "transparent",
                    border: active ? "1px solid var(--border-default)" : "1px solid transparent",
                    borderRadius: "6px",
                    padding: "5px 12px",
                    fontSize: "12.5px",
                    fontWeight: active ? 700 : 500,
                    color: active ? "var(--brand-400)" : "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Date range inputs */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--text-secondary)" }}>
            <span>From:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{
                background: "var(--surface-raised)",
                border: "1px solid var(--border-default)",
                borderRadius: "4px",
                padding: "3px 8px",
                color: "var(--text-primary)",
                fontSize: "11.5px",
              }}
            />
            <span>To:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{
                background: "var(--surface-raised)",
                border: "1px solid var(--border-default)",
                borderRadius: "4px",
                padding: "3px 8px",
                color: "var(--text-primary)",
                fontSize: "11.5px",
              }}
            />
          </div>
        </div>
      </form>

      {/* Recent Searches Header */}
      {!searchData && recentSearches.length > 0 && !loading && (
        <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "16px 20px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
              Recent Searches
            </span>
            <button
              onClick={clearRecent}
              style={{ background: "transparent", border: "none", color: "var(--text-disabled)", fontSize: "11.5px", cursor: "pointer" }}
            >
              Clear history
            </button>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {recentSearches.map((term) => (
              <button
                key={term}
                onClick={() => {
                  setQuery(term);
                  executeSearch(term, selectedType, fromDate, toDate, 1);
                }}
                style={{
                  background: "var(--surface-sunken)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "6px",
                  padding: "6px 12px",
                  color: "var(--brand-400)",
                  fontSize: "12.5px",
                  cursor: "pointer",
                }}
              >
                ⌕ {term}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{ padding: "16px", borderRadius: "8px", background: "var(--accent-danger-dim)", border: "1px solid var(--accent-danger)", color: "var(--accent-danger)", marginBottom: "20px" }}>
          <strong>Search Error:</strong> {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ padding: "40px", textAlign: "center" }}>
          <div className="skeleton" style={{ height: "28px", width: "200px", margin: "0 auto 12px" }} />
          <div className="skeleton" style={{ height: "18px", width: "360px", margin: "0 auto 24px" }} />
          <div className="skeleton" style={{ height: "80px", width: "100%", marginBottom: "12px" }} />
          <div className="skeleton" style={{ height: "80px", width: "100%" }} />
        </div>
      )}

      {/* Results Rendering */}
      {searchData && !loading && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", paddingBottom: "8px", borderBottom: "1px solid var(--border-default)" }}>
            <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              Found <strong style={{ color: "var(--text-primary)" }}>{searchData.pagination.totalItems}</strong> result{searchData.pagination.totalItems !== 1 ? "s" : ""} for <code style={{ color: "var(--brand-400)", background: "var(--surface-raised)", padding: "2px 6px", borderRadius: "4px" }}>&quot;{searchData.query}&quot;</code>
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-disabled)", fontFamily: "var(--font-mono)" }}>
              Page {searchData.pagination.page} of {searchData.pagination.totalPages || 1}
            </span>
          </div>

          {searchData.groups.length === 0 ? (
            <div style={{ padding: "60px 20px", textAlign: "center", background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "8px" }}>
              <div style={{ fontSize: "36px", marginBottom: "12px" }}>🔍</div>
              <strong style={{ display: "block", fontSize: "16px", color: "var(--text-primary)", marginBottom: "6px" }}>
                No authorized records match this query
              </strong>
              <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "13px" }}>
                Check spelling or verify that your account has clearance to view matching evidence files.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {searchData.groups.map((group) => (
                <div key={group.type} style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "8px", overflow: "hidden" }}>
                  <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border-default)", background: "var(--surface-sunken)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "14px" }}>{TYPE_ICONS[group.type] || "•"}</span>
                      <strong style={{ fontSize: "13.5px", color: "var(--text-primary)" }}>{group.label}</strong>
                    </div>
                    <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-disabled)" }}>
                      {group.total} match{group.total !== 1 ? "es" : ""}
                    </span>
                  </div>

                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {group.items.map((item) => {
                      const colorCfg = TYPE_COLORS[item.type] || { color: "var(--text-secondary)", bg: "var(--surface-sunken)" };

                      return (
                        <li
                          key={`${item.type}-${item.id}`}
                          style={{
                            padding: "14px 18px",
                            borderBottom: "1px solid var(--border-default)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "16px",
                          }}
                          className="table-row-hover"
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                              <Link
                                href={item.href}
                                style={{
                                  color: "var(--text-primary)",
                                  fontSize: "14px",
                                  fontWeight: 700,
                                  textDecoration: "none",
                                }}
                              >
                                {item.title} ↗
                              </Link>
                              {item.status && (
                                <span
                                  style={{
                                    fontSize: "10px",
                                    fontFamily: "var(--font-mono)",
                                    fontWeight: 700,
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    color: colorCfg.color,
                                    background: colorCfg.bg,
                                    border: `1px solid ${colorCfg.color}33`,
                                  }}
                                >
                                  {item.status}
                                </span>
                              )}
                            </div>

                            {item.subtitle && (
                              <p style={{ margin: "0 0 6px", fontSize: "12.5px", color: "var(--text-secondary)", fontFamily: item.subtitle.includes("SHA-256") ? "var(--font-mono)" : "inherit" }}>
                                {item.subtitle}
                              </p>
                            )}

                            {item.matchedFields.length > 0 && (
                              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                <span style={{ fontSize: "10.5px", color: "var(--text-disabled)", fontFamily: "var(--font-mono)" }}>
                                  MATCHED IN:
                                </span>
                                {item.matchedFields.map((f) => (
                                  <span
                                    key={f}
                                    style={{
                                      fontSize: "10px",
                                      fontFamily: "var(--font-mono)",
                                      color: "var(--brand-400)",
                                      background: "var(--surface-sunken)",
                                      padding: "1px 4px",
                                      borderRadius: "3px",
                                    }}
                                  >
                                    {f}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <Link
                            href={item.href}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: "12px", padding: "5px 12px", whiteSpace: "nowrap" }}
                          >
                            Open Details
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <WorkspaceShell breadcrumbs={[{ label: "Global Search" }]}>
      <Suspense fallback={<div style={{ padding: "32px" }}>Loading search...</div>}>
        <SearchContent />
      </Suspense>
    </WorkspaceShell>
  );
}
