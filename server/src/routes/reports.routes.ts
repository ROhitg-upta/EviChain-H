import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, AuthedRequest, requireRole } from "../middleware";
import { generateCaseSummaryPdf } from "../services/pdf.service";

const router = Router();

// ═══════════════════════════════════════════════════════════════════
// GET /reports/summary or GET /reports — Real compliance metrics
// ═══════════════════════════════════════════════════════════════════
async function getSummaryHandler(req: AuthedRequest, res: import("express").Response) {
  try {
    const rangeDays = Math.min(365, Math.max(1, parseInt(String(req.query.range || req.query.days || "30"), 10) || 30));
    
    // Date range boundaries
    let fromDate = new Date(Date.now() - rangeDays * 86_400_000);
    let toDate = new Date();

    if (req.query.from && typeof req.query.from === "string") {
      const parsedFrom = new Date(req.query.from);
      if (!isNaN(parsedFrom.getTime())) fromDate = parsedFrom;
    }

    if (req.query.to && typeof req.query.to === "string") {
      const parsedTo = new Date(req.query.to);
      if (!isNaN(parsedTo.getTime())) {
        if (req.query.to.length <= 10) parsedTo.setUTCHours(23, 59, 59, 999);
        toDate = parsedTo;
      }
    }

    const dateFilter = { gte: fromDate, lte: toDate };

    // RBAC scoping:
    // Administrators & Auditors view global statistics
    // Investigators view statistics scoped to their cases and evidence
    const isInvestigator = req.userRole === "INVESTIGATOR";
    const caseWhere = isInvestigator
      ? { leadUserId: req.userId, createdAt: dateFilter }
      : { createdAt: dateFilter };

    const evidenceWhere = isInvestigator
      ? {
          OR: [{ collectedById: req.userId }, { currentCustodianId: req.userId }],
          createdAt: dateFilter,
        }
      : { createdAt: dateFilter };

    // Execute parallel real database aggregations
    const [
      allCases,
      allEvidence,
      custodyEvents,
      auditLogs,
    ] = await Promise.all([
      prisma.case.findMany({
        where: caseWhere,
        select: { id: true, status: true, priority: true, createdAt: true, updatedAt: true },
      }),
      prisma.evidence.findMany({
        where: evidenceWhere,
        select: { id: true, status: true, type: true, sizeBytes: true, createdAt: true },
      }),
      prisma.custodyEvent.findMany({
        where: { timestamp: dateFilter },
        select: { id: true, action: true, timestamp: true },
      }),
      prisma.auditLog.findMany({
        where: { timestamp: dateFilter },
        select: { id: true, action: true, timestamp: true },
      }),
    ]);

    // 1. Cases breakdown
    const caseCounts = {
      total: allCases.length,
      active: allCases.filter((c) => c.status === "Active").length,
      closed: allCases.filter((c) => c.status === "Closed").length,
      archived: allCases.filter((c) => c.status === "Archived").length,
    };

    // 2. Evidence breakdown
    const evidenceCounts = {
      total: allEvidence.length,
      verified: allEvidence.filter((e) => e.status === "VERIFIED" || e.status === "SEALED").length,
      pending: allEvidence.filter((e) => e.status === "PENDING").length,
      integrityAlerts: allEvidence.filter((e) => e.status === "FLAGGED").length,
    };

    // 3. Custody breakdown
    const custodyCounts = {
      created: custodyEvents.filter((c) => c.action === "CREATED").length,
      transferred: custodyEvents.filter((c) => c.action === "TRANSFERRED").length,
      accessed: custodyEvents.filter((c) => c.action === "ACCESSED").length,
      downloaded: custodyEvents.filter((c) => c.action === "DOWNLOADED").length,
    };

    // 4. Audit summary
    const auditSummary = {
      totalEvents: auditLogs.length,
      publicVerifications: auditLogs.filter((a) => a.action === "public.verify").length,
      failedActions: auditLogs.filter((a) => a.action.includes("failed") || a.action.includes("reject")).length,
    };

    // 5. Top Actions
    const actionMap = new Map<string, number>();
    for (const l of auditLogs) {
      actionMap.set(l.action, (actionMap.get(l.action) || 0) + 1);
    }
    const topActions = Array.from(actionMap.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // 6. Activity by Day (Aggregated by YYYY-MM-DD)
    const dayMap = new Map<string, number>();
    for (const l of auditLogs) {
      const day = l.timestamp.toISOString().slice(0, 10);
      dayMap.set(day, (dayMap.get(day) || 0) + 1);
    }

    const activityByDay = Array.from(dayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Return canonical response payload
    return res.json({
      period: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
      cases: caseCounts,
      evidence: evidenceCounts,
      custody: custodyCounts,
      audit: auditSummary,
      topActions,
      activityByDay,
    });
  } catch (error) {
    console.error("Reports summary query error:", error);
    return res.status(500).json({
      error: { code: "REPORT_QUERY_FAILED", message: "Failed to generate compliance report summary", status: 500 },
    });
  }
}

router.get("/summary", requireAuth, getSummaryHandler);
router.get("/", requireAuth, getSummaryHandler);

// ═══════════════════════════════════════════════════════════════════
// GET /reports/cases/:id/pdf — Canonical case intelligence report PDF
// ═══════════════════════════════════════════════════════════════════
router.get("/cases/:id/pdf", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const caseId = req.params["id"] as string;

    const caseRecord = await prisma.case.findUnique({
      where: { id: caseId },
      include: {
        lead: { select: { id: true, name: true, role: true, email: true } },
        evidence: {
          orderBy: { createdAt: "desc" },
          include: {
            collectedBy: { select: { name: true } },
            currentCustodian: { select: { name: true } },
          },
        },
      },
    });

    if (!caseRecord) {
      return res.status(404).json({
        error: { code: "CASE_NOT_FOUND", message: "Investigation case not found", status: 404 },
      });
    }

    // Role check for Investigators
    if (req.userRole === "INVESTIGATOR" && caseRecord.leadUserId !== req.userId) {
      // Check if investigator holds any evidence in this case
      const holdsEvidence = caseRecord.evidence.some(
        (e) => e.collectedById === req.userId || e.currentCustodianId === req.userId,
      );
      if (!holdsEvidence) {
        return res.status(403).json({
          error: { code: "CASE_ACCESS_DENIED", message: "You are not authorized to export reports for this case", status: 403 },
        });
      }
    }

    // Fetch custody events for evidence in this case
    const evidenceIds = caseRecord.evidence.map((e) => e.id);
    const custodyEvents = await prisma.custodyEvent.findMany({
      where: { evidenceId: { in: evidenceIds } },
      include: {
        actor: { select: { name: true, role: true } },
      },
      orderBy: { timestamp: "desc" },
      take: 25,
    });

    const pdfBuffer = await generateCaseSummaryPdf({
      id: caseRecord.id,
      title: caseRecord.title,
      description: caseRecord.description,
      status: caseRecord.status,
      priority: caseRecord.priority,
      createdAt: caseRecord.createdAt,
      updatedAt: caseRecord.updatedAt,
      lead: caseRecord.lead,
      evidence: caseRecord.evidence,
      custodyEvents,
    });

    // Record audit entry for PDF generation
    try {
      await prisma.auditLog.create({
        data: {
          action: "report.pdf_export",
          resourceType: "case",
          resourceId: caseRecord.id,
          actorUserId: req.userId,
          detailJson: { caseTitle: caseRecord.title },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
    } catch (auditErr) {
      console.error("PDF export audit error:", auditErr);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="EviChain-Case-Report-${caseRecord.id.slice(0, 8)}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Case report PDF generation error:", error);
    return res.status(500).json({
      error: { code: "PDF_GENERATION_FAILED", message: "Failed to generate case intelligence report PDF", status: 500 },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /reports/export — Compliance summary CSV export
// ═══════════════════════════════════════════════════════════════════
router.get("/export", requireAuth, requireRole("ADMINISTRATOR", "AUDITOR"), async (req: AuthedRequest, res) => {
  try {
    const rangeDays = Math.min(365, Math.max(1, parseInt(String(req.query.range || "30"), 10) || 30));
    const since = new Date(Date.now() - rangeDays * 86_400_000);

    const [cases, evidence] = await Promise.all([
      prisma.case.findMany({
        where: { createdAt: { gte: since } },
        select: { id: true, title: true, status: true, priority: true, createdAt: true },
      }),
      prisma.evidence.findMany({
        where: { createdAt: { gte: since } },
        select: { id: true, name: true, type: true, status: true, sizeBytes: true, sha256: true, createdAt: true },
      }),
    ]);

    const lines: string[] = [];
    lines.push("=== EVICHAIN COMPLIANCE REPORT ===");
    lines.push(`Generated (UTC),${new Date().toISOString()}`);
    lines.push(`Exported By,${req.userId}`);
    lines.push(`Period Start,${since.toISOString()}`);
    lines.push("");

    lines.push("=== CASE REGISTER ===");
    lines.push("Case ID,Title,Status,Priority,Created At");
    for (const c of cases) {
      const safeTitle = `"${c.title.replace(/"/g, '""')}"`;
      lines.push(`"${c.id}",${safeTitle},"${c.status}","${c.priority || 'NORMAL'}","${c.createdAt.toISOString()}"`);
    }
    lines.push("");

    lines.push("=== EVIDENCE REGISTRY ===");
    lines.push("Evidence ID,Name,Type,Status,Size (Bytes),SHA-256 Checksum,Created At");
    for (const e of evidence) {
      const safeName = `"${e.name.replace(/"/g, '""')}"`;
      lines.push(`"${e.id}",${safeName},"${e.type}","${e.status}",${e.sizeBytes},"${e.sha256}","${e.createdAt.toISOString()}"`);
    }

    const csvContent = lines.join("\r\n");
    const dateStamp = new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="evichain-compliance-${dateStamp}.csv"`,
    );
    return res.send(csvContent);
  } catch (error) {
    console.error("Compliance export error:", error);
    return res.status(500).json({
      error: { code: "EXPORT_FAILED", message: "Failed to export compliance data", status: 500 },
    });
  }
});

export default router;
