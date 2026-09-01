"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/auth-context";
import { globalSearch } from "@/lib/api";

type ResultType = "case" | "evidence" | "user" | "action";

interface SearchResult {
  id: string;
  type: ResultType;
  title: string;
  subtitle?: string;
  href: string;
}

const STATIC_ACTIONS: SearchResult[] = [
  { id: "new-case",       type: "action", title: "Create new case",        href: "/cases/new" },
  { id: "new-evidence",   type: "action", title: "Upload evidence",         href: "/evidence/new" },
  { id: "verify",         type: "action", title: "Verify evidence hash",    href: "/verify" },
  { id: "audit",          type: "action", title: "View audit logs",         href: "/audit" },
  { id: "reports",        type: "action", title: "Open reports",            href: "/reports" },
  { id: "notifications",  type: "action", title: "View notifications",      href: "/notifications" },
];

const TYPE_ICON: Record<ResultType, string> = {
  case:     "▣",
  evidence: "◈",
  user:     "○",
  action:   "⚡",
};

const TYPE_LABEL: Record<ResultType, string> = {
  case:     "Case",
  evidence: "Evidence",
  user:     "User",
  action:   "Action",
};

export default function CommandPalette() {
  const { user, accessToken } = useAuth();
  const router = useRouter();

  const [open, setOpen]               = useState(false);
  const [query, setQuery]             = useState("");
  const [results, setResults]         = useState<SearchResult[]>(STATIC_ACTIONS);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading]         = useState(false);
  const [isMac, setIsMac]             = useState(false);

  const inputRef    = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect Mac only on client (avoids hydration mismatch)
  useEffect(() => {
    setIsMac(navigator?.platform?.toUpperCase().includes("MAC") ?? false);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults(STATIC_ACTIONS);
    setActiveIndex(0);
  }, []);

  // Global keyboard shortcut
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isCmdK) { e.preventDefault(); setOpen((prev) => !prev); }
      if (e.key === "Escape" && open) closePalette();
    }
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [open, closePalette]);

  // Focus input when opened
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open || !accessToken) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length === 0) {
      setResults(STATIC_ACTIONS);
      setActiveIndex(0);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await globalSearch(accessToken, query.trim());

        const mapped: SearchResult[] = [
          ...(data.cases ?? []).map((c: { id: string; title: string; status: string }) => ({
            id: c.id, type: "case" as ResultType,
            title: c.title, subtitle: c.status,
            href: `/cases/${c.id}`,
          })),
          ...(data.evidence ?? []).map((e: { id: string; name: string; case?: { title: string } | null }) => ({
            id: e.id, type: "evidence" as ResultType,
            title: e.name, subtitle: e.case?.title,
            href: `/evidence/${e.id}`,
          })),
          ...(data.users ?? []).map((u: { id: string; name: string; email: string }) => ({
            id: u.id, type: "user" as ResultType,
            title: u.name, subtitle: u.email,
            href: `/admin/users?highlight=${u.id}`,
          })),
        ];

        const matchingActions = STATIC_ACTIONS.filter((a) =>
          a.title.toLowerCase().includes(query.trim().toLowerCase()),
        );

        setResults([...mapped, ...matchingActions]);
        setActiveIndex(0);
      } catch {
        // On error, fall back to matching static actions only
        setResults(
          STATIC_ACTIONS.filter((a) =>
            a.title.toLowerCase().includes(query.trim().toLowerCase()),
          ),
        );
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open, accessToken]);

  function handleSelect(result: SearchResult) {
    router.push(result.href);
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
      if (results[activeIndex]) handleSelect(results[activeIndex]);
    }
  }

  if (!user) return null;

  return (
    <>
      {/* Trigger button */}
      <button
        className="cmdk-trigger"
        onClick={() => setOpen(true)}
        aria-label="Open command palette (Ctrl+K)"
        suppressHydrationWarning
      >
        <span className="cmdk-trigger-icon" aria-hidden="true">⌕</span>
        <span className="cmdk-trigger-text">Search everything…</span>
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
            aria-label="Command palette — search cases, evidence, and actions"
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
                placeholder="Search cases, evidence, users, or run an action…"
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

            {/* Results */}
            <div
              id="cmdk-results"
              className="cmdk-results"
              role="listbox"
              aria-label="Search results"
            >
              {results.length === 0 ? (
                <div className="cmdk-empty" role="status">
                  <p>No results{query ? ` for "${query}"` : ""}</p>
                </div>
              ) : (
                results.map((r, i) => (
                  <button
                    key={`${r.type}-${r.id}`}
                    id={`cmdk-item-${i}`}
                    className={`cmdk-item${i === activeIndex ? " active" : ""}`}
                    onClick={() => handleSelect(r)}
                    onMouseEnter={() => setActiveIndex(i)}
                    role="option"
                    aria-selected={i === activeIndex}
                    tabIndex={-1}
                  >
                    <span className="cmdk-item-icon" aria-hidden="true">
                      {TYPE_ICON[r.type]}
                    </span>
                    <div className="cmdk-item-content">
                      <span className="cmdk-item-title">{r.title}</span>
                      {r.subtitle && (
                        <span className="cmdk-item-subtitle">{r.subtitle}</span>
                      )}
                    </div>
                    <span className="cmdk-item-type">{TYPE_LABEL[r.type]}</span>
                  </button>
                ))
              )}
            </div>

            {/* Footer hints */}
            <div className="cmdk-footer" aria-hidden="true">
              <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
              <span><kbd>Enter</kbd> Select</span>
              <span><kbd>Esc</kbd> Close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
