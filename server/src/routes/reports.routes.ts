import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, AuthedRequest, requireRole } from "../middleware";

const router = Router();

/** Group an array by a date-string field into month buckets (YYYY-MM) */
function groupByMonth<T extends { createdAt: Date }>(
  items: T[],
): { month: string; count: number }[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = item.createdAt.toISOString().slice(0, 7); // "YYYY-MM"
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, count]) => ({ month, count }));
}

/** Convert report data to CSV */
function reportToCsv(data: ReturnType<typeof buildReport>): string {
  const lines: string[] = [];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  lines.push("=== EVICHAIN REPORT ===");
  lines.push(`Generated,${new Date().toISOString()}`);
  lines.push("");
  lines.push("=== SUMMARY ===");
  lines.push(`Total Cases,${data.totalCases}`);
  lines.push(`Total Evidence,${data.totalEvidence}`);
  lines.push(`Avg Resolution Days,${data.avgResolutionDays.toFixed(1)}`);
  lines.push("");

  lines.push("=== CASES BY STATUS ===");
  lines.push("Status,Count");
  for (const row of data.casesByStatus) {
    lines.push(`${esc(row.status)},${row.count}`);
  }
  lines.push("");

  lines.push("=== CASES BY MONTH ===");
  lines.push("Month,Count");
  for (const row of data.casesByMonth) {
    lines.push(`${esc(row.month)},${row.count}`);
  }
  lines.push("");

  lines.push("=== EVIDENCE BY TYPE ===");
  lines.push("Type,Count");
  for (const row of data.evidenceByType) {
    lines.push(`${esc(row.type)},${row.count}`);
  }
  lines.push("");

  lines.push("=== TOP UPLOADERS ===");
  lines.push("Name,Count");
  for (const row of data.topUploaders) {
    lines.push(`${esc(row.name)},${row.count}`);
  }

  return lines.join("\n");
}

function buildReport(
  cases: { status: string; createdAt: Date; updatedAt: Date }[],
  evidence: { type: string; mimeType: string; createdAt: Date; collectedBy: { name: string } }[],
) {
  // Cases by status
  const statusMap = new Map<string, number>();
  for (const c of cases) statusMap.set(c.status, (statusMap.get(c.status) ?? 0) + 1);
  const casesByStatus = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));

  // Cases by month
  const casesByMonth = groupByMonth(cases);

  // Evidence by type (MIME category)
  const typeMap = new Map<string, number>();
  for (const e of evidence) {
    const cat = e.mimeType.startsWith("image/") ? "Image"
      : e.mimeType.startsWith("video/") ? "Video"
      : e.mimeType === "application/pdf" ? "PDF"
      : e.mimeType.includes("word") || e.mimeType.includes("document") ? "Document"
      : e.mimeType.includes("excel") || e.mimeType.includes("sheet") ? "Spreadsheet"
      : e.mimeType.includes("zip") || e.mimeType.includes("tar") ? "Archive"
      : "Other";
    typeMap.set(cat, (typeMap.get(cat) ?? 0) + 1);
  }
  const evidenceByType = Array.from(typeMap.entries()).map(([type, count]) => ({ type, count }));

  // Evidence by month
  const evidenceByMonth = groupByMonth(evidence);

  // Top uploaders
  const uploaderMap = new Map<string, number>();
  for (const e of evidence) {
    const name = e.collectedBy.name;
    uploaderMap.set(name, (uploaderMap.get(name) ?? 0) + 1);
  }
  const topUploaders = Array.from(uploaderMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Avg resolution days (closed cases)
  const closedCases = cases.filter((c) => c.status === "Closed" || c.status === "Archived");
  const avgResolutionDays = closedCases.length
    ? closedCases.reduce((sum, c) => {
        return sum + (c.updatedAt.getTime() - c.createdAt.getTime()) / 86_400_000;
      }, 0) / closedCases.length
    : 0;

  return {
    totalCases: cases.length,
    totalEvidence: evidence.length,
    casesByStatus,
    casesByMonth,
    evidenceByType,
    evidenceByMonth,
    topUploaders,
    avgResolutionDays,
  };
}

// ═══════════════════════════════════════════════════════════════════
// GET /reports  — analytics data JSON
// ═══════════════════════════════════════════════════════════════════
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const rangeDays = Math.min(Number(req.query.range) || 90, 365);
    const since = new Date(Date.now() - rangeDays * 86_400_000);

    const [cases, evidence] = await Promise.all([
      prisma.case.findMany({
        where: { createdAt: { gte: since } },
        select: { status: true, createdAt: true, updatedAt: true },
      }),
      prisma.evidence.findMany({
        where: { createdAt: { gte: since } },
        select: {
          type: true,
          mimeType: true,
          createdAt: true,
          collectedBy: { select: { name: true } },
        },
      }),
    ]);

    return res.json(buildReport(cases, evidence));
  } catch (error) {
    console.error("Reports error:", error);
    return res.status(500).json({ error: "Failed to generate report" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /reports/export  — download as CSV
// ═══════════════════════════════════════════════════════════════════
router.get(
  "/export",
  requireAuth,
  requireRole("ADMINISTRATOR", "AUDITOR"),
  async (req: AuthedRequest, res) => {
    try {
      const rangeDays = Math.min(Number(req.query.range) || 90, 365);
      const since = new Date(Date.now() - rangeDays * 86_400_000);

      const [cases, evidence] = await Promise.all([
        prisma.case.findMany({
          where: { createdAt: { gte: since } },
          select: { status: true, createdAt: true, updatedAt: true },
        }),
        prisma.evidence.findMany({
          where: { createdAt: { gte: since } },
          select: {
            type: true,
            mimeType: true,
            createdAt: true,
            collectedBy: { select: { name: true } },
          },
        }),
      ]);

      const report = buildReport(cases, evidence);
      const csv = reportToCsv(report);
      const dateStamp = new Date().toISOString().slice(0, 10);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="evichain-report-${dateStamp}.csv"`,
      );
      return res.send(csv);
    } catch (error) {
      console.error("Report export error:", error);
      return res.status(500).json({ error: "Failed to export report" });
    }
  },
);

export default router;
