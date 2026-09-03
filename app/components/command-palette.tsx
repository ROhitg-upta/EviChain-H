"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/auth-context";
import { searchSuggestions, type SearchItem } from "@/lib/api";

const RECENT_SEARCHES_KEY = "evichain_recent_searches_v1";

const STATIC_ACTIONS: SearchItem[] = [
  { id: "new-case",      type: "CASE",         title: "Create New Case",       subtitle: "Initialize new case dossier", href: "/cases/new", matchedFields: [] },
  { id: "new-evidence",  type: "EVIDENCE",     title: "Register Evidence",     subtitle: "Upload file with SHA-256 integrity", href: "/evidence/new", matchedFields: [] },
  { id: "verify",        type: "EVIDENCE",     title: "Verify Evidence Fingerprint", subtitle: "Inspect SHA-256 or verify file", href: "/verify", matchedFields: [] },
  { id: "audit",         type: "AUDIT",        title: "Audit Ledger",          subtitle: "Browse immutable activity log", href: "/audit", matchedFields: [] },
  { id: "reports",       type: "CASE",         title: "Compliance Reports",    subtitle: "Generate case dossiers & exports", href: "/reports", matchedFields: [] },
  { id: "notifications", type: "NOTIFICATION", title: "Notification Center",   subtitle: "Review system alerts & activity", href: "/notifications", matchedFields: [] },
];

const TYPE_ICONS: Record<string, string> = {
  CASE:         "▣",
  EVIDENCE:     "◈",
  AUDIT:        "≡",
  USER:         "○",
  NOTIFICATION: "🔔",
  CUSTODY:      "⇄",
};

const TYPE_LABELS: Record<string, string> = {
  CASE:         "Case",
  EVIDENCE:     "Evidence",
  AUDIT:        "Audit",
  USER:         "User",
  NOTIFICATION: "Notification",
  CUSTODY:      "Custody",
};

export default function CommandPalette() {
  const { user, accessToken } = useAuth();
  const router = useRouter();

  const [open, setOpen]               = useState(false);
  const [query, setQuery]             = useState("");
  const [results, setResults]         = useState<SearchItem[]>(STATIC_ACTIONS);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading]         = useState(false);
  const [isMac, setIsMac]             = useState(false);

  const inputRef    = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsMac(navigator?.platform?.toUpperCase().includes("MAC") ?? false);
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) setRecentSearches(JSON.parse(stored).slice(0, 6));
    } catch {}
  }, []);

  const saveRecentSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 50) return;
    setRecentSearches((prev) => {
      const next = [trimmed, ...prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 6);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {}
    setRecentSearches([]);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults(STATIC_ACTIONS);
    setActiveIndex(0);
  }, []);

  // Keyboard shortcut listener
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isCmdK) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) closePalette();
    }
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [open, closePalette]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Debounced search query
  useEffect(() => {
    if (!open || !accessToken) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = query.trim();
    if (q.length < 2) {
      const matchingActions = STATIC_ACTIONS.filter((a) =>
        a.title.toLowerCase().includes(q.toLowerCase()),
      );
      setResults(matchingActions.length > 0 ? matchingActions : STATIC_ACTIONS);
      setActiveIndex(0);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchSuggestions(accessToken, q);
        const aggregated: SearchItem[] = [];
        for (const group of data.groups || []) {
          for (const item of group.items || []) {
            aggregated.push(item);
          }
        }

        const matchingActions = STATIC_ACTIONS.filter((a) =>
          a.title.toLowerCase().includes(q.toLowerCase()),
        );

        const fullList = [...aggregated, ...matchingActions];
        setResults(fullList);
        setActiveIndex(0);
      } catch {
        const matchingActions = STATIC_ACTIONS.filter((a) =>
          a.title.toLowerCase().includes(q.toLowerCase()),
        );
        setResults(matchingActions);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, accessToken]);

  function handleSelect(result: SearchItem) {
    if (query.trim().length >= 2) {
      saveRecentSearch(query.trim());
    }
    // Validate that href is an internal safe route
    if (result.href.startsWith("/") && !result.href.startsWith("//")) {
      router.push(result.href);
    }
    closePalette();
  }

  function handleKeyNav(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[activeIndex]) {
        handleSelect(results[activeIndex]);
      } else if (query.trim().length >= 2) {
        saveRecentSearch(query.trim());
        router.push(`/search?q=${encodeURIComponent(query.trim())}`);
        closePalette();
      }
    }
  }

  if (!user) return null;

  return (
    <>
      {/* Trigger Button */}
      <button
        className="cmdk-trigger"
        onClick={() => setOpen(true)}
        aria-label="Open command palette (Ctrl+K)"
        suppressHydrationWarning
      >
        <span className="cmdk-trigger-icon" aria-hidden="true">⌕</span>
        <span className="cmdk-trigger-text">Search cases, evidence, SHA-256…</span>
        <span className="cmdk-trigger-kbd" aria-hidden="true">
          <kbd>{isMac ? "⌘" : "Ctrl"}</kbd>
          <kbd>K</kbd>
        </span>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="cmdk-overlay"
          onClick={closePalette}
          role="presentation"
          aria-hidden="true"
        >
          <div
            className="cmdk-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette — Global forensic evidence discovery"
          >
            {/* Input row */}
            <div className="cmdk-input-row">
              <span className="cmdk-input-icon" aria-hidden="true">⌕</span>
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyNav}
                placeholder="Search cases, evidence, SHA-256 hashes, audit logs…"
                className="cmdk-input"
                aria-autocomplete="list"
                aria-controls="cmdk-results"
                aria-activedescendant={
                  results[activeIndex] ? `cmdk-item-${activeIndex}` : undefined
                }
                autoComplete="off"
              />
              {loading && (
                <span
                  className="cmdk-spinner"
                  role="status"
                  aria-label="Searching…"
                />
              )}
              <kbd className="cmdk-esc" aria-hidden="true">Esc</kbd>
            </div>

            {/* Recent Searches Pills */}
            {!query && recentSearches.length > 0 && (
              <div
                style={{
                  padding: "8px 14px",
                  borderBottom: "1px solid var(--border-default)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "11.5px",
                  background: "var(--surface-sunken)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", overflowX: "auto" }}>
                  <span style={{ color: "var(--text-disabled)", textTransform: "uppercase", fontSize: "10px", fontFamily: "var(--font-mono)" }}>
                    RECENT:
                  </span>
                  {recentSearches.map((term) => (
                    <button
                      key={term}
                      onClick={() => setQuery(term)}
                      style={{
                        background: "var(--surface-raised)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "4px",
                        padding: "2px 6px",
                        color: "var(--brand-400)",
                        fontSize: "11px",
                        cursor: "pointer",
                      }}
                    >
                      {term}
                    </button>
                  ))}
                </div>
                <button
                  onClick={clearRecentSearches}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-disabled)",
                    fontSize: "11px",
                    cursor: "pointer",
                    padding: "2px 4px",
                  }}
                >
                  Clear
                </button>
              </div>
            )}

            {/* Results */}
            <div
              id="cmdk-results"
              className="cmdk-results"
              role="listbox"
              aria-label="Search results"
            >
              {results.length === 0 ? (
                <div className="cmdk-empty" role="status">
                  <p>No authorized results{query ? ` for "${query}"` : ""}</p>
                </div>
              ) : (
                results.map((r, i) => (
                  <button
                    key={`${r.type}-${r.id}-${i}`}
                    id={`cmdk-item-${i}`}
                    className={`cmdk-item${i === activeIndex ? " active" : ""}`}
                    onClick={() => handleSelect(r)}
                    onMouseEnter={() => setActiveIndex(i)}
                    role="option"
                    aria-selected={i === activeIndex}
                    tabIndex={-1}
                  >
                    <span className="cmdk-item-icon" aria-hidden="true">
                      {TYPE_ICONS[r.type] || "•"}
                    </span>
                    <div className="cmdk-item-content">
                      <span className="cmdk-item-title">{r.title}</span>
                      {r.subtitle && (
                        <span className="cmdk-item-subtitle">{r.subtitle}</span>
                      )}
                    </div>
                    <span className="cmdk-item-type">{TYPE_LABELS[r.type] || r.type}</span>
                  </button>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="cmdk-footer" aria-hidden="true" style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: "10px" }}>
                <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
                <span><kbd>Enter</kbd> Select</span>
                <span><kbd>Esc</kbd> Close</span>
              </div>
              {query.trim().length >= 2 && (
                <button
                  onClick={() => {
                    saveRecentSearch(query.trim());
                    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
                    closePalette();
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--brand-400)",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Full Search Page →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
