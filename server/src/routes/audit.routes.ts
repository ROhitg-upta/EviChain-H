import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, AuthedRequest, requireRole } from "../middleware";

const router = Router();

/** Shared include: always pull actor name/role */
const INCLUDE_ACTOR = {
  actor: { select: { id: true, name: true, role: true } },
};

/** Build a Prisma `where` clause from query params */
function buildWhere(params: {
  resourceType?: string;
  resourceId?: string;
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
}): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (params.resourceType) where.resourceType = params.resourceType;
  if (params.resourceId)   where.resourceId   = params.resourceId;
  if (params.actorUserId)  where.actorUserId  = params.actorUserId;
  if (params.action) {
    where.action = { contains: params.action, mode: "insensitive" };
  }

  if (params.from || params.to) {
    const range: Record<string, Date> = {};
    if (params.from) range.gte = new Date(params.from);
    if (params.to)   range.lte = new Date(params.to);
    where.timestamp = range;
  }

  return where;
}

/** Convert an array of audit log rows to CSV text */
function toCsv(logs: {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  actorUserId: string | null;
  actor?: { name: string; role: string } | null;
  ipAddress: string | null;
  userAgent: string | null;
  detailJson: unknown;
  timestamp: Date;
}[]): string {
  const header = [
    "id", "timestamp", "action", "resourceType", "resourceId",
    "actorUserId", "actorName", "actorRole", "ipAddress", "details",
  ];

  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = logs.map((l) => [
    esc(l.id),
    esc(l.timestamp.toISOString()),
    esc(l.action),
    esc(l.resourceType),
    esc(l.resourceId),
    esc(l.actorUserId ?? "system"),
    esc(l.actor?.name ?? ""),
    esc(l.actor?.role ?? ""),
    esc(l.ipAddress ?? ""),
    esc(JSON.stringify(l.detailJson)),
  ].join(","));

  return [header.join(","), ...rows].join("\n");
}

// ═══════════════════════════════════════════════════════════════════
// GET /audit  — list with rich filters
// ═══════════════════════════════════════════════════════════════════
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const where = buildWhere({
      resourceType: req.query.resourceType as string | undefined,
      resourceId:   req.query.resourceId   as string | undefined,
      actorUserId:  req.query.actorUserId  as string | undefined,
      action:       req.query.action       as string | undefined,
      from:         req.query.from         as string | undefined,
      to:           req.query.to           as string | undefined,
    });

    const logs = await prisma.auditLog.findMany({
      where,
      include: INCLUDE_ACTOR,
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    return res.json(logs);
  } catch (error) {
    console.error("Audit list error:", error);
    return res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /audit/export  — GET export (JSON, query-param filters)
// POST /audit/export — POST export (JSON or CSV, body filters)
// Both require ADMINISTRATOR or AUDITOR role
// ═══════════════════════════════════════════════════════════════════
async function handleExport(req: AuthedRequest, res: import("express").Response) {
  try {
    // Accept filters from query (GET) or body (POST)
    const src = req.method === "POST" ? req.body : req.query;

    const format: string = (src.format as string | undefined) ?? "json";
    const where = buildWhere({
      resourceType: src.resourceType as string | undefined,
      resourceId:   src.resourceId   as string | undefined,
      actorUserId:  src.actorUserId  as string | undefined,
      action:       src.action       as string | undefined,
      from:         src.from         as string | undefined,
      to:           src.to           as string | undefined,
    });

    const logs = await prisma.auditLog.findMany({
      where,
      include: INCLUDE_ACTOR,
      orderBy: { timestamp: "desc" },
    });

    const dateStamp = new Date().toISOString().slice(0, 10);

    if (format === "csv") {
      const csv = toCsv(logs);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="audit-export-${dateStamp}.csv"`,
      );
      return res.send(csv);
    }

    // Default: JSON
    const payload = {
      product: "EviChain",
      exportedAt: new Date().toISOString(),
      exportedBy: req.userId,
      totalRecords: logs.length,
      filters: src,
      logs,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="audit-export-${dateStamp}.json"`,
    );
    return res.json(payload);
  } catch (error) {
    console.error("Audit export error:", error);
    return res.status(500).json({ error: "Failed to export audit logs" });
  }
}

router.get(
  "/export",
  requireAuth,
  requireRole("ADMINISTRATOR", "AUDITOR"),
  handleExport,
);

router.post(
  "/export",
  requireAuth,
  requireRole("ADMINISTRATOR", "AUDITOR"),
  handleExport,
);

// ═══════════════════════════════════════════════════════════════════
// GET /audit/:id  — single log with full detail
// ═══════════════════════════════════════════════════════════════════
router.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const id = req.params["id"] as string;

    const log = await prisma.auditLog.findUnique({
      where: { id },
      include: {
        actor: { select: { id: true, name: true, role: true } },
      },
    });

    if (!log) {
      return res.status(404).json({ error: "Audit log not found" });
    }

    // Optionally attach related resource snapshots
    let relatedCase = null;
    let relatedEvidence = null;

    if (log.resourceType === "case") {
      relatedCase = await prisma.case.findUnique({
        where: { id: log.resourceId },
        select: { id: true, title: true, status: true },
      }).catch(() => null);
    }

    if (log.resourceType === "evidence") {
      relatedEvidence = await prisma.evidence.findUnique({
        where: { id: log.resourceId },
        select: { id: true, name: true, type: true, sha256: true, status: true },
      }).catch(() => null);
    }

    return res.json({ ...log, relatedCase, relatedEvidence });
  } catch (error) {
    console.error("Audit detail error:", error);
    return res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

export default router;
