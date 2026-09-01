"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../auth-context";
import { createCase } from "@/lib/api";

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

  useEffect(() => {
    if (!authLoading && !user) window.location.replace("/login");
  }, [authLoading, user]);

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
    return <main className="cases-shell"><p className="cases-loading">Loading…</p></main>;
  }

  return (
    <main className="cases-shell">
      <header className="ev-topbar">
        <a className="ev-brand" href="/">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span><strong>EviChain</strong><small>Case management</small></span>
        </a>
        <nav className="ev-nav">
          <a href="/cases">← Cases</a>
          <a href="/evidence">Evidence</a>
        </nav>
      </header>

      <div className="page-header">
        <div>
          <p className="eyebrow">CASE REGISTER</p>
          <h1>New case</h1>
          <p className="ev-page-sub">
            Create an investigation case to group and track related evidence.
          </p>
        </div>
        <a className="button button-secondary" href="/cases">Cancel</a>
      </div>

      {!canEdit && (
        <div className="readonly-banner" role="alert">
          Auditor mode — case creation is disabled.
        </div>
      )}

      <div className="case-form-layout">
        <form
          className="case-form"
          onSubmit={handleSubmit}
          aria-label="Create case form"
          noValidate
        >
          <div className="form-section">
            <h2>Case details</h2>

            <div className="form-group">
              <label htmlFor="case-title">
                Case title <span className="ev-field-required">(required)</span>
              </label>
              <input
                id="case-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Unauthorised network access — August 2026"
                required
                aria-required="true"
                maxLength={200}
              />
            </div>

            <div className="form-group">
              <label htmlFor="case-description">Description</label>
              <textarea
                id="case-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary of the incident or investigation…"
                rows={4}
                maxLength={2000}
              />
              <small className="ev-field-hint">
                {description.length}/2000 characters
              </small>
            </div>

            <div className="case-form-row">
              <div className="form-group">
                <label htmlFor="case-status">Initial status</label>
                <select
                  id="case-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="case-priority">Priority</label>
                <select
                  id="case-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {error && (
            <div className="error-message" role="alert" aria-live="assertive">
              {error}
            </div>
          )}

          <div className="case-form-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={submitting || !canEdit || !title.trim()}
              aria-disabled={submitting || !canEdit || !title.trim()}
            >
              {submitting
                ? <span className="loading-spinner">Creating…</span>
                : "Create case"}
            </button>
            <a className="button button-secondary" href="/cases">Cancel</a>
          </div>
        </form>

        {/* Info sidebar */}
        <aside className="info-section" aria-label="What happens next">
          <h2>What happens next</h2>
          <ol className="info-steps">
            <li>
              <span className="info-step-num" aria-hidden="true">1</span>
              <div>
                <strong>Upload evidence</strong>
                <p>
                  Attach digital evidence files to this case. Each file is
                  SHA-256 fingerprinted on the server when uploaded.
                </p>
              </div>
            </li>
            <li>
              <span className="info-step-num" aria-hidden="true">2</span>
              <div>
                <strong>Hash verification</strong>
                <p>
                  Any party can verify a file has not been tampered with by
                  comparing its fingerprint against the registry.
                </p>
              </div>
            </li>
            <li>
              <span className="info-step-num" aria-hidden="true">3</span>
              <div>
                <strong>Custody tracking</strong>
                <p>
                  Every access, transfer, and download is recorded in an
                  immutable chain-of-custody log.
                </p>
              </div>
            </li>
            <li>
              <span className="info-step-num" aria-hidden="true">4</span>
              <div>
                <strong>Audit export</strong>
                <p>
                  The full audit ledger can be exported as JSON for court
                  submissions or compliance review.
                </p>
              </div>
            </li>
          </ol>
        </aside>
      </div>
    </main>
  );
}
