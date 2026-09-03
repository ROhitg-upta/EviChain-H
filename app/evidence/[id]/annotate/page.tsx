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

type ToolType = "select" | "arrow" | "highlight" | "text" | "freehand";

const COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7", "#06b6d4"];

export default function EvidenceAnnotatePage() {
  const routeParams = useParams();
  const id = typeof routeParams?.id === "string" ? routeParams.id : Array.isArray(routeParams?.id) ? routeParams.id[0] : "";
  const { user, loading: authLoading, accessToken } = useAuth();
  const { toast } = useNotifications();

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
      ctx.strokeStyle = ann.color;
      ctx.fillStyle   = ann.color;
      ctx.lineWidth   = 2;

      if (ann.type === "freehand" && ann.points.length > 1) {
        ctx.beginPath();
        ann.points.forEach((pt, i) => {
          const x = pt.x * canvas.width;
          const y = pt.y * canvas.height;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      } else if (ann.type === "arrow" && ann.points.length >= 2) {
        const [p1, p2] = ann.points;
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
      } else if (ann.type === "highlight" && ann.points.length >= 2) {
        const [p1, p2] = ann.points;
        const x1 = Math.min(p1.x, p2.x) * canvas.width;
        const y1 = Math.min(p1.y, p2.y) * canvas.height;
        const w  = Math.abs(p2.x - p1.x) * canvas.width;
        const h  = Math.abs(p2.y - p1.y) * canvas.height;
        ctx.fillStyle = ann.color + "44"; // 25% opacity
        ctx.fillRect(x1, y1, w, h);
        ctx.strokeRect(x1, y1, w, h);
      } else if (ann.type === "text" && ann.points[0] && ann.text) {
        ctx.font = "bold 14px var(--font-sans, Inter)";
        ctx.fillText(ann.text, ann.points[0].x * canvas.width, ann.points[0].y * canvas.height);
      }
    });

    // Draw current in-progress stroke
    if (isDrawing && curPoints.length > 1) {
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      curPoints.forEach((pt, i) => {
        const x = pt.x * canvas.width;
        const y = pt.y * canvas.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }, [annotations, showAnns, isDrawing, curPoints, color]);

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
    return {
      x: (e.clientX - rect.left) / canvas.width,
      y: (e.clientY - rect.top)  / canvas.height,
    };
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (activeTool === "select") return;
    const pt = getCanvasCoords(e);

    if (activeTool === "text") {
      setTextPos(pt);
      setTextVal("");
      return;
    }

    setIsDrawing(true);
    setCurPoints([pt]);
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const pt = getCanvasCoords(e);
    if (activeTool === "freehand") {
      setCurPoints((prev) => [...prev, pt]);
    } else {
      // arrow or highlight: keep start point, update end point
      setCurPoints((prev) => [prev[0], pt]);
    }
  }

  function onMouseUp() {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (curPoints.length >= 2) {
      setAnnotations((prev) => [...prev, {
        id:        `tmp_${Date.now()}`,
        type:      activeTool as "arrow" | "highlight" | "freehand",
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
    if (!textVal.trim() || !textPos) return;
    setAnnotations((prev) => [...prev, {
      id:        `tmp_${Date.now()}`,
      type:      "text",
      points:    [textPos],
      text:      textVal,
      color,
      createdAt: new Date().toISOString(),
      user:      { name: user?.name ?? "You" },
    }]);
    setTextPos(null);
    setTextVal("");
  }

  async function handleSave() {
    if (!accessToken) return;
    setSaving(true);
    try {
      await saveEvidenceAnnotations(
        accessToken,
        id,
        annotations.map((a) => ({ ...a, text: a.text ?? undefined })),
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
        <aside className="annotation-toolbar" style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)" }}>
          <h3 style={{ color: "var(--text-primary)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)", marginBottom: "var(--space-4)" }}>Tools</h3>

          <div className="tool-group">
            {(["select","freehand","arrow","highlight","text"] as ToolType[]).map((t) => (
              <button
                key={t}
                className={`tool-btn${activeTool === t ? " active" : ""}`}
                style={{ background: activeTool === t ? "var(--brand-600)" : "var(--surface-sunken)", color: activeTool === t ? "var(--neutral-50)" : "var(--text-secondary)", borderColor: "var(--border-default)" }}
                onClick={() => setActiveTool(t)}
                aria-label={t}
                aria-pressed={activeTool === t}
              >
                {t === "select" ? "↖" : t === "freehand" ? "✏" : t === "arrow" ? "→" : t === "highlight" ? "▬" : "T"}
              </button>
            ))}
          </div>

          <div className="tool-group">
            <label style={{ color: "var(--text-disabled)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", letterSpacing: "var(--tracking-wider)", textTransform: "uppercase", display: "block", marginBottom: "var(--space-2)" }}>Color</label>
            <div className="color-picker">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`color-swatch${color === c ? " active" : ""}`}
                  style={{ background: c, borderColor: color === c ? "var(--text-primary)" : "transparent" }}
                  onClick={() => setColor(c)}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          <div className="tool-group">
            <label className="toggle-label" style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
              <input type="checkbox" checked={showAnns} onChange={(e) => setShowAnns(e.target.checked)} style={{ accentColor: "var(--brand-600)" }} />
              <span>Show annotations</span>
            </label>
          </div>

          <div className="tool-actions" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <button className="btn btn-primary btn-full" onClick={handleSave} disabled={saving}>
              {saving ? <span className="loading-spinner">Saving…</span> : "Save"}
            </button>
            <button className="btn btn-secondary btn-full" onClick={() => { if (confirm("Clear all annotations?")) setAnnotations([]); }}>
              Clear all
            </button>
            <button className="btn btn-secondary btn-full" onClick={handleDownload}>
              Download PNG
            </button>
          </div>
        </aside>

        {/* Canvas */}
        <section className="annotation-canvas-container" ref={containerRef} style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)" }}>
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
              />
              {textPos && (
                <form onSubmit={onTextSubmit} className="text-input-overlay">
                  <input
                    type="text"
                    value={textVal}
                    onChange={(e) => setTextVal(e.target.value)}
                    placeholder="Enter text…"
                    autoFocus
                    style={{ position: "absolute", left: `${textPos.x * 100}%`, top: `${textPos.y * 100}%`, background: "var(--surface-sunken)", color: "var(--text-primary)", border: "1px solid var(--brand-600)", padding: "4px 8px", borderRadius: "4px" }}
                  />
                </form>
              )}
            </>
          ) : (
            <div className="non-image-notice" style={{ padding: "40px", textAlign: "center" }}>
              <div className="notice-icon" aria-hidden="true" style={{ fontSize: "32px", color: "var(--text-disabled)", marginBottom: "12px" }}>◈</div>
              <h3 style={{ color: "var(--text-primary)", fontSize: "var(--text-md)" }}>Preview unavailable</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", marginBottom: "16px" }}>{evidence.mimeType} files cannot be previewed inline.</p>
              <a className="btn btn-primary" href={`/evidence/${id}`}>
                Back to record
              </a>
            </div>
          )}
        </section>

        {/* Annotation list */}
        <aside className="annotation-list" style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)" }}>
          <h3 style={{ color: "var(--text-primary)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)", marginBottom: "var(--space-4)" }}>Annotations ({annotations.length})</h3>
          {annotations.length === 0 ? (
            <p style={{ color: "var(--text-disabled)", fontSize: "var(--text-sm)" }}>No annotations yet.</p>
          ) : (
            <div className="annotation-items" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {annotations.map((ann) => (
                <div key={ann.id} className="annotation-item-card" style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
                  <div className="annotation-item-header" style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span className={`annotation-type-badge type-${ann.type}`}>{ann.type}</span>
                    <span className="annotation-user" style={{ color: "var(--text-primary)", fontSize: "var(--text-xs)", fontWeight: 600 }}>{ann.user.name}</span>
                  </div>
                  <p className="annotation-time" style={{ color: "var(--text-disabled)", fontSize: "11px", margin: "2px 0 4px" }}>
                    {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" })
                      .format(new Date(ann.createdAt))}
                  </p>
                  {ann.text && <p className="annotation-text" style={{ color: "var(--text-secondary)", fontSize: "var(--text-xs)", margin: 0 }}>{ann.text}</p>}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </WorkspaceShell>
  );
}
