import assert from "node:assert";
import http from "node:http";
import { prisma } from "../src/db";
import { app } from "../src";
import { workspaceService } from "../src/services/workspace.service";

const PORT = 4016;
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log("=== MODULE 16: NATIONAL FORENSICS OPERATIONS WORKSPACE ===");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  let inv1Token = "";
  let inv1Id = "";
  let inv2Token = "";
  let inv2Id = "";
  let adminToken = "";
  let adminId = "";
  let auditorToken = "";
  let auditorId = "";

  try {
    const ts = Date.now();

    // 1. Register test users with distinct roles
    const rAdmin = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `m16_admin_${ts}@evichain.test`, password: "Password123!", name: "Admin M16", role: "ADMINISTRATOR" }),
    });
    const dAdmin = (await rAdmin.json()) as { accessToken: string; user: { id: string } };
    adminToken = dAdmin.accessToken;
    adminId = dAdmin.user.id;

    const rInv1 = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `m16_inv1_${ts}@evichain.test`, password: "Password123!", name: "Lead Inv 1", role: "INVESTIGATOR" }),
    });
    const dInv1 = (await rInv1.json()) as { accessToken: string; user: { id: string } };
    inv1Token = dInv1.accessToken;
    inv1Id = dInv1.user.id;

    const rInv2 = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `m16_inv2_${ts}@evichain.test`, password: "Password123!", name: "Other Inv 2", role: "INVESTIGATOR" }),
    });
    const dInv2 = (await rInv2.json()) as { accessToken: string; user: { id: string } };
    inv2Token = dInv2.accessToken;
    inv2Id = dInv2.user.id;

    const rAuditor = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `m16_auditor_${ts}@evichain.test`, password: "Password123!", name: "Auditor M16", role: "AUDITOR" }),
    });
    const dAuditor = (await rAuditor.json()) as { accessToken: string; user: { id: string } };
    auditorToken = dAuditor.accessToken;
    auditorId = dAuditor.user.id;

    console.log("  ✓ Test users registered (Admin, Investigator 1, Investigator 2, Auditor)");

    // Test 1: GET /workspace/config (Public unauthenticated)
    const rConfigPublic = await fetch(`${BASE_URL}/workspace/config`);
    assert.strictEqual(rConfigPublic.status, 200, "Public workspace config must return 200");
    const dConfigPublic = await rConfigPublic.json() as any;
    assert.ok(dConfigPublic.organizationName, "Must return organizationName");
    assert.ok(dConfigPublic.classificationLabel, "Must return classificationLabel");
    console.log("  ✓ Test 1: GET /workspace/config returns public agency settings");

    // Test 2: PUT /workspace/config rejects unauthenticated request
    const rConfigUnauth = await fetch(`${BASE_URL}/workspace/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationName: "Hacked Agency" }),
    });
    assert.strictEqual(rConfigUnauth.status, 401, "Unauthenticated PUT /workspace/config must return 401");
    console.log("  ✓ Test 2: PUT /workspace/config rejects unauthenticated request (401)");

    // Test 3: PUT /workspace/config rejects non-admin role
    const rConfigForbidden = await fetch(`${BASE_URL}/workspace/config`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${inv1Token}`,
      },
      body: JSON.stringify({ organizationName: "Investigator Modified Agency" }),
    });
    assert.strictEqual(rConfigForbidden.status, 403, "Non-admin PUT /workspace/config must return 403");
    console.log("  ✓ Test 3: PUT /workspace/config rejects non-admin user (403)");

    // Test 4: PUT /workspace/config succeeds for Administrator and creates AuditLog
    const testAgencyName = `National Cyber Crime Unit ${ts}`;
    const testUnitName = "Digital Forensics Division";
    const testJurisdiction = "Federal Cyber Jurisdiction";
    const testClassification = "CONFIDENTIAL // LAW ENFORCEMENT";

    const rConfigAdmin = await fetch(`${BASE_URL}/workspace/config`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        organizationName: testAgencyName,
        unitName: testUnitName,
        jurisdictionLabel: testJurisdiction,
        classificationLabel: testClassification,
      }),
    });
    assert.strictEqual(rConfigAdmin.status, 200, "Admin PUT /workspace/config must return 200");
    const dConfigUpdated = await rConfigAdmin.json() as any;
    assert.strictEqual(dConfigUpdated.organizationName, testAgencyName);
    assert.strictEqual(dConfigUpdated.unitName, testUnitName);
    assert.strictEqual(dConfigUpdated.jurisdictionLabel, testJurisdiction);
    assert.strictEqual(dConfigUpdated.classificationLabel, testClassification);

    // Verify audit log
    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        action: "SYSTEM_SETTINGS_UPDATE",
        actorUserId: adminId,
      },
      orderBy: { timestamp: "desc" },
    });
    assert.ok(auditEntry, "Must create SYSTEM_SETTINGS_UPDATE audit log");
    console.log("  ✓ Test 4: PUT /workspace/config updates agency settings and creates audit log");

    // Test 5: GET /workspace/briefing rejects unauthenticated request
    const rBriefingUnauth = await fetch(`${BASE_URL}/workspace/briefing`);
    assert.strictEqual(rBriefingUnauth.status, 401, "Unauthenticated briefing request must return 401");
    console.log("  ✓ Test 5: GET /workspace/briefing rejects unauthenticated request (401)");

    // Test 6: GET /workspace/briefing returns operational health and briefing for Admin
    const rBriefingAdmin = await fetch(`${BASE_URL}/workspace/briefing`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(rBriefingAdmin.status, 200, "Admin briefing must return 200");
    const dBriefingAdmin = await rBriefingAdmin.json() as any;
    assert.strictEqual(dBriefingAdmin.workspace.organizationName, testAgencyName);
    assert.strictEqual(dBriefingAdmin.workspace.unitName, testUnitName);
    assert.ok(dBriefingAdmin.systemHealth, "Must include systemHealth");
    assert.ok(dBriefingAdmin.briefing, "Must include briefing metrics");
    assert.ok(dBriefingAdmin.caseReadiness, "Must include caseReadiness");
    assert.ok(dBriefingAdmin.queues, "Must include queues");
    assert.strictEqual(dBriefingAdmin.systemHealth.api, "operational");
    assert.strictEqual(dBriefingAdmin.systemHealth.database, "connected");
    console.log("  ✓ Test 6: GET /workspace/briefing returns complete operational briefing and health for Admin");

    // Test 7: Role Scoping & Isolation between Investigators
    // Create Case A led by Inv 1
    const rCaseA = await fetch(`${BASE_URL}/cases`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${inv1Token}`,
      },
      body: JSON.stringify({
        title: `Operation CyberStrike Inv1 ${ts}`,
        description: "Case assigned exclusively to Inv 1",
        priority: "High",
        status: "Active",
      }),
    });
    assert.ok(rCaseA.status === 200 || rCaseA.status === 201, "Create Case A must return 200 or 201");
    const dCaseA = (await rCaseA.json()) as { id: string };

    // Create Case B led by Inv 2
    const rCaseB = await fetch(`${BASE_URL}/cases`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${inv2Token}`,
      },
      body: JSON.stringify({
        title: `Operation DarkWeb Inv2 ${ts}`,
        description: "Case assigned exclusively to Inv 2",
        priority: "Critical",
        status: "Active",
      }),
    });
    assert.ok(rCaseB.status === 200 || rCaseB.status === 201, "Create Case B must return 200 or 201");
    const dCaseB = (await rCaseB.json()) as { id: string };

    // Inv 1 Briefing: Should see Case A in assignedToMe, NOT Case B
    const rBriefingInv1 = await fetch(`${BASE_URL}/workspace/briefing`, {
      headers: { Authorization: `Bearer ${inv1Token}` },
    });
    assert.strictEqual(rBriefingInv1.status, 200);
    const dBriefingInv1 = await rBriefingInv1.json() as any;
    const inv1AssignedIds = dBriefingInv1.queues.assignedToMe.map((c: any) => c.id);
    assert.ok(inv1AssignedIds.includes(dCaseA.id), "Inv 1 must see Case A in assignedToMe");
    assert.ok(!inv1AssignedIds.includes(dCaseB.id), "Inv 1 MUST NOT see Case B in assignedToMe (No data leakage)");

    // Inv 2 Briefing: Should see Case B in assignedToMe, NOT Case A
    const rBriefingInv2 = await fetch(`${BASE_URL}/workspace/briefing`, {
      headers: { Authorization: `Bearer ${inv2Token}` },
    });
    assert.strictEqual(rBriefingInv2.status, 200);
    const dBriefingInv2 = await rBriefingInv2.json() as any;
    const inv2AssignedIds = dBriefingInv2.queues.assignedToMe.map((c: any) => c.id);
    assert.ok(inv2AssignedIds.includes(dCaseB.id), "Inv 2 must see Case B in assignedToMe");
    assert.ok(!inv2AssignedIds.includes(dCaseA.id), "Inv 2 MUST NOT see Case A in assignedToMe (No data leakage)");

    console.log("  ✓ Test 7: Investigator role scoping strictly isolates assigned cases and prevents cross-tenant leakage");

    // Test 8: Auditor sees agency-wide cases and readiness
    const rBriefingAuditor = await fetch(`${BASE_URL}/workspace/briefing`, {
      headers: { Authorization: `Bearer ${auditorToken}` },
    });
    assert.strictEqual(rBriefingAuditor.status, 200);
    const dBriefingAuditor = await rBriefingAuditor.json() as any;
    assert.ok(dBriefingAuditor.caseReadiness.totalCases >= 2, "Auditor should see aggregate agency cases count");
    console.log("  ✓ Test 8: Auditor receives agency-wide oversight briefing");

    // Test 9: Workload Queues structure and accuracy
    assert.ok(Array.isArray(dBriefingAdmin.queues.assignedToMe), "assignedToMe must be an array");
    assert.ok(Array.isArray(dBriefingAdmin.queues.needsEvidenceReview), "needsEvidenceReview must be an array");
    assert.ok(Array.isArray(dBriefingAdmin.queues.recentActivity), "recentActivity must be an array");
    console.log("  ✓ Test 9: Workload queues return structured arrays conforming to schema");

    // Test 10: System Health probe sanitization
    const healthStatus = await workspaceService.getSystemHealthStatus();
    assert.strictEqual(healthStatus.api, "operational");
    assert.strictEqual(healthStatus.database, "connected");
    // Ensure no raw passwords, connection strings, or stack traces are present
    const healthStr = JSON.stringify(healthStatus);
    assert.ok(!healthStr.includes("postgresql://"), "Health probe must not leak database connection URL");
    assert.ok(!healthStr.includes("password"), "Health probe must not leak password credentials");
    console.log("  ✓ Test 10: System health probe is sanitized and leaks no infrastructure secrets");

    // Test 11: Direct Service method execution with non-existent user
    const emptyBriefing = await workspaceService.getWorkspaceBriefing("non-existent-user-id", "INVESTIGATOR");
    assert.strictEqual(emptyBriefing.briefing.activeCases, 0);
    assert.strictEqual(emptyBriefing.queues.assignedToMe.length, 0);
    assert.strictEqual(emptyBriefing.queues.needsEvidenceReview.length, 0);
    console.log("  ✓ Test 11: WorkspaceService handles empty datasets gracefully with nominal outputs");

    // Test 12: Dynamic configuration updates reflect immediately
    const rConfigCheck = await fetch(`${BASE_URL}/workspace/config`);
    const dConfigCheck = await rConfigCheck.json() as any;
    assert.strictEqual(dConfigCheck.organizationName, testAgencyName);
    assert.strictEqual(dConfigCheck.classificationLabel, testClassification);
    console.log("  ✓ Test 12: Live configuration changes immediately reflect in workspace context");

    console.log("\n>>> ALL MODULE 16 TESTS PASSED (12/12) <<<");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
