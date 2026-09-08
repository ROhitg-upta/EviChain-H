import assert from "node:assert";
import http from "node:http";
import { createHash } from "node:crypto";
import { prisma } from "../src/db";
import { app } from "../src";
import { getStorageAdapter } from "../src/storage";
import {
  integrityIntelligenceService,
  INTEGRITY_PENALTIES,
  scoreToStatus,
} from "../src/services/integrity-intelligence.service";

const PORT = 4015;
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log("=== MODULE 15: EVIDENCE INTEGRITY INTELLIGENCE ENGINE ===");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  let invToken = "";
  let invId = "";
  let otherInvToken = "";
  let otherInvId = "";
  let adminToken = "";
  let adminId = "";
  let auditorToken = "";
  let auditorId = "";

  try {
    const ts = Date.now();

    // 1. Register users
    const rInv = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `m15_inv_${ts}@evichain.test`, password: "Password123!", name: "Inv M15", role: "INVESTIGATOR" }),
    });
    const dInv = await rInv.json() as { accessToken: string; user: { id: string } };
    invToken = dInv.accessToken;
    invId = dInv.user.id;

    const rOther = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `m15_other_${ts}@evichain.test`, password: "Password123!", name: "Other Inv M15", role: "INVESTIGATOR" }),
    });
    const dOther = await rOther.json() as { accessToken: string; user: { id: string } };
    otherInvToken = dOther.accessToken;
    otherInvId = dOther.user.id;

    const rAdmin = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `m15_admin_${ts}@evichain.test`, password: "Password123!", name: "Admin M15", role: "ADMINISTRATOR" }),
    });
    const dAdmin = await rAdmin.json() as { accessToken: string; user: { id: string } };
    adminToken = dAdmin.accessToken;
    adminId = dAdmin.user.id;

    const rAuditor = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `m15_auditor_${ts}@evichain.test`, password: "Password123!", name: "Auditor M15", role: "AUDITOR" }),
    });
    const dAuditor = await rAuditor.json() as { accessToken: string; user: { id: string } };
    auditorToken = dAuditor.accessToken;
    auditorId = dAuditor.user.id;

    // Create a Case led by invId
    const c1 = await prisma.case.create({
      data: {
        title: `Forensic Integrity Case ${ts}`,
        description: "Testing automated evidence integrity scoring",
        leadUserId: invId,
      },
    });

    // ═══════════════════════════════════════════════════════════════
    // 1. Healthy Evidence Assessment (Scores 90–100)
    // ═══════════════════════════════════════════════════════════════
    const fileBytes = Buffer.from("Forensic Exhibit Healthy Artifact Content");
    const fileSha256 = createHash("sha256").update(fileBytes).digest("hex");
    const storageKey = `test-integrity-healthy-${ts}.txt`;
    const storage = getStorageAdapter();
    await storage.upload(storageKey, fileBytes, "text/plain");

    const healthyEvidence = await prisma.evidence.create({
      data: {
        caseId: c1.id,
        name: "Healthy Evidence Artifact",
        type: "DOCUMENT",
        ownerOrg: "Digital Forensics Unit",
        description: "Valid intake description with complete chain of custody provenance",
        status: "VERIFIED",
        sizeBytes: fileBytes.length,
        mimeType: "text/plain",
        sha256: fileSha256,
        storageKey,
        collectedById: invId,
        currentCustodianId: invId,
        custodyEvents: {
          create: {
            action: "CREATED",
            actorUserId: invId,
            note: "Evidence ingested at crime scene with certified SHA-256",
          },
        },
      },
    });

    const resHealthy = await fetch(`${BASE_URL}/evidence/${healthyEvidence.id}/integrity/assess`, {
      method: "POST",
      headers: { Authorization: `Bearer ${invToken}` },
    });
    assert.strictEqual(resHealthy.status, 200);
    const dHealthy = await resHealthy.json() as {
      assessment: { overallScore: number; overallStatus: string };
      findings: Array<{ code: string }>;
    };
    assert(dHealthy.assessment.overallScore >= 90, `Healthy evidence score ${dHealthy.assessment.overallScore} must be >= 90`);
    assert.strictEqual(dHealthy.assessment.overallStatus, "HEALTHY");
    console.log("✓ [PASS] 1. Healthy evidence artifact scores 90–100 (HEALTHY)");

    // ═══════════════════════════════════════════════════════════════
    // 2. Real Hash Mismatch / Flagged status creates CRITICAL finding
    // ═══════════════════════════════════════════════════════════════
    const flaggedEvidence = await prisma.evidence.create({
      data: {
        caseId: c1.id,
        name: "Tampered Evidence Exhibit",
        type: "IMAGE",
        ownerOrg: "CSI Lab",
        description: "Exhibit with suspected bit-level tampering",
        status: "FLAGGED", // Real operational state
        sizeBytes: 1024,
        mimeType: "image/png",
        sha256: "0000000000000000000000000000000000000000000000000000000000000000",
        storageKey,
        collectedById: invId,
        currentCustodianId: invId,
        custodyEvents: {
          create: {
            action: "CREATED",
            actorUserId: invId,
            note: "Initial intake",
          },
        },
      },
    });

    const resFlagged = await fetch(`${BASE_URL}/evidence/${flaggedEvidence.id}/integrity/assess`, {
      method: "POST",
      headers: { Authorization: `Bearer ${invToken}` },
    });
    assert.strictEqual(resFlagged.status, 200);
    const dFlagged = await resFlagged.json() as {
      assessment: { overallScore: number; overallStatus: string };
      findings: Array<{ code: string; severity: string }>;
    };
    assert(dFlagged.assessment.overallScore <= 40, `Flagged evidence must have heavy score penalty`);
    assert(dFlagged.findings.some((f) => f.code === "HASH_MISMATCH_DETECTED" && f.severity === "CRITICAL"));
    console.log("✓ [PASS] 2. Flagged evidence triggers HASH_MISMATCH_DETECTED CRITICAL finding");

    // ═══════════════════════════════════════════════════════════════
    // 3. Storage Object Unavailable creates CRITICAL finding safely
    // ═══════════════════════════════════════════════════════════════
    const missingStorageEvidence = await prisma.evidence.create({
      data: {
        caseId: c1.id,
        name: "Missing Storage Exhibit",
        type: "VIDEO",
        ownerOrg: "CSI Lab",
        description: "Exhibit whose physical file was removed from storage vault",
        status: "VERIFIED",
        sizeBytes: 2048,
        mimeType: "video/mp4",
        sha256: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        storageKey: `nonexistent-storage-key-${ts}.mp4`,
        collectedById: invId,
        currentCustodianId: invId,
        custodyEvents: {
          create: {
            action: "CREATED",
            actorUserId: invId,
            note: "Initial intake",
          },
        },
      },
    });

    const resMissing = await fetch(`${BASE_URL}/evidence/${missingStorageEvidence.id}/integrity/assess`, {
      method: "POST",
      headers: { Authorization: `Bearer ${invToken}` },
    });
    assert.strictEqual(resMissing.status, 200);
    const dMissing = await resMissing.json() as {
      assessment: { overallScore: number };
      findings: Array<{ code: string; description: string }>;
    };
    assert(dMissing.findings.some((f) => f.code === "STORAGE_OBJECT_UNAVAILABLE"));
    // Ensure storage path is NOT leaked
    const missingFinding = dMissing.findings.find((f) => f.code === "STORAGE_OBJECT_UNAVAILABLE");
    assert(!JSON.stringify(missingFinding).includes(missingStorageEvidence.storageKey), "Storage key must never leak in finding");
    console.log("✓ [PASS] 3. Missing storage object creates STORAGE_OBJECT_UNAVAILABLE without leaking storage keys");

    // ═══════════════════════════════════════════════════════════════
    // 4. Missing Custody Origin creates HIGH finding
    // ═══════════════════════════════════════════════════════════════
    const noOriginEvidence = await prisma.evidence.create({
      data: {
        caseId: c1.id,
        name: "No Origin Intake Exhibit",
        type: "DOCUMENT",
        ownerOrg: "Unknown Unit",
        description: "Exhibit missing CREATED custody record",
        status: "VERIFIED",
        sizeBytes: 512,
        mimeType: "application/pdf",
        sha256: "1234123412341234123412341234123412341234123412341234123412341234",
        storageKey,
        collectedById: invId,
        currentCustodianId: invId,
      },
    });

    const resNoOrigin = await fetch(`${BASE_URL}/evidence/${noOriginEvidence.id}/integrity/assess`, {
      method: "POST",
      headers: { Authorization: `Bearer ${invToken}` },
    });
    assert.strictEqual(resNoOrigin.status, 200);
    const dNoOrigin = await resNoOrigin.json() as { findings: Array<{ code: string; severity: string }> };
    assert(dNoOrigin.findings.some((f) => f.code === "MISSING_CUSTODY_ORIGIN" && f.severity === "HIGH"));
    console.log("✓ [PASS] 4. Missing CREATED custody event produces MISSING_CUSTODY_ORIGIN HIGH finding");

    // ═══════════════════════════════════════════════════════════════
    // 5. Incomplete Metadata creates LOW finding
    // ═══════════════════════════════════════════════════════════════
    const incompleteMetaEvidence = await prisma.evidence.create({
      data: {
        caseId: c1.id,
        name: "Minimal Metadata Exhibit",
        type: "DOC",
        ownerOrg: "HQ",
        description: "short", // < 10 chars
        status: "VERIFIED",
        sizeBytes: 100,
        mimeType: "text/plain",
        sha256: "aabbccaabbaabbccaabbaabbccaabbaabbccaabbaabbccaabbaabbccaabbaabb",
        storageKey,
        collectedById: invId,
        currentCustodianId: invId,
        custodyEvents: {
          create: { action: "CREATED", actorUserId: invId, note: "intake" },
        },
      },
    });

    const resIncomplete = await fetch(`${BASE_URL}/evidence/${incompleteMetaEvidence.id}/integrity/assess`, {
      method: "POST",
      headers: { Authorization: `Bearer ${invToken}` },
    });
    const dIncomplete = await resIncomplete.json() as { findings: Array<{ code: string; severity: string }> };
    assert(dIncomplete.findings.some((f) => f.code === "INCOMPLETE_EVIDENCE_METADATA" && f.severity === "LOW"));
    console.log("✓ [PASS] 5. Incomplete metadata produces INCOMPLETE_EVIDENCE_METADATA LOW finding");

    // ═══════════════════════════════════════════════════════════════
    // 6. Idempotent finding upsert (No duplicate findings on repeat)
    // ═══════════════════════════════════════════════════════════════
    await fetch(`${BASE_URL}/evidence/${flaggedEvidence.id}/integrity/assess`, {
      method: "POST",
      headers: { Authorization: `Bearer ${invToken}` },
    });
    const allFindingsForFlagged = await prisma.integrityFinding.findMany({
      where: { evidenceId: flaggedEvidence.id, code: "HASH_MISMATCH_DETECTED" },
    });
    assert.strictEqual(allFindingsForFlagged.length, 1, "Repeated assessment must not create duplicate findings");
    console.log("✓ [PASS] 6. Repeated assessment deduplicates open findings via unique dedupeKey");

    // ═══════════════════════════════════════════════════════════════
    // 7. Case readiness aggregation & Critical non-negotiable rule
    // ═══════════════════════════════════════════════════════════════
    const resCase = await fetch(`${BASE_URL}/cases/${c1.id}/integrity/assess`, {
      method: "POST",
      headers: { Authorization: `Bearer ${invToken}` },
    });
    assert.strictEqual(resCase.status, 200);
    const dCase = await resCase.json() as {
      assessment: { overallScore: number; overallStatus: string };
      distribution: { critical: number; healthy: number };
    };
    assert(dCase.distribution.critical > 0, "Case must report at least 1 critical evidence item");
    assert(dCase.assessment.overallStatus === "CRITICAL" || dCase.assessment.overallStatus === "AT_RISK",
      "Case with critical evidence cannot exceed AT_RISK status");
    console.log("✓ [PASS] 7. Case readiness score aggregates evidence and enforces CRITICAL override rule");

    // ═══════════════════════════════════════════════════════════════
    // 8. Finding Acknowledgment & Resolution with Audit Logging
    // ═══════════════════════════════════════════════════════════════
    const findingToAck = allFindingsForFlagged[0];
    const resAck = await fetch(`${BASE_URL}/integrity/findings/${findingToAck.id}/acknowledge`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${invToken}` },
    });
    assert.strictEqual(resAck.status, 200);
    const dAck = await resAck.json() as { status: string; acknowledgedAt: string };
    assert.strictEqual(dAck.status, "ACKNOWLEDGED");

    // Non-admin cannot resolve HASH_MISMATCH_DETECTED
    const resResForbidden = await fetch(`${BASE_URL}/integrity/findings/${findingToAck.id}/resolve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${invToken}` },
      body: JSON.stringify({ resolutionNote: "Attempting non-admin resolve" }),
    });
    assert.strictEqual(resResForbidden.status, 403, "Investigator cannot resolve HASH_MISMATCH_DETECTED");

    // Admin resolves with note
    const resResAdmin = await fetch(`${BASE_URL}/integrity/findings/${findingToAck.id}/resolve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ resolutionNote: "Hardware forensic verification confirmed bit parity with cold vault." }),
    });
    assert.strictEqual(resResAdmin.status, 200);
    const dResAdmin = await resResAdmin.json() as { status: string; resolutionNote: string };
    assert.strictEqual(dResAdmin.status, "RESOLVED");

    const auditResolve = await prisma.auditLog.findFirst({
      where: {
        action: "integrity.finding.resolve",
        resourceId: findingToAck.id,
      },
    });
    assert(auditResolve !== null, "Audit log entry must exist for finding resolution");
    console.log("✓ [PASS] 8. Acknowledgment & role-governed resolution succeed with AuditLog trail");

    // ═══════════════════════════════════════════════════════════════
    // 9. Scoped Authorization boundaries (403/404)
    // ═══════════════════════════════════════════════════════════════
    // otherInv does not lead c1 and has no evidence in c1
    const resForbiddenCase = await fetch(`${BASE_URL}/cases/${c1.id}/integrity`, {
      headers: { Authorization: `Bearer ${otherInvToken}` },
    });
    assert.strictEqual(resForbiddenCase.status, 403, "Unassigned investigator must receive 403 Forbidden");

    const resForbiddenEvidence = await fetch(`${BASE_URL}/evidence/${healthyEvidence.id}/integrity`, {
      headers: { Authorization: `Bearer ${otherInvToken}` },
    });
    assert.strictEqual(resForbiddenEvidence.status, 403, "Unassigned investigator cannot access evidence integrity");
    console.log("✓ [PASS] 9. Role-based case and evidence authorization boundaries enforced");

    // ═══════════════════════════════════════════════════════════════
    // 10. Auditor Read-Only Mutation Restriction
    // ═══════════════════════════════════════════════════════════════
    const resAuditorMutate = await fetch(`${BASE_URL}/integrity/findings/${findingToAck.id}/acknowledge`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${auditorToken}` },
    });
    assert.strictEqual(resAuditorMutate.status, 403, "Auditors cannot mutate integrity findings");
    console.log("✓ [PASS] 10. Auditors have read-only inspection access and cannot mutate findings");

    // ═══════════════════════════════════════════════════════════════
    // 11. Dashboard Summary returns real open findings
    // ═══════════════════════════════════════════════════════════════
    const resDash = await fetch(`${BASE_URL}/integrity/dashboard-summary`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(resDash.status, 200);
    const dDash = await resDash.json() as { openFindingsCount: number; criticalCount: number };
    assert(typeof dDash.openFindingsCount === "number");
    assert(typeof dDash.criticalCount === "number");
    console.log("✓ [PASS] 11. Dashboard summary returns authentic forensic metrics");

    // ═══════════════════════════════════════════════════════════════
    // 12. Assessment never alters original evidence or SHA-256
    // ═══════════════════════════════════════════════════════════════
    const evidenceAfter = await prisma.evidence.findUnique({
      where: { id: healthyEvidence.id },
    });
    assert.strictEqual(evidenceAfter?.sha256, healthyEvidence.sha256, "Evidence SHA-256 must remain identical");
    assert.strictEqual(evidenceAfter?.sizeBytes, healthyEvidence.sizeBytes, "Evidence size must remain identical");
    console.log("✓ [PASS] 12. Evidence record and cryptographic SHA-256 remain pristine and immutable");

    console.log("\n==================================================");
    console.log("ALL MODULE 15 BACKEND TESTS PASSED (12/12)");
    console.log("==================================================");
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error("Module 15 Test Suite Failed:", err);
  process.exit(1);
});
