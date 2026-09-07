"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "../../../auth-context";
import { useNotifications } from "../../../notification-context";
import {
  getEvidenceById, getEvidenceAnnotations, saveEvidenceAnnotations, downloadEvidence,
  type EvidenceAnnotation, type EvidenceRecord,
} from "@/lib/api";
import WorkspaceShell from "@/app/components/ui/workspace-shell";

type ToolType = "select" | "point" | "region" | "arrow" | "highlight" | "text" | "freehand";

const COLORS = ["#22d3ee", "#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7"];

export default function EvidenceAnnotatePage() {
  const routeParams = useParams();
  const id = typeof routeParams?.id === "string" ? routeParams.id : Array.isArray(routeParams?.id) ? routeParams.id[0] : "";
  const { user, loading: authLoading, accessToken } = useAuth();
  const { toast } = useNotifications();

  const isAuditor = user?.role === "Auditor";

  const [evidence,    setEvidence]    = useState<EvidenceRecord | null>(null);
  const [annotations, setAnnotations] = useState<EvidenceAnnotation[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [activeTool,  setActiveTool]  = useState<ToolType>("select");
  const [color,       setColor]       = useState(COLORS[0]);
  const [showAnns,    setShowAnns]    = useState(true);
  const [isDrawing,   setIsDrawing]   = useState(false);
  const [curPoints,   setCurPoints]   = useState<{ x: number; y: number }[]>([]);
  const [textPos,     setTextPos]     = useState<{ x: number; y: number } | null>(null);
  const [textVal,     setTextVal]     = useState("");
  const [saving,      setSaving]      = useState(false);
  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);

  // Document page note state
  const [docPageNumber, setDocPageNumber] = useState(1);
  const [docPageNote, setDocPageNote] = useState("");

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef       = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!accessToken || !id) return;
    setLoading(true);
    Promise.all([
      getEvidenceById(accessToken, id),
      getEvidenceAnnotations(accessToken, id),
    ])
      .then(async ([ev, anns]) => {
        setEvidence(ev);
        setAnnotations(anns);
        if (ev.mimeType?.startsWith("image/")) {
          try {
            const { blob } = await downloadEvidence(accessToken, id);
            setImageBlobUrl(URL.createObjectURL(blob));
          } catch {
            // fallback
          }
        }
      })
      .catch(() => toast({ type: "error", title: "Failed to load evidence" }))
      .finally(() => setLoading(false));
  }, [accessToken, id]);

  // Redraw canvas whenever image/annotations/visibility changes
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width  = containerRef.current?.clientWidth  || 800;
    canvas.height = img.naturalHeight
      ? Math.round((canvas.width / img.naturalWidth) * img.naturalHeight)
      : 500;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background image
    try {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } catch {
      // tainted or not ready
    }

    if (!showAnns) return;

    // Draw saved annotations
    annotations.forEach((ann) => {
      const pts = ann.points || (Array.isArray(ann.coordinates) ? ann.coordinates : []);
      const annColor = ann.color || "#22d3ee";
      ctx.strokeStyle = annColor;
      ctx.fillStyle   = annColor;
      ctx.lineWidth   = 2;

      const typeUpper = (ann.type || "").toUpperCase();

      if ((typeUpper === "POINT" || ann.type === "point") && pts[0]) {
        const x = pts[0].x * canvas.width;
        const y = pts[0].y * canvas.height;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        const label = ann.note || ann.text;
        if (label) {
          ctx.font = "bold 12px var(--font-sans, Inter)";
          ctx.fillStyle = "#ffffff";
          ctx.fillText(label, x + 12, y + 4);
        }
      } else if ((typeUpper === "REGION" || ann.type === "region" || ann.type === "highlight") && pts.length >= 2) {
        const [p1, p2] = pts;
        const x1 = Math.min(p1.x, p2.x) * canvas.width;
        const y1 = Math.min(p1.y, p2.y) * canvas.height;
        const w  = Math.abs(p2.x - p1.x) * canvas.width;
        const h  = Math.abs(p2.y - p1.y) * canvas.height;
        ctx.fillStyle = annColor + "40"; // 25% opacity
        ctx.fillRect(x1, y1, w, h);
        ctx.strokeRect(x1, y1, w, h);

        const label = ann.note || ann.text;
        if (label) {
          ctx.font = "bold 12px var(--font-sans, Inter)";
          ctx.fillStyle = "#ffffff";
          ctx.fillText(label, x1 + 6, y1 + 16);
        }
      } else if (ann.type === "freehand" && pts.length > 1) {
        ctx.beginPath();
        pts.forEach((pt, i) => {
          const x = pt.x * canvas.width;
          const y = pt.y * canvas.height;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      } else if (ann.type === "arrow" && pts.length >= 2) {
        const [p1, p2] = pts;
        const x1 = p1.x * canvas.width,  y1 = p1.y * canvas.height;
        const x2 = p2.x * canvas.width,  y2 = p2.y * canvas.height;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        // Arrowhead
        const angle = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 12 * Math.cos(angle - Math.PI / 6), y2 - 12 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - 12 * Math.cos(angle + Math.PI / 6), y2 - 12 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      } else if (ann.type === "text" && pts[0] && (ann.text || ann.note)) {
        ctx.font = "bold 14px var(--font-sans, Inter)";
        ctx.fillText(ann.text || ann.note || "", pts[0].x * canvas.width, pts[0].y * canvas.height);
      }
    });

    // Draw current in-progress stroke
    if (isDrawing && curPoints.length > 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2;
      if (activeTool === "point") {
        const pt = curPoints[0];
        ctx.beginPath();
        ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 8, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      } else if (activeTool === "region" || activeTool === "highlight") {
        if (curPoints.length >= 2) {
          const [p1, p2] = curPoints;
          const x1 = Math.min(p1.x, p2.x) * canvas.width;
          const y1 = Math.min(p1.y, p2.y) * canvas.height;
          const w  = Math.abs(p2.x - p1.x) * canvas.width;
          const h  = Math.abs(p2.y - p1.y) * canvas.height;
          ctx.fillStyle = color + "40";
          ctx.fillRect(x1, y1, w, h);
          ctx.strokeRect(x1, y1, w, h);
        }
      } else if (curPoints.length > 1) {
        ctx.beginPath();
        curPoints.forEach((pt, i) => {
          const x = pt.x * canvas.width;
          const y = pt.y * canvas.height;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    }
  }, [annotations, showAnns, isDrawing, curPoints, color, activeTool]);

  useEffect(() => { redraw(); }, [redraw]);

  // Window resize re-draw
  useEffect(() => {
    window.addEventListener("resize", redraw);
    return () => window.removeEventListener("resize", redraw);
  }, [redraw]);

  function getCanvasCoords(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) / canvas.width;
    const rawY = (e.clientY - rect.top)  / canvas.height;
    return {
      x: Math.max(0, Math.min(1, rawX)),
      y: Math.max(0, Math.min(1, rawY)),
    };
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (activeTool === "select" || isAuditor) return;
    const pt = getCanvasCoords(e);

    if (activeTool === "point") {
      setTextPos(pt);
      setTextVal("");
      return;
    }

    if (activeTool === "text") {
      setTextPos(pt);
      setTextVal("");
      return;
    }

    setIsDrawing(true);
    setCurPoints([pt]);
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing || isAuditor) return;
    const pt = getCanvasCoords(e);
    if (activeTool === "freehand") {
      setCurPoints((prev) => [...prev, pt]);
    } else {
      // arrow, region, highlight: keep start point, update end point
      setCurPoints((prev) => [prev[0], pt]);
    }
  }

  function onMouseUp() {
    if (!isDrawing || isAuditor) return;
    setIsDrawing(false);
    if (curPoints.length >= 2) {
      if (activeTool === "region") {
        setTextPos(curPoints[1]);
        setTextVal("");
        return;
      }
      setAnnotations((prev) => [...prev, {
        id:        `tmp_${Date.now()}`,
        type:      activeTool,
        points:    curPoints,
        color,
        createdAt: new Date().toISOString(),
        user:      { name: user?.name ?? "You" },
      }]);
      setCurPoints([]);
    }
  }

  function onTextSubmit(e: FormEvent) {
    e.preventDefault();
    if (!textPos || isAuditor) return;
    setAnnotations((prev) => [...prev, {
      id:        `tmp_${Date.now()}`,
      type:      activeTool === "region" ? "REGION" : activeTool === "point" ? "POINT" : "text",
      points:    activeTool === "region" && curPoints.length >= 2 ? curPoints : [textPos],
      text:      textVal.trim() || undefined,
      note:      textVal.trim() || undefined,
      color,
      createdAt: new Date().toISOString(),
      user:      { name: user?.name ?? "You" },
    }]);
    setTextPos(null);
    setTextVal("");
    setCurPoints([]);
  }

  async function handleAddDocPageNote(e: FormEvent) {
    e.preventDefault();
    if (!docPageNote.trim() || isAuditor) return;
    setAnnotations((prev) => [
      ...prev,
      {
        id: `tmp_${Date.now()}`,
        type: "PAGE_NOTE",
        pageNumber: docPageNumber,
        note: docPageNote.trim(),
        text: docPageNote.trim(),
        color,
        createdAt: new Date().toISOString(),
        user: { name: user?.name ?? "You" },
      },
    ]);
    setDocPageNote("");
    toast({ type: "success", title: "Page note queued" });
  }

  function handleDeleteAnnotation(annId: string) {
    if (isAuditor) return;
    setAnnotations((prev) => prev.filter((a) => a.id !== annId));
  }

  async function handleSave() {
    if (!accessToken || isAuditor) return;
    setSaving(true);
    try {
      await saveEvidenceAnnotations(
        accessToken,
        id,
        annotations.map((a) => ({
          type: a.type,
          points: a.points || (Array.isArray(a.coordinates) ? a.coordinates : undefined),
          coordinates: a.coordinates || a.points,
          pageNumber: a.pageNumber ?? undefined,
          text: a.text ?? a.note ?? undefined,
          note: a.note ?? a.text ?? undefined,
          color: a.color || color,
        })),
      );
      toast({ type: "success", title: "Annotations saved" });
    } catch (err: unknown) {
      toast({ type: "error", title: err instanceof Error ? err.message : "Failed to save" });
    } finally { setSaving(false); }
  }

  function handleDownload() {
    if (!canvasRef.current) return;
    const a = document.createElement("a");
    a.download = `${evidence?.name ?? "evidence"}-annotated.png`;
    a.href = canvasRef.current.toDataURL("image/png");
    a.click();
  }

  if (authLoading || loading) {
    return (
      <WorkspaceShell breadcrumbs={[{ label: "Evidence", href: "/evidence" }, { label: "Annotate" }]}>
        <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>Loading…</div>
      </WorkspaceShell>
    );
  }

  if (!evidence) {
    return (
      <WorkspaceShell breadcrumbs={[{ label: "Evidence", href: "/evidence" }, { label: "Annotate" }]}>
        <div style={{ padding: "40px", color: "var(--accent-danger)" }}>Evidence not found.</div>
      </WorkspaceShell>
    );
  }

  const isImage = evidence.mimeType?.startsWith("image/");

  return (
    <WorkspaceShell breadcrumbs={[{ label: "Evidence", href: "/evidence" }, { label: evidence.name, href: `/evidence/${id}` }, { label: "Annotate" }]}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-6)", borderBottom: "1px solid var(--border-default)", paddingBottom: "var(--space-4)" }}>
        <div>
          <p className="eyebrow" style={{ color: "var(--text-disabled)", marginBottom: "4px" }}>EVIDENCE ANNOTATION</p>
          <h1 style={{ margin: 0, fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--text-primary)" }}>{evidence.name}</h1>
        </div>
        <a href={`/evidence/${id}`} className="btn btn-secondary btn-sm">← Back to record</a>
      </div>

      <div className="annotation-layout">
        {/* Toolbar */}
        <aside className="annotation-toolbar" style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: "var(--space-4)" }}>
          <h3 style={{ color: "var(--text-primary)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)", marginBottom: "var(--space-4)" }}>Tools</h3>

          {isAuditor && (
            <div style={{ padding: "8px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", color: "var(--text-secondary)", fontSize: 11, marginBottom: 12 }}>
              🔒 Auditor View-Only
            </div>
          )}

          <div className="tool-group" style={{ marginBottom: "var(--space-4)" }}>
            {([
              { id: "select", label: "Select (↖)" },
              { id: "point", label: "Point (📍)" },
              { id: "region", label: "Region (⬚)" },
              { id: "arrow", label: "Arrow (→)" },
              { id: "highlight", label: "Highlight (▬)" },
              { id: "text", label: "Text (T)" },
              { id: "freehand", label: "Pen (✏)" },
            ] as { id: ToolType; label: string }[]).map((t) => (
              <button
                key={t.id}
                className={`tool-btn${activeTool === t.id ? " active" : ""}`}
                disabled={isAuditor}
                style={{
                  background: activeTool === t.id ? "var(--brand-600)" : "var(--surface-sunken)",
                  color: activeTool === t.id ? "var(--neutral-50)" : "var(--text-secondary)",
                  borderColor: "var(--border-default)",
                  fontSize: 11,
                  padding: "4px 8px",
                  margin: 2,
                }}
                onClick={() => setActiveTool(t.id)}
                aria-label={t.label}
                aria-pressed={activeTool === t.id}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="tool-group" style={{ marginBottom: "var(--space-4)" }}>
            <label style={{ color: "var(--text-disabled)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", letterSpacing: "var(--tracking-wider)", textTransform: "uppercase", display: "block", marginBottom: "var(--space-2)" }}>Color</label>
            <div className="color-picker" style={{ display: "flex", gap: 6 }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  disabled={isAuditor}
                  className={`color-swatch${color === c ? " active" : ""}`}
                  style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: color === c ? "2px solid #ffffff" : "1px solid transparent", cursor: "pointer" }}
                  onClick={() => setColor(c)}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          <div className="tool-group" style={{ marginBottom: "var(--space-4)" }}>
            <label className="toggle-label" style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
              <input type="checkbox" checked={showAnns} onChange={(e) => setShowAnns(e.target.checked)} style={{ accentColor: "var(--brand-600)" }} />
              <span>Show annotations</span>
            </label>
          </div>

          {!isAuditor && (
            <div className="tool-actions" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <button className="btn btn-primary btn-full" onClick={handleSave} disabled={saving}>
                {saving ? <span className="loading-spinner">Saving…</span> : "Save Annotations"}
              </button>
              <button className="btn btn-secondary btn-full" onClick={() => { if (confirm("Clear all annotations?")) setAnnotations([]); }}>
                Clear All
              </button>
              <button className="btn btn-secondary btn-full" onClick={handleDownload}>
                Download Overlay PNG
              </button>
            </div>
          )}
        </aside>

        {/* Canvas / Document Interface */}
        <section className="annotation-canvas-container" ref={containerRef} style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", overflow: "hidden", minHeight: 400 }}>
          {isImage ? (
            <>
              {/* Hidden img to load the evidence file */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {imageBlobUrl && (
                <img
                  alt=""
                  aria-hidden="true"
                  style={{ display: "none" }}
                  src={imageBlobUrl}
                  ref={(el) => {
                    if (!el) return;
                    imgRef.current = el;
                    if (el.complete) redraw();
                    else el.onload = redraw;
                  }}
                />
              )}
              <canvas
                ref={canvasRef}
                className="annotation-canvas"
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                aria-label="Evidence annotation canvas"
                style={{ width: "100%", display: "block", cursor: isAuditor ? "default" : activeTool === "select" ? "default" : "crosshair" }}
              />
              {textPos && (
                <form onSubmit={onTextSubmit} className="text-input-overlay" style={{ position: "absolute", left: `${textPos.x * 100}%`, top: `${textPos.y * 100}%`, zIndex: 10 }}>
                  <input
                    type="text"
                    value={textVal}
                    onChange={(e) => setTextVal(e.target.value)}
                    placeholder="Enter annotation label/note…"
                    autoFocus
                    style={{ background: "var(--surface-sunken)", color: "var(--text-primary)", border: "1px solid var(--brand-600)", padding: "6px 10px", borderRadius: "4px", fontSize: 12, boxShadow: "var(--shadow-surface)" }}
                  />
                </form>
              )}
            </>
          ) : (
            <div className="non-image-notice" style={{ padding: "32px 24px" }}>
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div className="notice-icon" aria-hidden="true" style={{ fontSize: "32px", color: "var(--text-disabled)", marginBottom: "8px" }}>📄</div>
                <h3 style={{ color: "var(--text-primary)", fontSize: "var(--text-md)", margin: 0 }}>Document Annotation Interface</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-xs)", margin: "4px 0 0" }}>
                  Attach non-destructive page-scoped forensic notes for {evidence.mimeType} records without altering the original binary.
                </p>
              </div>

              {!isAuditor && (
                <form onSubmit={handleAddDocPageNote} style={{ maxWidth: 460, margin: "0 auto", background: "var(--surface-sunken)", padding: 16, borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)" }}>
                  <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 100 }}>
                      <label className="eyebrow" style={{ fontSize: 9, display: "block", marginBottom: 4 }}>PAGE #</label>
                      <input
                        type="number"
                        min={1}
                        className="input"
                        value={docPageNumber}
                        onChange={(e) => setDocPageNumber(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="eyebrow" style={{ fontSize: 9, display: "block", marginBottom: 4 }}>NOTE / FINDINGS</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="e.g. Discrepancy on signature block"
                        value={docPageNote}
                        onChange={(e) => setDocPageNote(e.target.value)}
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={!docPageNote.trim()}>
                    + Add Page Note
                  </button>
                </form>
              )}
            </div>
          )}
        </section>

        {/* Annotation list */}
        <aside className="annotation-list" style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: "var(--space-4)" }}>
          <h3 style={{ color: "var(--text-primary)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)", marginBottom: "var(--space-4)" }}>
            Annotations ({annotations.length})
          </h3>
          {annotations.length === 0 ? (
            <p style={{ color: "var(--text-disabled)", fontSize: "var(--text-sm)" }}>No annotations yet.</p>
          ) : (
            <div className="annotation-items" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {annotations.map((ann) => (
                <div key={ann.id} className="annotation-item-card" style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
                  <div className="annotation-item-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        padding: "1px 6px",
                        borderRadius: 3,
                        color: ann.color || "#22d3ee",
                        background: "rgba(255,255,255,0.05)",
                        border: `1px solid ${ann.color || "#22d3ee"}`,
                      }}
                    >
                      {ann.type} {ann.pageNumber ? `(p. ${ann.pageNumber})` : ""}
                    </span>
                    {!isAuditor && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAnnotation(ann.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-danger)", padding: 2, fontSize: 12 }}
                        title="Delete annotation"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "var(--text-disabled)", margin: "2px 0 4px" }}>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{ann.user?.name || "Investigator"}</span>
                    <time>
                      {new Intl.DateTimeFormat("en-IN", { dateStyle: "short", timeStyle: "short" }).format(new Date(ann.createdAt))}
                    </time>
                  </div>
                  {(ann.note || ann.text) && (
                    <p className="annotation-text" style={{ color: "var(--text-secondary)", fontSize: "var(--text-xs)", margin: "4px 0 0", wordBreak: "break-word" }}>
                      {ann.note || ann.text}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </WorkspaceShell>
  );
}
