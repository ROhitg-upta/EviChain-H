import { Router, Response } from "express";
import { prisma } from "../db";
import { requireAuth, AuthedRequest, requireRole } from "../middleware";

const router = Router();

/** Shared include: always pull actor profile */
const INCLUDE_ACTOR = {
  actor: { select: { id: true, name: true, role: true, email: true } },
};

const ALLOWED_SORT_FIELDS = ["timestamp", "action", "resourceType"];
const ALLOWED_RESOURCE_TYPES = ["case", "evidence", "user", "custody", "auth", "system"];

/**
 * Formula injection prevention (CSV Injection / DDE attack prevention)
 * If a cell begins with =, +, -, @, \t, or \r, prepend a single quote '.
 */
function sanitizeCsvCell(value: unknown): string {
  if (value == null) return '""';
  let str = String(value);

  // If starts with dangerous spreadsheet formula character, prefix with single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Escape internal double quotes
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/** Convert an array of audit log records into compliant, sanitized CSV text */
function toCsv(logs: Array<{
  id: string;
  timestamp: Date;
  action: string;
  resourceType: string;
  resourceId: string;
  actorUserId: string | null;
  actor?: { name: string; role: string } | null;
  ipAddress: string | null;
  detailJson: unknown;
}>): string {
  const header = [
    "ID",
    "Timestamp (UTC)",
    "Action",
    "Resource Type",
    "Resource ID",
    "Actor ID",
    "Actor Name",
    "Actor Role",
    "IP Address",
    "Details",
  ];

  const rows = logs.map((l) => [
    sanitizeCsvCell(l.id),
    sanitizeCsvCell(l.timestamp.toISOString()),
    sanitizeCsvCell(l.action),
    sanitizeCsvCell(l.resourceType),
    sanitizeCsvCell(l.resourceId),
    sanitizeCsvCell(l.actorUserId || "SYSTEM"),
    sanitizeCsvCell(l.actor?.name || ""),
    sanitizeCsvCell(l.actor?.role || ""),
    sanitizeCsvCell(l.ipAddress || "—"),
    sanitizeCsvCell(JSON.stringify(l.detailJson)),
  ].join(","));

  return [header.join(","), ...rows].join("\r\n");
}

/**
 * Build Prisma `where` clause taking into account user role and filters.
 */
async function buildScopedAuditWhere(
  req: AuthedRequest,
  params: {
    resourceType?: string;
    resourceId?: string;
    caseId?: string;
    evidenceId?: string;
    actorUserId?: string;
    action?: string;
    from?: string;
    to?: string;
    q?: string;
  },
): Promise<Record<string, unknown>> {
  const andConditions: Array<Record<string, unknown>> = [];

  // 1. Role-based scoping for Investigators
  if (req.userRole === "INVESTIGATOR") {
    const [ledCases, heldEvidence] = await Promise.all([
      prisma.case.findMany({
        where: { leadUserId: req.userId },
        select: { id: true },
      }),
      prisma.evidence.findMany({
        where: {
          OR: [
            { collectedById: req.userId },
            { currentCustodianId: req.userId },
          ],
        },
        select: { id: true },
      }),
    ]);

    const accessibleCaseIds = ledCases.map((c) => c.id);
    const accessibleEvidenceIds = heldEvidence.map((e) => e.id);

    andConditions.push({
      OR: [
        { actorUserId: req.userId },
        { resourceType: "case", resourceId: { in: accessibleCaseIds } },
        { resourceType: "evidence", resourceId: { in: accessibleEvidenceIds } },
      ],
    });
  }

  // 2. Specific filter params
  if (params.resourceType && params.resourceType !== "ALL") {
    andConditions.push({ resourceType: params.resourceType });
  }

  if (params.resourceId) {
    andConditions.push({ resourceId: params.resourceId });
  }

  if (params.caseId) {
    andConditions.push({
      OR: [
        { resourceType: "case", resourceId: params.caseId },
        { resourceId: params.caseId },
      ],
    });
  }

  if (params.evidenceId) {
    andConditions.push({
      resourceType: "evidence",
      resourceId: params.evidenceId,
    });
  }

  if (params.actorUserId) {
    andConditions.push({ actorUserId: params.actorUserId });
  }

  if (params.action && params.action !== "ALL") {
    andConditions.push({
      action: { contains: params.action, mode: "insensitive" },
    });
  }

  // Date range
  if (params.from || params.to) {
    const range: Record<string, Date> = {};
    if (params.from) {
      const d = new Date(params.from);
      if (!isNaN(d.getTime())) range.gte = d;
    }
    if (params.to) {
      const d = new Date(params.to);
      if (!isNaN(d.getTime())) {
        if (params.to.length <= 10) {
          d.setUTCHours(23, 59, 59, 999);
        }
        range.lte = d;
      }
    }
    if (Object.keys(range).length > 0) {
      andConditions.push({ timestamp: range });
    }
  }

  // Search query `q`
  if (params.q) {
    const qTrim = params.q.trim();
    if (qTrim) {
      andConditions.push({
        OR: [
          { action: { contains: qTrim, mode: "insensitive" } },
          { resourceType: { contains: qTrim, mode: "insensitive" } },
          { resourceId: { contains: qTrim, mode: "insensitive" } },
          { actor: { name: { contains: qTrim, mode: "insensitive" } } },
        ],
      });
    }
  }

  return andConditions.length > 0 ? { AND: andConditions } : {};
}

// ═══════════════════════════════════════════════════════════════════
// GET /audit  — Paginated audit log list with rich filters
// ═══════════════════════════════════════════════════════════════════
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || req.query.limit || "25"), 10) || 25));
    const skip = (page - 1) * pageSize;

    const sortByParam = String(req.query.sortBy || "timestamp");
    const sortBy = ALLOWED_SORT_FIELDS.includes(sortByParam) ? sortByParam : "timestamp";
    const sortOrder = String(req.query.sortOrder || "desc").toLowerCase() === "asc" ? "asc" : "desc";

    const where = await buildScopedAuditWhere(req, {
      resourceType: req.query.resourceType as string | undefined,
      resourceId: req.query.resourceId as string | undefined,
      caseId: req.query.caseId as string | undefined,
      evidenceId: req.query.evidenceId as string | undefined,
      actorUserId: req.query.actorUserId as string | undefined,
      action: req.query.action as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      q: req.query.q as string | undefined,
    });

    const [totalItems, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: INCLUDE_ACTOR,
        orderBy: [{ [sortBy]: sortOrder }, { id: "desc" }],
        skip,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.ceil(totalItems / pageSize) || 1;

    return res.json({
      items,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
      },
      filters: {
        resourceType: req.query.resourceType || "ALL",
        action: req.query.action || "ALL",
        from: req.query.from || null,
        to: req.query.to || null,
        q: req.query.q || null,
        sortBy,
        sortOrder,
      },
    });
  } catch (error) {
    console.error("Audit list query error:", error);
    return res.status(500).json({
      error: { code: "AUDIT_QUERY_FAILED", message: "Failed to fetch audit logs", status: 500 },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /audit/export & POST /audit/export — Secure CSV/JSON export
// ═══════════════════════════════════════════════════════════════════
async function handleExport(req: AuthedRequest, res: Response) {
  try {
    const src = req.method === "POST" ? req.body : req.query;
    const format = String(src.format || "csv").toLowerCase();

    const where = await buildScopedAuditWhere(req, {
      resourceType: src.resourceType as string | undefined,
      resourceId: src.resourceId as string | undefined,
      caseId: src.caseId as string | undefined,
      evidenceId: src.evidenceId as string | undefined,
      actorUserId: src.actorUserId as string | undefined,
      action: src.action as string | undefined,
      from: src.from as string | undefined,
      to: src.to as string | undefined,
      q: src.q as string | undefined,
    });

    const logs = await prisma.auditLog.findMany({
      where,
      include: INCLUDE_ACTOR,
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: 5000, // Safe export ceiling
    });

    // Record audit entry for export generation
    try {
      await prisma.auditLog.create({
        data: {
          action: "audit.export",
          resourceType: "audit",
          resourceId: "export_ledger",
          actorUserId: req.userId,
          detailJson: {
            format,
            recordCount: logs.length,
            filters: src,
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
    } catch (auditErr) {
      console.error("Audit export logging error:", auditErr);
    }

    const dateStamp = new Date().toISOString().slice(0, 10);

    if (format === "csv") {
      const csvContent = toCsv(logs);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="evichain-audit-${dateStamp}.csv"`,
      );
      return res.send(csvContent);
    }

    // JSON format
    const payload = {
      product: "EviChain Forensic Intelligence",
      exportedAt: new Date().toISOString(),
      exportedBy: req.userId,
      totalRecords: logs.length,
      filters: src,
      items: logs,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="evichain-audit-${dateStamp}.json"`,
    );
    return res.json(payload);
  } catch (error) {
    console.error("Audit export error:", error);
    return res.status(500).json({
      error: { code: "EXPORT_FAILED", message: "Failed to export audit logs", status: 500 },
    });
  }
}

router.get("/export", requireAuth, handleExport);
router.post("/export", requireAuth, handleExport);

// ═══════════════════════════════════════════════════════════════════
// GET /audit/:id  — Single audit log with linked resource summary
// ═══════════════════════════════════════════════════════════════════
router.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const id = req.params["id"] as string;

    const log = await prisma.auditLog.findUnique({
      where: { id },
      include: {
        actor: { select: { id: true, name: true, role: true, email: true } },
      },
    });

    if (!log) {
      return res.status(404).json({
        error: { code: "AUDIT_NOT_FOUND", message: "Audit log entry not found", status: 404 },
      });
    }

    // Role check for Investigators
    if (req.userRole === "INVESTIGATOR" && log.actorUserId !== req.userId && log.action !== "public.verify") {
      // Check if related to investigator's cases or evidence
      const hasCaseAccess = log.resourceType === "case" && await prisma.case.findFirst({
        where: { id: log.resourceId, leadUserId: req.userId },
        select: { id: true },
      });

      const hasEvidenceAccess = log.resourceType === "evidence" && await prisma.evidence.findFirst({
        where: {
          id: log.resourceId,
          OR: [{ collectedById: req.userId }, { currentCustodianId: req.userId }],
        },
        select: { id: true },
      });

      if (!hasCaseAccess && !hasEvidenceAccess) {
        return res.status(404).json({
          error: { code: "AUDIT_NOT_FOUND", message: "Audit log entry not found", status: 404 },
        });
      }
    }

    // Attach related resource snapshot
    let relatedCase = null;
    let relatedEvidence = null;

    if (log.resourceType === "case") {
      relatedCase = await prisma.case.findUnique({
        where: { id: log.resourceId },
        select: { id: true, title: true, status: true, priority: true },
      }).catch(() => null);
    }

    if (log.resourceType === "evidence") {
      relatedEvidence = await prisma.evidence.findUnique({
        where: { id: log.resourceId },
        select: { id: true, name: true, type: true, sha256: true, status: true, ownerOrg: true },
      }).catch(() => null);
    }

    return res.json({
      ...log,
      relatedCase,
      relatedEvidence,
    });
  } catch (error) {
    console.error("Audit detail fetch error:", error);
    return res.status(500).json({
      error: { code: "AUDIT_FETCH_ERROR", message: "Failed to retrieve audit log", status: 500 },
    });
  }
});

export default router;
