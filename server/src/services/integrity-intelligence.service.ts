import { prisma } from "../db";
import { getStorageAdapter } from "../storage";
import { notificationService } from "./notification.service";
import { alertIntelligenceService } from "./alert-intelligence.service";

export type FindingSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type FindingStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "FALSE_POSITIVE";
export type AssessmentStatus = "HEALTHY" | "NEEDS_REVIEW" | "AT_RISK" | "CRITICAL";
export type AssessmentType = "EVIDENCE" | "CASE";

export interface FindingRuleResult {
  code: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  remediation: string;
  penalty: number;
  evidenceJson?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════
// Deterministic Scoring Engine Rules & Deductions
// ═══════════════════════════════════════════════════════════════════
export const INTEGRITY_PENALTIES: Record<string, number> = {
  HASH_MISMATCH_DETECTED: 60,
  STORAGE_OBJECT_UNAVAILABLE: 40,
  MISSING_CUSTODY_ORIGIN: 25,
  CUSTODY_GAP: 20,
  HASH_NOT_VERIFIED: 15,
  EXCESSIVE_ACCESS_PATTERN: 10,
  INCOMPLETE_EVIDENCE_METADATA: 5,
};

export function scoreToStatus(score: number): AssessmentStatus {
  if (score >= 90) return "HEALTHY";
  if (score >= 70) return "NEEDS_REVIEW";
  if (score >= 40) return "AT_RISK";
  return "CRITICAL";
}

class IntegrityIntelligenceService {
  /**
   * Assess a single evidence artifact based strictly on real operational data
   */
  async assessEvidenceIntegrity(evidenceId: string, actorUserId?: string, source = "ON_DEMAND") {
    const evidence = await prisma.evidence.findUnique({
      where: { id: evidenceId },
      include: {
        case: { select: { id: true, title: true, leadUserId: true } },
        collectedBy: { select: { id: true, name: true } },
        currentCustodian: { select: { id: true, name: true } },
        custodyEvents: {
          orderBy: { timestamp: "asc" },
          select: {
            id: true,
            action: true,
            timestamp: true,
            actorUserId: true,
            fromUserId: true,
            toUserId: true,
          },
        },
      },
    });

    if (!evidence) {
      throw new Error(`Evidence record ${evidenceId} not found`);
    }

    const findingResults: FindingRuleResult[] = [];

    // 1. HASH_MISMATCH_DETECTED check
    // Checked from actual evidence status FLAGGED or verification mismatch audit records
    const isFlagged = evidence.status === "FLAGGED";
    const recentMismatchAudit = await prisma.auditLog.findFirst({
      where: {
        resourceType: "evidence",
        resourceId: evidenceId,
        action: { contains: "mismatch", mode: "insensitive" },
      },
    });

    if (isFlagged || recentMismatchAudit) {
      findingResults.push({
        code: "HASH_MISMATCH_DETECTED",
        severity: "CRITICAL",
        title: "Cryptographic Hash Mismatch / Flagged Status",
        description: "The evidence record is marked FLAGGED or a hash mismatch was intercepted during verification.",
        remediation: "Halt distribution immediately. Quarantine exhibit and inspect source binary against custody log.",
        penalty: INTEGRITY_PENALTIES.HASH_MISMATCH_DETECTED,
        evidenceJson: { status: evidence.status, sha256: evidence.sha256 },
      });
    }

    // 2. STORAGE_OBJECT_UNAVAILABLE check
    // Safe existence check via storage adapter (does NOT leak storage key)
    try {
      const storage = getStorageAdapter();
      // Probe with a 5000ms safety timeout
      const existsPromise = storage.exists(evidence.storageKey);
      const timeoutPromise = new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error("Storage adapter probe timeout")), 5000),
      );
      const exists = await Promise.race([existsPromise, timeoutPromise]);

      if (!exists) {
        findingResults.push({
          code: "STORAGE_OBJECT_UNAVAILABLE",
          severity: "CRITICAL",
          title: "Physical Evidence File Unavailable in Storage",
          description: "The storage object referenced by this evidence record could not be located by the storage adapter.",
          remediation: "Verify storage vault connectivity or restore physical asset from immutable backup.",
          penalty: INTEGRITY_PENALTIES.STORAGE_OBJECT_UNAVAILABLE,
          evidenceJson: { sizeBytes: evidence.sizeBytes, mimeType: evidence.mimeType },
        });
      }
    } catch (storageErr) {
      findingResults.push({
        code: "STORAGE_OBJECT_UNAVAILABLE",
        severity: "CRITICAL",
        title: "Storage Access Error / Probe Failure",
        description: "Unable to verify physical evidence file existence due to storage adapter exception.",
        remediation: "Check storage driver configuration, IAM permissions, or network connectivity.",
        penalty: INTEGRITY_PENALTIES.STORAGE_OBJECT_UNAVAILABLE,
        evidenceJson: { error: storageErr instanceof Error ? storageErr.message : "Storage error" },
      });
    }

    // 3. MISSING_CUSTODY_ORIGIN check
    const hasOriginCreated = evidence.custodyEvents.some((e) => e.action === "CREATED");
    if (!hasOriginCreated) {
      findingResults.push({
        code: "MISSING_CUSTODY_ORIGIN",
        severity: "HIGH",
        title: "Missing Initial Custody Ingestion Origin",
        description: "No CREATED custody entry was found for this evidence record.",
        remediation: "Audit evidence collection records and record an authenticated intake custody event.",
        penalty: INTEGRITY_PENALTIES.MISSING_CUSTODY_ORIGIN,
      });
    }

    // 4. CUSTODY_GAP check
    // Check if the currentCustodian matches the target user of the latest TRANSFERRED event
    const transferEvents = evidence.custodyEvents.filter((e) => e.action === "TRANSFERRED");
    if (transferEvents.length > 0) {
      const latestTransfer = transferEvents[transferEvents.length - 1];
      if (latestTransfer.toUserId && evidence.currentCustodianId && latestTransfer.toUserId !== evidence.currentCustodianId) {
        findingResults.push({
          code: "CUSTODY_GAP",
          severity: "HIGH",
          title: "Custody Continuity Discrepancy",
          description: "Current custodian does not match the recipient specified in the latest transfer event.",
          remediation: "Execute formal custody reconciliation signoff or counter-signature.",
          penalty: INTEGRITY_PENALTIES.CUSTODY_GAP,
          evidenceJson: {
            expectedCustodianId: latestTransfer.toUserId,
            currentCustodianId: evidence.currentCustodianId,
          },
        });
      }
    }

    // 5. HASH_NOT_VERIFIED check
    // Stored SHA-256 exists but no verification in the past 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentVerification = await prisma.auditLog.findFirst({
      where: {
        resourceType: "evidence",
        resourceId: evidenceId,
        action: { in: ["public.verify", "evidence.verify", "integrity.verify"] },
        timestamp: { gte: thirtyDaysAgo },
      },
    });

    if (!recentVerification && evidence.status === "PENDING") {
      findingResults.push({
        code: "HASH_NOT_VERIFIED",
        severity: "MEDIUM",
        title: "Pending Cryptographic Verification",
        description: "This evidence record has not undergone recorded cryptographic verification within the last 30 days.",
        remediation: "Run server-side or public verification to confirm bit-level fingerprint match.",
        penalty: INTEGRITY_PENALTIES.HASH_NOT_VERIFIED,
      });
    }

    // 6. INCOMPLETE_EVIDENCE_METADATA check
    if (!evidence.description || evidence.description.trim().length < 10) {
      findingResults.push({
        code: "INCOMPLETE_EVIDENCE_METADATA",
        severity: "LOW",
        title: "Incomplete Evidence Descriptive Metadata",
        description: "Evidence description is absent or lacks sufficient detail for court readiness.",
        remediation: "Document chain of custody details, collection location, and exhibit notes.",
        penalty: INTEGRITY_PENALTIES.INCOMPLETE_EVIDENCE_METADATA,
      });
    }

    // 7. EXCESSIVE_ACCESS_PATTERN check
    // > 10 downloads in the last 24 hours by the same user
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const downloadEvents = await prisma.custodyEvent.groupBy({
      by: ["actorUserId"],
      where: {
        evidenceId,
        action: "DOWNLOADED",
        timestamp: { gte: oneDayAgo },
      },
      _count: { id: true },
    });

    const highVelocityDownloader = downloadEvents.find((d) => d._count.id > 10);
    if (highVelocityDownloader) {
      findingResults.push({
        code: "EXCESSIVE_ACCESS_PATTERN",
        severity: "MEDIUM",
        title: "High Frequency Download Velocity Detected",
        description: `Over 10 evidence downloads were logged for a single operator within a 24-hour window.`,
        remediation: "Review data export authorization and operator session history.",
        penalty: INTEGRITY_PENALTIES.EXCESSIVE_ACCESS_PATTERN,
        evidenceJson: { downloadCount: highVelocityDownloader._count.id },
      });
    }

    // Calculate score
    let score = 100;
    for (const f of findingResults) {
      score -= f.penalty;
    }
    // Any CRITICAL finding forces evidence into CRITICAL status (score <= 35)
    if (findingResults.some((f) => f.severity === "CRITICAL")) {
      score = Math.min(score, 35);
    }
    score = Math.max(0, Math.min(100, score));
    const status = scoreToStatus(score);

    // Summary counts
    const findingsSummary = {
      total: findingResults.length,
      critical: findingResults.filter((f) => f.severity === "CRITICAL").length,
      high: findingResults.filter((f) => f.severity === "HIGH").length,
      medium: findingResults.filter((f) => f.severity === "MEDIUM").length,
      low: findingResults.filter((f) => f.severity === "LOW").length,
    };

    // Store Assessment atomically
    const assessment = await prisma.$transaction(async (tx) => {
      const createdAssessment = await tx.integrityAssessment.create({
        data: {
          evidenceId,
          caseId: evidence.caseId,
          assessmentType: "EVIDENCE",
          overallScore: score,
          overallStatus: status,
          findingsSummary,
          assessedByUserId: actorUserId || null,
          source,
          engineVersion: "1.0.0",
        },
      });

      // Upsert findings with dedupeKey to avoid duplicate alert storms
      for (const f of findingResults) {
        const dedupeKey = `EVIDENCE:${evidenceId}:${f.code}`;
        await tx.integrityFinding.upsert({
          where: { dedupeKey },
          create: {
            assessmentId: createdAssessment.id,
            evidenceId,
            caseId: evidence.caseId,
            code: f.code,
            severity: f.severity,
            title: f.title,
            description: f.description,
            remediation: f.remediation,
            evidenceJson: f.evidenceJson ? (f.evidenceJson as any) : undefined,
            dedupeKey,
          },
          update: {
            assessmentId: createdAssessment.id,
            severity: f.severity,
            title: f.title,
            description: f.description,
            remediation: f.remediation,
            evidenceJson: f.evidenceJson ? (f.evidenceJson as any) : undefined,
            status: "OPEN", // Re-open if condition persists
            detectedAt: new Date(),
          },
        });
      }

      // Auto-resolve any prior findings whose conditions have cleared
      const currentCodes = new Set(findingResults.map((f) => f.code));
      const staleFindings = await tx.integrityFinding.findMany({
        where: {
          evidenceId,
          status: "OPEN",
          code: { notIn: Array.from(currentCodes) },
        },
      });

      for (const stale of staleFindings) {
        await tx.integrityFinding.update({
          where: { id: stale.id },
          data: {
            status: "RESOLVED",
            resolvedAt: new Date(),
            resolutionNote: "Condition verified cleared during automated integrity assessment.",
          },
        });
      }

      return createdAssessment;
    });

    // Record audit event for on-demand scan
    if (actorUserId) {
      await prisma.auditLog.create({
        data: {
          actorUserId,
          action: "evidence.integrity.assess",
          resourceType: "evidence",
          resourceId: evidenceId,
          detailJson: {
            score,
            status,
            findingCount: findingResults.length,
            assessmentId: assessment.id,
          },
        },
      });
    }

    // Trigger high/critical alert notification if new critical anomaly exists
    if (findingsSummary.critical > 0 && evidence.case?.leadUserId) {
      await alertIntelligenceService.createInvestigationAlert({
        userId: evidence.case.leadUserId,
        type: "INTEGRITY_ALERT",
        severity: "CRITICAL",
        title: `Integrity Alert: ${evidence.name}`,
        message: `Evidence integrity assessment scored ${score}/100 (${status}) with ${findingsSummary.critical} critical finding(s).`,
        link: `/evidence/${evidenceId}`,
        entityType: "EVIDENCE",
        entityId: evidenceId,
        actionRequired: true,
        actionType: "REVIEW_INTEGRITY",
        dedupeKey: `INTEGRITY_ALERT:${evidenceId}:${Date.now().toString().slice(0, -5)}`, // Bounded dedupe
      });
    }

    return this.getLatestEvidenceAssessment(evidenceId);
  }

  /**
   * Assess a case and all child evidence artifacts
   */
  async assessCaseReadiness(caseId: string, actorUserId?: string, source = "ON_DEMAND") {
    const caseRecord = await prisma.case.findUnique({
      where: { id: caseId },
      include: {
        evidence: { select: { id: true } },
        lead: { select: { id: true, name: true } },
      },
    });

    if (!caseRecord) {
      throw new Error(`Case record ${caseId} not found`);
    }

    // Assess child evidence in bounded batches
    const evidenceScores: number[] = [];
    let hasCriticalEvidence = false;
    let hasAtRiskEvidence = false;

    for (const ev of caseRecord.evidence) {
      const evData = await this.assessEvidenceIntegrity(ev.id, actorUserId, "EVENT_TRIGGERED");
      if (evData && evData.assessment) {
        evidenceScores.push(evData.assessment.overallScore);
        if (evData.assessment.overallStatus === "CRITICAL") hasCriticalEvidence = true;
        if (evData.assessment.overallStatus === "AT_RISK") hasAtRiskEvidence = true;
      }
    }

    const caseFindings: FindingRuleResult[] = [];

    // Case-level finding: Empty evidence repository
    if (caseRecord.evidence.length === 0) {
      caseFindings.push({
        code: "EMPTY_CASE_EVIDENCE",
        severity: "MEDIUM",
        title: "No Evidence Associated with Case",
        description: "Case is active but currently has zero registered evidence exhibits.",
        remediation: "Register physical or digital evidence artifacts to initiate chain of custody.",
        penalty: 15,
      });
    }

    // Base score is the average of child evidence scores, or 85 if empty
    let baseScore = evidenceScores.length > 0
      ? Math.round(evidenceScores.reduce((a, b) => a + b, 0) / evidenceScores.length)
      : 85;

    // Apply case-level penalties
    for (const cf of caseFindings) {
      baseScore -= cf.penalty;
    }

    // Critical Non-negotiable Rule: If any evidence is CRITICAL, case cannot exceed AT_RISK or CRITICAL
    if (hasCriticalEvidence) {
      baseScore = Math.min(baseScore, 39);
    } else if (hasAtRiskEvidence) {
      baseScore = Math.min(baseScore, 69);
    }

    const finalScore = Math.max(0, Math.min(100, baseScore));
    const caseStatus = scoreToStatus(finalScore);

    const findingsSummary = {
      total: caseFindings.length,
      critical: hasCriticalEvidence ? 1 : 0,
      high: hasAtRiskEvidence ? 1 : 0,
      medium: caseFindings.filter((f) => f.severity === "MEDIUM").length,
      low: caseFindings.filter((f) => f.severity === "LOW").length,
    };

    const assessment = await prisma.$transaction(async (tx) => {
      const createdAssessment = await tx.integrityAssessment.create({
        data: {
          caseId,
          assessmentType: "CASE",
          overallScore: finalScore,
          overallStatus: caseStatus,
          findingsSummary,
          assessedByUserId: actorUserId || null,
          source,
          engineVersion: "1.0.0",
        },
      });

      for (const f of caseFindings) {
        const dedupeKey = `CASE:${caseId}:${f.code}`;
        await tx.integrityFinding.upsert({
          where: { dedupeKey },
          create: {
            assessmentId: createdAssessment.id,
            caseId,
            code: f.code,
            severity: f.severity,
            title: f.title,
            description: f.description,
            remediation: f.remediation,
            dedupeKey,
          },
          update: {
            assessmentId: createdAssessment.id,
            severity: f.severity,
            title: f.title,
            description: f.description,
            remediation: f.remediation,
            status: "OPEN",
            detectedAt: new Date(),
          },
        });
      }

      return createdAssessment;
    });

    if (actorUserId) {
      await prisma.auditLog.create({
        data: {
          actorUserId,
          action: "case.integrity.assess",
          resourceType: "case",
          resourceId: caseId,
          detailJson: {
            score: finalScore,
            status: caseStatus,
            evidenceCount: caseRecord.evidence.length,
            assessmentId: assessment.id,
          },
        },
      });
    }

    return this.getLatestCaseAssessment(caseId);
  }

  /**
   * Retrieve latest evidence assessment and its open findings
   */
  async getLatestEvidenceAssessment(evidenceId: string) {
    const latest = await prisma.integrityAssessment.findFirst({
      where: { evidenceId, assessmentType: "EVIDENCE" },
      orderBy: { assessedAt: "desc" },
    });

    const findings = await prisma.integrityFinding.findMany({
      where: { evidenceId },
      orderBy: [{ detectedAt: "desc" }],
    });

    return {
      assessment: latest,
      findings,
      disclaimer: "Operational integrity assessment based on EviChain records — does not constitute a legal admissibility determination.",
    };
  }

  /**
   * Retrieve latest case assessment and child evidence summary
   */
  async getLatestCaseAssessment(caseId: string) {
    const latest = await prisma.integrityAssessment.findFirst({
      where: { caseId, assessmentType: "CASE" },
      orderBy: { assessedAt: "desc" },
    });

    const caseFindings = await prisma.integrityFinding.findMany({
      where: { caseId, evidenceId: null },
      orderBy: [{ detectedAt: "desc" }],
    });

    const childEvidence = await prisma.evidence.findMany({
      where: { caseId },
      select: {
        id: true,
        name: true,
        sha256: true,
        status: true,
        sizeBytes: true,
        integrityAssessments: {
          where: { assessmentType: "EVIDENCE" },
          orderBy: { assessedAt: "desc" },
          take: 1,
        },
      },
    });

    const evidenceBreakdown = childEvidence.map((ev) => {
      const lastAssess = ev.integrityAssessments[0] || null;
      return {
        id: ev.id,
        name: ev.name,
        sha256: ev.sha256,
        status: ev.status,
        score: lastAssess?.overallScore ?? null,
        assessmentStatus: lastAssess?.overallStatus ?? "NOT_ASSESSED",
      };
    });

    const distribution = {
      healthy: evidenceBreakdown.filter((e) => e.assessmentStatus === "HEALTHY").length,
      needsReview: evidenceBreakdown.filter((e) => e.assessmentStatus === "NEEDS_REVIEW").length,
      atRisk: evidenceBreakdown.filter((e) => e.assessmentStatus === "AT_RISK").length,
      critical: evidenceBreakdown.filter((e) => e.assessmentStatus === "CRITICAL").length,
      unassessed: evidenceBreakdown.filter((e) => e.assessmentStatus === "NOT_ASSESSED").length,
    };

    return {
      assessment: latest,
      findings: caseFindings,
      evidenceBreakdown,
      distribution,
      disclaimer: "Operational forensic readiness assessment based on EviChain records — does not constitute a legal admissibility determination.",
    };
  }

  /**
   * Acknowledge an integrity finding
   */
  async acknowledgeFinding(findingId: string, userId: string, userRole: string) {
    const finding = await prisma.integrityFinding.findUnique({
      where: { id: findingId },
    });

    if (!finding) {
      return { status: 404, error: "Finding not found" };
    }

    if (userRole === "AUDITOR") {
      return { status: 403, error: "Auditors have read-only access and cannot acknowledge findings." };
    }

    const updated = await prisma.integrityFinding.update({
      where: { id: findingId },
      data: {
        status: "ACKNOWLEDGED",
        acknowledgedAt: new Date(),
        acknowledgedByUserId: userId,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: userId,
        action: "integrity.finding.acknowledge",
        resourceType: "integrity_finding",
        resourceId: findingId,
        detailJson: { code: finding.code, severity: finding.severity },
      },
    });

    return { status: 200, data: updated };
  }

  /**
   * Resolve an integrity finding with required documentation
   */
  async resolveFinding(findingId: string, userId: string, userRole: string, resolutionNote: string) {
    const finding = await prisma.integrityFinding.findUnique({
      where: { id: findingId },
    });

    if (!finding) {
      return { status: 404, error: "Finding not found" };
    }

    if (userRole === "AUDITOR") {
      return { status: 403, error: "Auditors have read-only access and cannot resolve findings." };
    }

    // Special governance rule: HASH_MISMATCH_DETECTED can only be resolved by an ADMINISTRATOR
    if (finding.code === "HASH_MISMATCH_DETECTED" && userRole !== "ADMINISTRATOR") {
      return {
        status: 403,
        error: "Forbidden: Only an Administrator can resolve a cryptographic hash mismatch anomaly.",
      };
    }

    if (!resolutionNote || resolutionNote.trim().length < 5) {
      return {
        status: 400,
        error: "A valid resolution note explaining forensic remediation is required.",
      };
    }

    const updated = await prisma.integrityFinding.update({
      where: { id: findingId },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolvedByUserId: userId,
        resolutionNote: resolutionNote.trim(),
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: userId,
        action: "integrity.finding.resolve",
        resourceType: "integrity_finding",
        resourceId: findingId,
        detailJson: {
          code: finding.code,
          severity: finding.severity,
          resolutionNote: resolutionNote.trim(),
        },
      },
    });

    return { status: 200, data: updated };
  }

  /**
   * Dashboard intelligence summary
   */
  async getDashboardSummary(userId: string, userRole: string) {
    const whereScope: Record<string, unknown> = { status: "OPEN" };

    if (userRole === "INVESTIGATOR" || userRole === "CUSTODIAN") {
      whereScope.OR = [
        { evidence: { collectedById: userId } },
        { evidence: { currentCustodianId: userId } },
        { case: { leadUserId: userId } },
      ];
    }

    const openFindings = await prisma.integrityFinding.findMany({
      where: whereScope,
      orderBy: [{ severity: "desc" }, { detectedAt: "desc" }],
      take: 25,
      include: {
        evidence: { select: { id: true, name: true, sha256: true } },
        case: { select: { id: true, title: true } },
      },
    });

    const criticalCount = openFindings.filter((f) => f.severity === "CRITICAL").length;
    const highCount = openFindings.filter((f) => f.severity === "HIGH").length;
    const mediumCount = openFindings.filter((f) => f.severity === "MEDIUM").length;
    const lowCount = openFindings.filter((f) => f.severity === "LOW").length;

    // Fetch assessed evidence scores
    const evidenceAssessments = await prisma.integrityAssessment.findMany({
      where: { evidenceId: { not: null } },
      orderBy: { assessedAt: "desc" },
      distinct: ["evidenceId"],
      select: { overallScore: true },
    });

    const caseAssessments = await prisma.integrityAssessment.findMany({
      where: { caseId: { not: null } },
      orderBy: { assessedAt: "desc" },
      distinct: ["caseId"],
      select: { overallScore: true },
    });

    const totalEvidenceCount = await prisma.evidence.count();
    const totalCasesCount = await prisma.case.count();

    const avgEv = evidenceAssessments.length > 0
      ? evidenceAssessments.reduce((acc, a) => acc + a.overallScore, 0) / evidenceAssessments.length
      : 100;

    const avgCase = caseAssessments.length > 0
      ? caseAssessments.reduce((acc, a) => acc + a.overallScore, 0) / caseAssessments.length
      : 100;

    const criticalFindings = openFindings
      .filter((f) => f.severity === "CRITICAL")
      .map((f) => ({
        id: f.id,
        title: f.title,
        code: f.code,
        severity: f.severity,
        evidenceId: f.evidenceId,
        caseId: f.caseId,
        detectedAt: f.detectedAt.toISOString(),
        evidence: f.evidence ? { id: f.evidence.id, name: f.evidence.name } : null,
        case: f.case ? { id: f.case.id, title: f.case.title } : null,
      }));

    return {
      openFindingsCount: openFindings.length,
      criticalCount,
      highCount,
      topFindings: openFindings.slice(0, 5),
      averageEvidenceScore: Math.round(avgEv),
      averageCaseScore: Math.round(avgCase),
      evidenceAssessedCount: evidenceAssessments.length,
      totalEvidenceCount,
      casesAssessedCount: caseAssessments.length,
      totalCasesCount,
      findingsDistribution: {
        critical: criticalCount,
        high: highCount,
        medium: mediumCount,
        low: lowCount,
      },
      criticalFindings,
    };
  }
}

export const integrityIntelligenceService = new IntegrityIntelligenceService();
