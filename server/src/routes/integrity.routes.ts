import { Router, Response } from "express";
import { prisma } from "../db";
import { requireAuth, AuthedRequest, requireRole, createRateLimiter } from "../middleware";
import { integrityIntelligenceService } from "../services/integrity-intelligence.service";

const router = Router();

// Rate limiter for manual on-demand integrity scans (max 15 requests per minute per IP)
const assessLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 15,
  message: "Too many integrity assessment requests. Please wait before scanning again.",
});

// Helper: Verify authorization to access an evidence item
async function verifyEvidenceAccess(evidenceId: string, userId?: string, userRole?: string) {
  const evidence = await prisma.evidence.findUnique({
    where: { id: evidenceId },
    include: { case: { select: { id: true, leadUserId: true } } },
  });

  if (!evidence) {
    return { status: 404, error: "Evidence not found", evidence: null };
  }

  if (!userId || !userRole) {
    return { status: 401, error: "Unauthorized", evidence: null };
  }

  if (userRole === "ADMINISTRATOR" || userRole === "AUDITOR") {
    return { status: 200, error: "", evidence };
  }

  const isCollectorOrCustodian = evidence.collectedById === userId || evidence.currentCustodianId === userId;
  const isCaseLead = evidence.case && evidence.case.leadUserId === userId;

  if (isCollectorOrCustodian || isCaseLead) {
    return { status: 200, error: "", evidence };
  }

  return { status: 403, error: "Forbidden: You do not have access to this evidence record", evidence: null };
}

// Helper: Verify authorization to access a case
async function verifyCaseAccess(caseId: string, userId?: string, userRole?: string) {
  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      evidence: { select: { collectedById: true, currentCustodianId: true } },
    },
  });

  if (!caseRecord) {
    return { status: 404, error: "Case not found", caseRecord: null };
  }

  if (!userId || !userRole) {
    return { status: 401, error: "Unauthorized", caseRecord: null };
  }

  if (userRole === "ADMINISTRATOR" || userRole === "AUDITOR") {
    return { status: 200, error: "", caseRecord };
  }

  if (userRole === "INVESTIGATOR") {
    if (caseRecord.leadUserId === userId) {
      return { status: 200, error: "", caseRecord };
    }
    const holdsEvidence = caseRecord.evidence.some(
      (e) => e.collectedById === userId || e.currentCustodianId === userId,
    );
    if (holdsEvidence) {
      return { status: 200, error: "", caseRecord };
    }
  }

  return { status: 403, error: "Forbidden: You do not have access to this case", caseRecord: null };
}

// ═══════════════════════════════════════════════════════════════════
// GET /evidence/:id/integrity — Retrieve latest evidence assessment
// ═══════════════════════════════════════════════════════════════════
router.get("/evidence/:id/integrity", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const id = req.params["id"] as string;
    const auth = await verifyEvidenceAccess(id, req.userId, req.userRole);
    if (auth.status !== 200) {
      return res.status(auth.status).json({ error: auth.error });
    }

    let data = await integrityIntelligenceService.getLatestEvidenceAssessment(id);
    // If no prior assessment exists, perform initial baseline assessment
    if (!data.assessment) {
      data = await integrityIntelligenceService.assessEvidenceIntegrity(id, req.userId, "ON_DEMAND");
    }

    return res.json(data);
  } catch (error) {
    console.error("[Integrity API] Evidence integrity fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch evidence integrity assessment" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /evidence/:id/integrity/assess — Trigger on-demand assessment
// ═══════════════════════════════════════════════════════════════════
router.post(
  "/evidence/:id/integrity/assess",
  requireAuth,
  requireRole("ADMINISTRATOR", "INVESTIGATOR", "CUSTODIAN"),
  assessLimiter,
  async (req: AuthedRequest, res: Response) => {
    try {
      const id = req.params["id"] as string;
      const auth = await verifyEvidenceAccess(id, req.userId, req.userRole);
      if (auth.status !== 200) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const result = await integrityIntelligenceService.assessEvidenceIntegrity(id, req.userId, "ON_DEMAND");
      return res.json(result);
    } catch (error) {
      console.error("[Integrity API] Evidence assess error:", error);
      return res.status(500).json({ error: "Failed to execute evidence integrity assessment" });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// GET /cases/:id/integrity — Retrieve latest case readiness assessment
// ═══════════════════════════════════════════════════════════════════
router.get("/cases/:id/integrity", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const id = req.params["id"] as string;
    const auth = await verifyCaseAccess(id, req.userId, req.userRole);
    if (auth.status !== 200) {
      return res.status(auth.status).json({ error: auth.error });
    }

    let data = await integrityIntelligenceService.getLatestCaseAssessment(id);
    if (!data.assessment) {
      data = await integrityIntelligenceService.assessCaseReadiness(id, req.userId, "ON_DEMAND");
    }

    return res.json(data);
  } catch (error) {
    console.error("[Integrity API] Case integrity fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch case integrity readiness" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /cases/:id/integrity/assess — Trigger on-demand case scan
// ═══════════════════════════════════════════════════════════════════
router.post(
  "/cases/:id/integrity/assess",
  requireAuth,
  requireRole("ADMINISTRATOR", "INVESTIGATOR"),
  assessLimiter,
  async (req: AuthedRequest, res: Response) => {
    try {
      const id = req.params["id"] as string;
      const auth = await verifyCaseAccess(id, req.userId, req.userRole);
      if (auth.status !== 200) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const result = await integrityIntelligenceService.assessCaseReadiness(id, req.userId, "ON_DEMAND");
      return res.json(result);
    } catch (error) {
      console.error("[Integrity API] Case assess error:", error);
      return res.status(500).json({ error: "Failed to execute case readiness assessment" });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// GET /integrity/findings — Filterable, role-scoped findings feed
// ═══════════════════════════════════════════════════════════════════
router.get("/integrity/findings", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const status = req.query["status"] as string | undefined;
    const severity = req.query["severity"] as string | undefined;
    const caseId = req.query["caseId"] as string | undefined;
    const evidenceId = req.query["evidenceId"] as string | undefined;
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] || "50"), 10) || 50));

    const andConditions: Array<Record<string, unknown>> = [];

    // Role-based scoping
    if (req.userRole === "INVESTIGATOR" || req.userRole === "CUSTODIAN") {
      andConditions.push({
        OR: [
          { evidence: { collectedById: req.userId! } },
          { evidence: { currentCustodianId: req.userId! } },
          { case: { leadUserId: req.userId! } },
        ],
      });
    }

    if (status && status !== "ALL") {
      andConditions.push({ status });
    }
    if (severity && severity !== "ALL") {
      andConditions.push({ severity });
    }
    if (caseId) {
      andConditions.push({ caseId });
    }
    if (evidenceId) {
      andConditions.push({ evidenceId });
    }

    const where = andConditions.length > 0 ? { AND: andConditions } : {};

    const findings = await prisma.integrityFinding.findMany({
      where,
      orderBy: [{ detectedAt: "desc" }],
      take: limit,
      include: {
        evidence: { select: { id: true, name: true, sha256: true } },
        case: { select: { id: true, title: true } },
      },
    });

    return res.json({
      findings,
      count: findings.length,
    });
  } catch (error) {
    console.error("[Integrity API] Findings list error:", error);
    return res.status(500).json({ error: "Failed to fetch integrity findings" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PATCH /integrity/findings/:id/acknowledge
// ═══════════════════════════════════════════════════════════════════
router.patch(
  "/integrity/findings/:id/acknowledge",
  requireAuth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const id = req.params["id"] as string;
      const result = await integrityIntelligenceService.acknowledgeFinding(id, req.userId!, req.userRole!);
      return res.status(result.status).json(result.data ? result.data : { error: result.error });
    } catch (error) {
      console.error("[Integrity API] Finding acknowledge error:", error);
      return res.status(500).json({ error: "Failed to acknowledge finding" });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// PATCH /integrity/findings/:id/resolve
// ═══════════════════════════════════════════════════════════════════
router.patch(
  "/integrity/findings/:id/resolve",
  requireAuth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const id = req.params["id"] as string;
      const { resolutionNote } = req.body as { resolutionNote?: string };

      const result = await integrityIntelligenceService.resolveFinding(
        id,
        req.userId!,
        req.userRole!,
        resolutionNote || "",
      );
      return res.status(result.status).json(result.data ? result.data : { error: result.error });
    } catch (error) {
      console.error("[Integrity API] Finding resolve error:", error);
      return res.status(500).json({ error: "Failed to resolve finding" });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// GET /integrity/dashboard-summary
// ═══════════════════════════════════════════════════════════════════
router.get("/integrity/dashboard-summary", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const summary = await integrityIntelligenceService.getDashboardSummary(req.userId!, req.userRole!);
    return res.json(summary);
  } catch (error) {
    console.error("[Integrity API] Dashboard summary error:", error);
    return res.status(500).json({ error: "Failed to fetch integrity dashboard summary" });
  }
});

export default router;
