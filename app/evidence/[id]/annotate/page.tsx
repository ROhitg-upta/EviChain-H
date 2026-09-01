"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../auth-context";
import { useNotifications } from "../../../notification-context";
import {
  getEvidenceById, getEvidenceAnnotations, saveEvidenceAnnotations,
  type EvidenceAnnotation, type EvidenceRecord,
} from "@/lib/api";

type ToolType = "select" | "arrow" | "highlight" | "text" | "freehand";

const COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7", "#06b6d4"];

export default function EvidenceAnnotatePage({ params }: { params: { id: string } }) {
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

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef       = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!authLoading && !user) window.location.replace("/login");
  }, [authLoading, user]);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    Promise.all([
      getEvidenceById(accessToken, params.id),
      getEvidenceAnnotations(accessToken, params.id),
    ])
      .then(([ev, anns]) => { setEvidence(ev); setAnnotations(anns); })
      .catch(() => toast({ type: "error", title: "Failed to load evidence" }))
      .finally(() => setLoading(false));
  }, [accessToken, params.id]);

  // Redraw canvas whenever image/annotations/visibility changes
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width  = containerRef.current?.clientWidth  || 800;
    canvas.height = img.naturalHeight
      ? (img.naturalHeight / img.naturalWidth) * canvas.width
      : 500;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (!showAnns) return;

    for (const ann of annotations) {
      const W = canvas.width, H = canvas.height;
      ctx.strokeStyle = ann.color;
      ctx.fillStyle   = ann.color;
      ctx.lineWidth   = 3;
      ctx.lineCap = ctx.lineJoin = "round";

      if ((ann.type === "freehand" || ann.type === "arrow") && ann.points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(ann.points[0].x * W, ann.points[0].y * H);
        ann.points.slice(1).forEach((p) => ctx.lineTo(p.x * W, p.y * H));

        if (ann.type === "arrow") {
          const last = ann.points[ann.points.length - 1];
          const prev = ann.points[ann.points.length - 2];
          const angle = Math.atan2((last.y - prev.y) * H, (last.x - prev.x) * W);
          const L = 15;
          ctx.lineTo(last.x * W - L * Math.cos(angle - Math.PI / 6), last.y * H - L * Math.sin(angle - Math.PI / 6));
          ctx.moveTo(last.x * W, last.y * H);
          ctx.lineTo(last.x * W - L * Math.cos(angle + Math.PI / 6), last.y * H - L * Math.sin(angle + Math.PI / 6));
        }
        ctx.stroke();

      } else if (ann.type === "highlight" && ann.points.length >= 2) {
        const xs = ann.points.map((p) => p.x * W);
        const ys = ann.points.map((p) => p.y * H);
        ctx.globalAlpha = 0.3;
        ctx.fillRect(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        ctx.globalAlpha = 1;

      } else if (ann.type === "text" && ann.text) {
        ctx.font = "14px Inter, sans-serif";
        ctx.fillText(ann.text, ann.points[0].x * W, ann.points[0].y * H);
      }
    }
  }, [annotations, showAnns]);

  useEffect(() => { redraw(); }, [redraw]);

  function coords(e: React.MouseEvent<HTMLCanvasElement>) {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top)  / r.height)),
    };
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (activeTool === "select") return;
    const c = coords(e);
    setIsDrawing(true);
    if (activeTool === "text") { setTextPos(c); setTextVal(""); }
    else setCurPoints([c]);
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing || activeTool === "select" || activeTool === "text") return;
    setCurPoints((p) => [...p, coords(e)]);
  }

  function onMouseUp() {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (activeTool !== "text" && curPoints.length > 0) {
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
        params.id,
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

  if (authLoading || loading) return <main className="evidence-shell"><p className="cases-loading">Loading…</p></main>;
  if (!evidence) return <main className="evidence-shell"><p className="error-message">Evidence not found.</p></main>;

  const isImage = evidence.mimeType?.startsWith("image/");

  return (
    <main className="evidence-shell">
      <header className="ev-topbar">
        <a className="ev-brand" href="/">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span><strong>EviChain</strong><small>Annotate evidence</small></span>
        </a>
        <nav className="ev-nav">
          <a href={`/evidence/${params.id}`}>← Back to record</a>
          {user && <span className="operator" aria-label={user.name}>{user.initials}</span>}
        </nav>
      </header>

      <div className="page-header">
        <div>
          <p className="eyebrow">EVIDENCE ANNOTATION</p>
          <h1>{evidence.name}</h1>
        </div>
      </div>

      <div className="annotation-layout">
        {/* Toolbar */}
        <aside className="annotation-toolbar">
          <h3>Tools</h3>

          <div className="tool-group">
            {(["select","freehand","arrow","highlight","text"] as ToolType[]).map((t) => (
              <button
                key={t}
                className={`tool-btn${activeTool === t ? " active" : ""}`}
                onClick={() => setActiveTool(t)}
                aria-label={t}
                aria-pressed={activeTool === t}
              >
                {t === "select" ? "↖" : t === "freehand" ? "✏" : t === "arrow" ? "→" : t === "highlight" ? "▬" : "T"}
              </button>
            ))}
          </div>

          <div className="tool-group">
            <label>Color</label>
            <div className="color-picker">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`color-swatch${color === c ? " active" : ""}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          <div className="tool-group">
            <label className="toggle-label">
              <input type="checkbox" checked={showAnns} onChange={(e) => setShowAnns(e.target.checked)} />
              <span>Show annotations</span>
            </label>
          </div>

          <div className="tool-actions">
            <button className="button button-primary button-full" onClick={handleSave} disabled={saving}>
              {saving ? <span className="loading-spinner">Saving…</span> : "Save"}
            </button>
            <button className="button button-secondary button-full" onClick={() => { if (confirm("Clear all annotations?")) setAnnotations([]); }}>
              Clear all
            </button>
            <button className="button button-secondary button-full" onClick={handleDownload}>
              Download PNG
            </button>
          </div>
        </aside>

        {/* Canvas */}
        <section className="annotation-canvas-container" ref={containerRef}>
          {isImage ? (
            <>
              {/* Hidden img to load the evidence file */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt=""
                aria-hidden="true"
                style={{ display: "none" }}
                src={`/api/evidence/${params.id}/file`}
                ref={(el) => {
                  if (!el) return;
                  imgRef.current = el;
                  if (el.complete) redraw();
                  else el.onload = redraw;
                }}
              />
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
                    style={{ position: "absolute", left: `${textPos.x * 100}%`, top: `${textPos.y * 100}%` }}
                  />
                </form>
              )}
            </>
          ) : (
            <div className="non-image-notice">
              <div className="notice-icon" aria-hidden="true">◈</div>
              <h3>Preview unavailable</h3>
              <p>{evidence.mimeType} files cannot be previewed inline.</p>
              <a className="button button-primary" href={`/evidence/${params.id}`}>
                Back to record
              </a>
            </div>
          )}
        </section>

        {/* Annotation list */}
        <aside className="annotation-list">
          <h3>Annotations ({annotations.length})</h3>
          {annotations.length === 0 ? (
            <p className="ev-muted" style={{ fontSize: "var(--text-sm)" }}>No annotations yet.</p>
          ) : (
            <div className="annotation-items">
              {annotations.map((ann) => (
                <div key={ann.id} className="annotation-item-card">
                  <div className="annotation-item-header">
                    <span className={`annotation-type-badge type-${ann.type}`}>{ann.type}</span>
                    <span className="annotation-user">{ann.user.name}</span>
                  </div>
                  <p className="annotation-time">
                    {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" })
                      .format(new Date(ann.createdAt))}
                  </p>
                  {ann.text && <p className="annotation-text">{ann.text}</p>}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
