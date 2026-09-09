import { prisma } from "../db";
import { getStorageAdapter } from "../storage";
import { alertIntelligenceService } from "./alert-intelligence.service";

export interface WorkspaceConfig {
  organizationName: string;
  unitName: string | null;
  jurisdictionLabel: string | null;
  classificationLabel: string;
  environment: string;
  allowPublicVerification: boolean;
}

export interface WorkspaceBriefingData {
  generatedAt: string;
  workspace: WorkspaceConfig;
  systemHealth: {
    api: "operational" | "degraded";
    database: "connected" | "disconnected";
    storage: "accessible" | "unreachable";
    checkedAt: string;
  };
  briefing: {
    criticalFindings: number;
    highPriorityAlerts: number;
    pendingIntegrityAssessments: number;
    activeCases: number;
    custodyActionsRequired: number;
    totalEvidenceInScope: number;
  };
  caseReadiness: {
    healthy: number;
    needsReview: number;
    atRisk: number;
    critical: number;
    unassessed: number;
    totalCases: number;
  };
  queues: {
    assignedToMe: Array<{
      id: string;
      title: string;
      status: string;
      priority: string;
      relationship: "LEAD" | "ASSIGNED" | "CUSTODIAN" | "AUDITOR";
      evidenceCount: number;
      readinessScore: number | null;
      readinessStatus: string;
      openFindingsCount: number;
      updatedAt: string;
    }>;
    needsEvidenceReview: Array<{
      id: string;
      name: string;
      sha256: string;
      status: string;
      caseId?: string | null;
      caseTitle?: string | null;
      highestSeverity: string;
      findingTitle?: string | null;
      score: number | null;
      updatedAt: string;
    }>;
    recentActivity: Array<{
      id: string;
      type: "CUSTODY" | "EVIDENCE_UPLOAD" | "INTEGRITY_ASSESSMENT" | "CASE_UPDATE";
      action: string;
      actorName: string;
      actorRole: string;
      targetId: string;
      targetTitle: string;
      link: string;
      timestamp: string;
    }>;
  };
}

export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  organizationName: "EviChain Secure Workspace",
  unitName: null,
  jurisdictionLabel: null,
  classificationLabel: "AUTHORIZED ACCESS ONLY",
  environment: process.env.NODE_ENV || "development",
  allowPublicVerification: true,
};

class WorkspaceService {
  /**
   * Retrieve active workspace configuration (stored in SystemSetting SYSTEM_CONFIG)
   */
  async getWorkspaceConfig(): Promise<WorkspaceConfig> {
    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: "SYSTEM_CONFIG" },
      });

      if (!setting || !setting.value || typeof setting.value !== "object") {
        return DEFAULT_WORKSPACE_CONFIG;
      }

      const val = setting.value as Record<string, unknown>;
      return {
        organizationName: typeof val.organizationName === "string" && val.organizationName.trim() ? val.organizationName.trim() : DEFAULT_WORKSPACE_CONFIG.organizationName,
        unitName: typeof val.unitName === "string" && val.unitName.trim() ? val.unitName.trim() : null,
        jurisdictionLabel: typeof val.jurisdictionLabel === "string" && val.jurisdictionLabel.trim() ? val.jurisdictionLabel.trim() : null,
        classificationLabel: typeof val.classificationLabel === "string" && val.classificationLabel.trim() ? val.classificationLabel.trim() : DEFAULT_WORKSPACE_CONFIG.classificationLabel,
        environment: process.env.NODE_ENV || "development",
        allowPublicVerification: typeof val.allowPublicVerification === "boolean" ? val.allowPublicVerification : true,
      };
    } catch {
      return DEFAULT_WORKSPACE_CONFIG;
    }
  }

  /**
   * Fast, safe system health status (no internal secrets leaked)
   */
  async getSystemHealthStatus(): Promise<WorkspaceBriefingData["systemHealth"]> {
    let dbStatus: "connected" | "disconnected" = "connected";
    let storageStatus: "accessible" | "unreachable" = "accessible";

    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error("DB timeout")), 3000)),
      ]);
    } catch {
      dbStatus = "disconnected";
    }

    try {
      const storage = getStorageAdapter();
      await storage.exists("__health_probe__");
    } catch {
      storageStatus = "unreachable";
    }

    const apiStatus = dbStatus === "connected" && storageStatus === "accessible" ? "operational" : "degraded";

    return {
      api: apiStatus,
      database: dbStatus,
      storage: storageStatus,
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate comprehensive role-scoped workspace briefing
   */
  async getWorkspaceBriefing(userId: string, userRole: string): Promise<WorkspaceBriefingData> {
    const configPromise = this.getWorkspaceConfig();
    const healthPromise = this.getSystemHealthStatus();

    // ── Build Scope Filters ───────────────────────────────────────────
    const isAuditor = userRole === "AUDITOR";
    const isInvestigator = userRole === "INVESTIGATOR";
    const isCustodian = userRole === "CUSTODIAN";

    // Case scope filter
    let caseWhere: import("@prisma/client").Prisma.CaseWhereInput = {};
    if (isInvestigator || isCustodian) {
      caseWhere = {
        OR: [
          { leadUserId: userId },
          { evidence: { some: { OR: [{ collectedById: userId }, { currentCustodianId: userId }] } } },
        ],
      };
    }

    // Evidence scope filter
    let evidenceWhere: import("@prisma/client").Prisma.EvidenceWhereInput = {};
    if (isInvestigator) {
      evidenceWhere = {
        OR: [
          { collectedById: userId },
          { currentCustodianId: userId },
          { case: { leadUserId: userId } },
        ],
      };
    } else if (isCustodian) {
      evidenceWhere = {
        OR: [
          { currentCustodianId: userId },
          { collectedById: userId },
        ],
      };
    }

    // Integrity finding scope filter
    let findingWhere: import("@prisma/client").Prisma.IntegrityFindingWhereInput = { status: "OPEN" };
    if (isInvestigator || isCustodian) {
      findingWhere = {
        status: "OPEN",
        OR: [
          { evidence: evidenceWhere },
          { case: caseWhere },
        ],
      };
    }

    // ── Execute Parallel Bounded Queries ───────────────────────────────
    const safeDb = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        console.warn("[WorkspaceService safeDb fallback]:", (err as any)?.message || err);
        return fallback;
      }
    };

    const [workspaceConfig, systemHealth] = await Promise.all([configPromise, healthPromise]);

    // Batch 1: Counts & metrics
    const [
      openCriticalFindingsCount,
      openHighFindingsCount,
      activeCasesCount,
      totalEvidenceCount,
      pendingAssessmentsCount,
      custodyActionsCount,
    ] = await Promise.all([
      safeDb(() => prisma.integrityFinding.count({ where: { AND: [findingWhere, { severity: "CRITICAL" }] } }), 0),
      safeDb(() => prisma.integrityFinding.count({ where: { AND: [findingWhere, { severity: "HIGH" }] } }), 0),
      safeDb(() => prisma.case.count({ where: { AND: [caseWhere, { status: { not: "Closed" } }] } }), 0),
      safeDb(() => prisma.evidence.count({ where: evidenceWhere }), 0),
      safeDb(
        () =>
          prisma.evidence.count({
            where: {
              AND: [
                evidenceWhere,
                { integrityAssessments: { none: {} } },
              ],
            },
          }),
        0,
      ),
      safeDb(
        () =>
          isCustodian || isInvestigator
            ? prisma.custodyEvent.count({
                where: {
                  OR: [{ toUserId: userId }, { fromUserId: userId }],
                  timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
                },
              })
            : prisma.custodyEvent.count({
                where: { timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
              }),
        0,
      ),
    ]);

    // Batch 2: Lists & Queues
    const [
      casesWithReadiness,
      needsReviewEvidence,
      recentCustodyEvents,
      recentEvidenceUploads,
    ] = await Promise.all([
      safeDb(
        () =>
          prisma.case.findMany({
            where: caseWhere,
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              leadUserId: true,
              updatedAt: true,
              _count: { select: { evidence: true, integrityFindings: { where: { status: "OPEN" } } } },
              integrityAssessments: {
                where: { assessmentType: "CASE" },
                orderBy: { assessedAt: "desc" },
                take: 1,
                select: { overallScore: true, overallStatus: true },
              },
            },
            orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
            take: 50,
          }),
        [],
      ),
      safeDb(
        () =>
          prisma.evidence.findMany({
            where: {
              AND: [
                evidenceWhere,
                { OR: [{ status: "FLAGGED" }, { integrityFindings: { some: { status: "OPEN" } } }] },
              ],
            },
            select: {
              id: true,
              name: true,
              sha256: true,
              status: true,
              caseId: true,
              updatedAt: true,
              case: { select: { id: true, title: true } },
              integrityFindings: {
                where: { status: "OPEN" },
                orderBy: { detectedAt: "desc" },
                take: 1,
                select: { severity: true, title: true },
              },
              integrityAssessments: {
                where: { assessmentType: "EVIDENCE" },
                orderBy: { assessedAt: "desc" },
                take: 1,
                select: { overallScore: true },
              },
            },
            orderBy: { updatedAt: "desc" },
            take: 5,
          }),
        [],
      ),
      safeDb(
        () =>
          prisma.custodyEvent.findMany({
            where:
              isInvestigator || isCustodian
                ? {
                    evidence: evidenceWhere,
                  }
                : {},
            include: {
              actor: { select: { name: true, role: true } },
              evidence: { select: { id: true, name: true } },
            },
            orderBy: { timestamp: "desc" },
            take: 8,
          }),
        [],
      ),
      safeDb(
        () =>
          prisma.evidence.findMany({
            where: evidenceWhere,
            include: {
              collectedBy: { select: { name: true, role: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 5,
          }),
        [],
      ),
    ]);

    // ── Compute Case Readiness Distribution ────────────────────────────
    let healthyCount = 0;
    let needsReviewCount = 0;
    let atRiskCount = 0;
    let criticalCount = 0;
    let unassessedCount = 0;

    for (const c of casesWithReadiness) {
      const assessment = c.integrityAssessments[0];
      if (!assessment) {
        unassessedCount++;
      } else {
        const st = assessment.overallStatus;
        if (st === "HEALTHY") healthyCount++;
        else if (st === "NEEDS_REVIEW") needsReviewCount++;
        else if (st === "AT_RISK") atRiskCount++;
        else if (st === "CRITICAL") criticalCount++;
        else unassessedCount++;
      }
    }

    // ── Build Work Queue: Assigned to Me ───────────────────────────────
    const assignedToMe = casesWithReadiness.slice(0, 10).map((c) => {
      const latestAssessment = c.integrityAssessments[0];
      let relationship: "LEAD" | "ASSIGNED" | "CUSTODIAN" | "AUDITOR" = "ASSIGNED";
      if (c.leadUserId === userId) {
        relationship = "LEAD";
      } else if (isCustodian) {
        relationship = "CUSTODIAN";
      } else if (isAuditor) {
        relationship = "AUDITOR";
      }

      return {
        id: c.id,
        title: c.title,
        status: c.status,
        priority: c.priority,
        relationship,
        evidenceCount: c._count.evidence,
        readinessScore: latestAssessment ? latestAssessment.overallScore : null,
        readinessStatus: latestAssessment ? latestAssessment.overallStatus : "UNASSESSED",
        openFindingsCount: c._count.integrityFindings,
        updatedAt: c.updatedAt.toISOString(),
      };
    });

    // ── Build Work Queue: Needs Evidence Review ────────────────────────
    const needsEvidenceReviewQueue = needsReviewEvidence.map((ev) => {
      const topFinding = ev.integrityFindings[0];
      const latestAss = ev.integrityAssessments[0];
      return {
        id: ev.id,
        name: ev.name,
        sha256: ev.sha256,
        status: ev.status,
        caseId: ev.caseId,
        caseTitle: ev.case?.title || null,
        highestSeverity: topFinding ? topFinding.severity : (ev.status === "FLAGGED" ? "CRITICAL" : "MEDIUM"),
        findingTitle: topFinding ? topFinding.title : (ev.status === "FLAGGED" ? "Cryptographic hash or custody anomaly flagged" : null),
        score: latestAss ? latestAss.overallScore : null,
        updatedAt: ev.updatedAt.toISOString(),
      };
    });

    // ── Build Unified Activity Stream (Chronologically sorted) ─────────
    const rawActivity: Array<{
      id: string;
      type: "CUSTODY" | "EVIDENCE_UPLOAD" | "INTEGRITY_ASSESSMENT" | "CASE_UPDATE";
      action: string;
      actorName: string;
      actorRole: string;
      targetId: string;
      targetTitle: string;
      link: string;
      timestamp: string;
    }> = [];

    for (const ce of recentCustodyEvents) {
      rawActivity.push({
        id: `custody-${ce.id}`,
        type: "CUSTODY",
        action: `Custody Action: ${ce.action}`,
        actorName: ce.actor?.name || "System",
        actorRole: ce.actor?.role || "OPERATOR",
        targetId: ce.evidenceId,
        targetTitle: ce.evidence?.name || "Evidence Exhibit",
        link: `/evidence/${ce.evidenceId}`,
        timestamp: ce.timestamp.toISOString(),
      });
    }

    for (const up of recentEvidenceUploads) {
      rawActivity.push({
        id: `upload-${up.id}`,
        type: "EVIDENCE_UPLOAD",
        action: "Evidence Ingested & SHA-256 Registered",
        actorName: up.collectedBy?.name || "Investigator",
        actorRole: up.collectedBy?.role || "INVESTIGATOR",
        targetId: up.id,
        targetTitle: up.name,
        link: `/evidence/${up.id}`,
        timestamp: up.createdAt.toISOString(),
      });
    }

    rawActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const recentActivity = rawActivity.slice(0, 10);

    return {
      generatedAt: new Date().toISOString(),
      workspace: workspaceConfig,
      systemHealth,
      briefing: {
        criticalFindings: openCriticalFindingsCount,
        highPriorityAlerts: openHighFindingsCount,
        pendingIntegrityAssessments: pendingAssessmentsCount,
        activeCases: activeCasesCount,
        custodyActionsRequired: custodyActionsCount,
        totalEvidenceInScope: totalEvidenceCount,
      },
      caseReadiness: {
        healthy: healthyCount,
        needsReview: needsReviewCount,
        atRisk: atRiskCount,
        critical: criticalCount,
        unassessed: unassessedCount,
        totalCases: casesWithReadiness.length,
      },
      queues: {
        assignedToMe,
        needsEvidenceReview: needsEvidenceReviewQueue,
        recentActivity,
      },
    };
  }
}

export const workspaceService = new WorkspaceService();
