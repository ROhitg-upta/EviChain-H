import { Router, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware";

const insensitive = Prisma.QueryMode.insensitive;

const router = Router();

export type SearchEntityType = "CASE" | "EVIDENCE" | "AUDIT" | "USER" | "NOTIFICATION" | "CUSTODY";

export interface SearchItem {
  id: string;
  type: SearchEntityType;
  title: string;
  subtitle?: string;
  status?: string;
  href: string;
  matchedFields: string[];
  metadata?: Record<string, unknown>;
}

export interface SearchGroup {
  type: SearchEntityType;
  label: string;
  total: number;
  items: SearchItem[];
}

const ALLOWED_TYPES = new Set<SearchEntityType>([
  "CASE",
  "EVIDENCE",
  "AUDIT",
  "USER",
  "NOTIFICATION",
  "CUSTODY",
]);

// ═══════════════════════════════════════════════════════════════════
// GET /search — Scope-Aware Global Search & Suggestions API
// ═══════════════════════════════════════════════════════════════════
router.get("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const rawQ = req.query.q !== undefined ? String(req.query.q) : "";
    const q = rawQ.trim();

    if (!q || q.length < 2) {
      return res.status(400).json({
        error: { code: "INVALID_QUERY", message: "Search query 'q' must be at least 2 characters long." },
      });
    }

    const mode = (String(req.query.mode || "full").toLowerCase() === "suggestions" ? "suggestions" : "full") as "suggestions" | "full";
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize || "20"), 10) || 20));
    const limitPerType = Math.min(20, Math.max(1, parseInt(String(req.query.limitPerType || (mode === "suggestions" ? "5" : "15")), 10) || 5));
    const caseId = req.query.caseId as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    // Parse requested entity types
    let requestedTypes: SearchEntityType[] = [];
    if (req.query.types) {
      const parsedTypes = String(req.query.types)
        .split(",")
        .map((t) => t.trim().toUpperCase()) as SearchEntityType[];
      for (const t of parsedTypes) {
        if (!ALLOWED_TYPES.has(t)) {
          return res.status(400).json({
            error: { code: "INVALID_TYPE_FILTER", message: `Invalid search type filter: ${t}` },
          });
        }
        requestedTypes.push(t);
      }
    } else {
      requestedTypes = ["CASE", "EVIDENCE", "AUDIT", "USER", "NOTIFICATION", "CUSTODY"];
    }

    // Role-based scoping variables
    const isInvestigator = req.userRole === "INVESTIGATOR";
    const isAuditor = req.userRole === "AUDITOR";
    const isAdmin = req.userRole === "ADMINISTRATOR";

    let accessibleCaseIds: string[] = [];
    let accessibleEvidenceIds: string[] = [];

    if (isInvestigator) {
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
      accessibleCaseIds = ledCases.map((c) => c.id);
      accessibleEvidenceIds = heldEvidence.map((e) => e.id);
    }

    // Date range helper
    const dateRange: Record<string, Date> = {};
    if (from) {
      const d = new Date(from);
      if (!isNaN(d.getTime())) dateRange.gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (!isNaN(d.getTime())) {
        if (to.length <= 10) d.setUTCHours(23, 59, 59, 999);
        dateRange.lte = d;
      }
    }
    const hasDateRange = Object.keys(dateRange).length > 0;

    const isSha256Hex = /^[a-fA-F0-9]{64}$/.test(q);
    const groups: SearchGroup[] = [];

    // ─────────────────────────────────────────────────────────────
    // 1. CASES SEARCH
    // ─────────────────────────────────────────────────────────────
    if (requestedTypes.includes("CASE")) {
      const caseAnd: Array<Record<string, unknown>> = [];
      if (isInvestigator) {
        caseAnd.push({
          OR: [
            { leadUserId: req.userId },
            { id: { in: accessibleCaseIds } },
          ],
        });
      }
      if (caseId) caseAnd.push({ id: caseId });
      if (hasDateRange) caseAnd.push({ createdAt: dateRange });

      caseAnd.push({
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { id: { equals: q } },
        ],
      });

      const caseWhere = { AND: caseAnd };
      const [totalCases, cases] = await Promise.all([
        prisma.case.count({ where: caseWhere }),
        prisma.case.findMany({
          where: caseWhere,
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            description: true,
            createdAt: true,
          },
          take: limitPerType,
          orderBy: { createdAt: "desc" },
        }),
      ]);

      if (totalCases > 0) {
        groups.push({
          type: "CASE",
          label: "Cases",
          total: totalCases,
          items: cases.map((c) => {
            const matchedFields: string[] = [];
            if (c.title.toLowerCase().includes(q.toLowerCase())) matchedFields.push("title");
            if (c.description?.toLowerCase().includes(q.toLowerCase())) matchedFields.push("description");
            if (c.id === q) matchedFields.push("id");

            return {
              id: c.id,
              type: "CASE",
              title: c.title,
              subtitle: `${c.status.toUpperCase()} · Priority: ${c.priority}`,
              status: c.status,
              href: `/cases/${c.id}`,
              matchedFields: matchedFields.length > 0 ? matchedFields : ["title"],
            };
          }),
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 2. EVIDENCE SEARCH
    // ─────────────────────────────────────────────────────────────
    if (requestedTypes.includes("EVIDENCE")) {
      const evAnd: Array<Record<string, unknown>> = [];
      if (isInvestigator) {
        evAnd.push({
          OR: [
            { collectedById: req.userId },
            { currentCustodianId: req.userId },
            { caseId: { in: accessibleCaseIds } },
          ],
        });
      }
      if (caseId) evAnd.push({ caseId });
      if (hasDateRange) evAnd.push({ createdAt: dateRange });

      if (isSha256Hex) {
        evAnd.push({ sha256: { equals: q.toLowerCase() } });
      } else {
        evAnd.push({
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { sha256: { contains: q.toLowerCase() } },
            { description: { contains: q, mode: "insensitive" } },
            { ownerOrg: { contains: q, mode: "insensitive" } },
            { id: { equals: q } },
          ],
        });
      }

      const evWhere = { AND: evAnd };
      const [totalEv, evidence] = await Promise.all([
        prisma.evidence.count({ where: evWhere }),
        prisma.evidence.findMany({
          where: evWhere,
          select: {
            id: true,
            name: true,
            type: true,
            sha256: true,
            status: true,
            case: { select: { id: true, title: true } },
          },
          take: limitPerType,
          orderBy: { createdAt: "desc" },
        }),
      ]);

      if (totalEv > 0) {
        groups.push({
          type: "EVIDENCE",
          label: "Evidence",
          total: totalEv,
          items: evidence.map((e) => {
            const matchedFields: string[] = [];
            if (e.name.toLowerCase().includes(q.toLowerCase())) matchedFields.push("filename");
            if (e.sha256.toLowerCase().includes(q.toLowerCase())) matchedFields.push("sha256");
            if (e.id === q) matchedFields.push("id");

            return {
              id: e.id,
              type: "EVIDENCE",
              title: e.name,
              subtitle: `SHA-256: ${e.sha256.slice(0, 16)}… ${e.case ? `(${e.case.title})` : ""}`,
              status: e.status,
              href: `/evidence/${e.id}`,
              matchedFields: matchedFields.length > 0 ? matchedFields : ["filename"],
            };
          }),
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 3. AUDIT LOGS SEARCH
    // ─────────────────────────────────────────────────────────────
    if (requestedTypes.includes("AUDIT")) {
      const auditAnd: Array<Record<string, unknown>> = [];
      if (isInvestigator) {
        auditAnd.push({
          OR: [
            { actorUserId: req.userId },
            { resourceType: "case", resourceId: { in: accessibleCaseIds } },
            { resourceType: "evidence", resourceId: { in: accessibleEvidenceIds } },
          ],
        });
      }
      if (caseId) {
        auditAnd.push({
          OR: [
            { resourceType: "case", resourceId: caseId },
            { resourceId: caseId },
          ],
        });
      }
      if (hasDateRange) auditAnd.push({ timestamp: dateRange });

      auditAnd.push({
        OR: [
          { action: { contains: q, mode: "insensitive" } },
          { resourceType: { contains: q, mode: "insensitive" } },
          { resourceId: { contains: q, mode: "insensitive" } },
          { actor: { name: { contains: q, mode: "insensitive" } } },
        ],
      });

      const auditWhere = { AND: auditAnd };
      const [totalAudit, auditLogs] = await Promise.all([
        prisma.auditLog.count({ where: auditWhere }),
        prisma.auditLog.findMany({
          where: auditWhere,
          include: { actor: { select: { id: true, name: true, role: true } } },
          take: limitPerType,
          orderBy: { timestamp: "desc" },
        }),
      ]);

      if (totalAudit > 0) {
        groups.push({
          type: "AUDIT",
          label: "Audit Ledger",
          total: totalAudit,
          items: auditLogs.map((a) => ({
            id: a.id,
            type: "AUDIT",
            title: `Audit: ${a.action}`,
            subtitle: `${a.resourceType.toUpperCase()} · Actor: ${a.actor?.name || "System"}`,
            href: `/audit?q=${encodeURIComponent(a.id)}`,
            matchedFields: ["action", "resourceType"],
          })),
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 4. USERS SEARCH (Administrator & permitted workflows only)
    // ─────────────────────────────────────────────────────────────
    if (requestedTypes.includes("USER") && isAdmin) {
      const userOr: Array<Prisma.UserWhereInput> = [
        { name: { contains: q, mode: insensitive } },
        { email: { contains: q, mode: insensitive } },
      ];
      const upperQ = q.toUpperCase();
      if (["ADMINISTRATOR", "INVESTIGATOR", "AUDITOR", "CUSTODIAN"].includes(upperQ)) {
        userOr.push({ role: upperQ as "ADMINISTRATOR" | "INVESTIGATOR" | "AUDITOR" | "CUSTODIAN" });
      }

      const userWhere: Prisma.UserWhereInput = { OR: userOr };

      const [totalUsers, users] = await Promise.all([
        prisma.user.count({ where: userWhere }),
        prisma.user.findMany({
          where: userWhere,
          select: { id: true, name: true, email: true, role: true },
          take: limitPerType,
          orderBy: { name: "asc" },
        }),
      ]);

      if (totalUsers > 0) {
        groups.push({
          type: "USER",
          label: "Users",
          total: totalUsers,
          items: users.map((u) => ({
            id: u.id,
            type: "USER",
            title: u.name,
            subtitle: `${u.role} · ${u.email}`,
            href: `/admin/users?highlight=${u.id}`,
            matchedFields: ["name", "email"],
          })),
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 5. NOTIFICATIONS SEARCH (Strictly user-scoped)
    // ─────────────────────────────────────────────────────────────
    if (requestedTypes.includes("NOTIFICATION")) {
      const notifWhere = {
        userId: req.userId!,
        OR: [
          { title: { contains: q, mode: insensitive } },
          { message: { contains: q, mode: insensitive } },
          { type: { contains: q, mode: insensitive } },
        ],
      };

      const [totalNotifs, notifs] = await Promise.all([
        prisma.notification.count({ where: notifWhere }),
        prisma.notification.findMany({
          where: notifWhere,
          take: limitPerType,
          orderBy: { createdAt: "desc" },
        }),
      ]);

      if (totalNotifs > 0) {
        groups.push({
          type: "NOTIFICATION",
          label: "Notifications",
          total: totalNotifs,
          items: notifs.map((n) => ({
            id: n.id,
            type: "NOTIFICATION",
            title: n.title,
            subtitle: n.message.slice(0, 60),
            status: n.read ? "READ" : "UNREAD",
            href: n.link || "/notifications",
            matchedFields: ["title", "message"],
          })),
        });
      }
    }

    // Compute aggregated total across groups
    const grandTotal = groups.reduce((acc, g) => acc + g.total, 0);
    const totalPages = Math.ceil(grandTotal / pageSize) || 0;

    // Backwards compatibility collections
    const legacyCases = groups.find((g) => g.type === "CASE")?.items.map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status || "Active",
    })) || [];

    const legacyEvidence = groups.find((g) => g.type === "EVIDENCE")?.items.map((i) => ({
      id: i.id,
      name: i.title,
      sha256: i.subtitle?.split(" ")[1] || "",
      case: { title: i.subtitle || "" },
    })) || [];

    const legacyUsers = groups.find((g) => g.type === "USER")?.items.map((i) => ({
      id: i.id,
      name: i.title,
      email: i.subtitle?.split(" · ")[1] || "",
    })) || [];

    return res.json({
      query: q,
      mode,
      groups,
      pagination: {
        page,
        pageSize,
        totalItems: grandTotal,
        totalPages,
      },
      // Backward compatibility fields for legacy command palette
      cases: legacyCases,
      evidence: legacyEvidence,
      users: legacyUsers,
    });
  } catch (error) {
    console.error("[Search API] Global search error:", error);
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Search query execution failed" } });
  }
});

export default router;
