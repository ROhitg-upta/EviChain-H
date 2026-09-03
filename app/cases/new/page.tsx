"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "../../auth-context";
import { createCase } from "@/lib/api";
import WorkspaceShell from "@/app/components/ui/workspace-shell";

const STATUS_OPTIONS = ["Active", "Review", "Closed", "Archived"];
const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Critical"];

export default function NewCasePage() {
  const { user, loading: authLoading, accessToken, canEdit } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("Active");
  const [priority, setPriority] = useState("Medium");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;

    setSubmitting(true);
    setError("");

    try {
      const newCase = await createCase(accessToken, {
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
      });
      window.location.href = `/cases/${newCase.id}`;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create case");
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <WorkspaceShell breadcrumbs={[{ label: "Cases", href: "/cases" }, { label: "New Case" }]}>
        <div style={{ display: "grid", gap: 12 }}>
          <div className="skeleton" style={{ height: 200, borderRadius: "var(--radius-md)" }} />
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell breadcrumbs={[{ label: "Cases", href: "/cases" }, { label: "New Case" }]}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        paddingBottom: "var(--space-5)", marginBottom: "var(--space-6)",
        borderBottom: "1px solid var(--border-default)",
      }}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 6 }}>CASE REGISTER</p>
          <h1 style={{
            margin: 0, fontSize: "var(--text-xl)", fontWeight: 700,
            letterSpacing: "var(--tracking-tight)", color: "var(--text-primary)",
          }}>
            New case
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            Create an investigation case to group and track related evidence.
          </p>
        </div>
        <a className="btn btn-secondary btn-sm" href="/cases">Cancel</a>
      </div>

      {!canEdit && (
        <div style={{
          padding: "12px 16px", background: "var(--accent-pending-dim)",
          border: "1px solid var(--accent-pending-border)", borderRadius: "var(--radius-md)",
          color: "var(--accent-pending)", fontSize: "var(--text-sm)", marginBottom: "var(--space-5)",
        }} role="alert">
          Auditor mode — case creation is disabled.
        </div>
      )}

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 320px", gap: "var(--space-6)",
        alignItems: "start",
      }}>
        <form
          onSubmit={handleSubmit}
          aria-label="Create case form"
          noValidate
          style={{
            background: "var(--surface-raised)", border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)", padding: "var(--space-6)",
          }}
        >
          <h2 style={{
            margin: "0 0 var(--space-4)", fontSize: "var(--text-md)", fontWeight: 700,
            color: "var(--text-primary)",
          }}>
            Case details
          </h2>

          <div style={{ marginBottom: "var(--space-4)" }}>
            <label htmlFor="case-title" style={{
              display: "block", marginBottom: 6, fontSize: "var(--text-sm)",
              fontWeight: 600, color: "var(--text-primary)",
            }}>
              Case title <span style={{ color: "var(--brand-600)" }}>(required)</span>
            </label>
            <input
              id="case-title"
              type="text"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Unauthorised network access — August 2026"
              required
              aria-required="true"
              maxLength={200}
            />
          </div>

          <div style={{ marginBottom: "var(--space-4)" }}>
            <label htmlFor="case-description" style={{
              display: "block", marginBottom: 6, fontSize: "var(--text-sm)",
              fontWeight: 600, color: "var(--text-primary)",
            }}>
              Description
            </label>
            <textarea
              id="case-description"
              className="input textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of the incident or investigation…"
              rows={4}
              maxLength={2000}
            />
            <small style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--text-disabled)" }}>
              {description.length}/2000 characters
            </small>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)", marginBottom: "var(--space-5)" }}>
            <div>
              <label htmlFor="case-status" style={{
                display: "block", marginBottom: 6, fontSize: "var(--text-sm)",
                fontWeight: 600, color: "var(--text-primary)",
              }}>
                Initial status
              </label>
              <select
                id="case-status"
                className="input select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="case-priority" style={{
                display: "block", marginBottom: 6, fontSize: "var(--text-sm)",
                fontWeight: 600, color: "var(--text-primary)",
              }}>
                Priority
              </label>
              <select
                id="case-priority"
                className="input select"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div style={{
              padding: "12px 16px", background: "var(--accent-danger-dim)",
              border: "1px solid var(--accent-danger-border)", borderRadius: "var(--radius-md)",
              color: "var(--accent-danger)", fontSize: "var(--text-sm)", marginBottom: "var(--space-4)",
            }} role="alert" aria-live="assertive">
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: "var(--space-3)", paddingTop: "var(--space-2)" }}>
            <button
              className="btn btn-primary btn-md"
              type="submit"
              disabled={submitting || !canEdit || !title.trim()}
              aria-disabled={submitting || !canEdit || !title.trim()}
            >
              {submitting ? "Creating…" : "Create case"}
            </button>
            <a className="btn btn-secondary btn-md" href="/cases">Cancel</a>
          </div>
        </form>

        {/* Info sidebar */}
        <aside style={{
          background: "var(--surface-raised)", border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md)", padding: "var(--space-5)",
        }} aria-label="What happens next">
          <h2 style={{
            margin: "0 0 var(--space-4)", fontSize: "var(--text-sm)", fontWeight: 700,
            color: "var(--text-primary)", letterSpacing: "var(--tracking-tight)",
          }}>
            What happens next
          </h2>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            {[
              { num: "1", title: "Upload evidence", desc: "Attach digital evidence files. Each file is SHA-256 fingerprinted on the server." },
              { num: "2", title: "Hash verification", desc: "Verify file integrity by comparing against the tamper-proof registry." },
              { num: "3", title: "Custody tracking", desc: "Every access, transfer, and download is recorded in the chain of custody." },
              { num: "4", title: "Audit export", desc: "Export full audit ledgers for courtroom verification or compliance." },
            ].map(step => (
              <li key={step.num} style={{ display: "flex", gap: 12 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: "var(--accent-active-dim)", color: "var(--accent-active)",
                  fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 700,
                  display: "grid", placeItems: "center", flexShrink: 0, marginTop: 2,
                }} aria-hidden="true">{step.num}</span>
                <div>
                  <strong style={{ display: "block", fontSize: "var(--text-sm)", color: "var(--text-primary)", marginBottom: 2 }}>{step.title}</strong>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </WorkspaceShell>
  );
}
