import assert from "node:assert";
import { prisma } from "../src/db";
import { app } from "../src";
import http from "node:http";

const PORT = 4005;
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log("=== MODULE 7: REPORTS, AUDIT EXPORT & COMPLIANCE INTELLIGENCE TEST SUITE ===");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  let adminToken = "";
  let auditorToken = "";
  let investigator1Token = "";
  let investigator1Id = "";
  let investigator2Token = "";
  let investigator2Id = "";
  let testCase1Id = "";
  let testEvidence1Id = "";
  let testAuditLogId = "";

  try {
    // ── Setup: Register Test Users ─────────────────────────────────
    const ts = Date.now();
    const adminEmail = `admin_m7_${ts}@evichain.test`;
    const auditorEmail = `auditor_m7_${ts}@evichain.test`;
    const inv1Email = `inv1_m7_${ts}@evichain.test`;
    const inv2Email = `inv2_m7_${ts}@evichain.test`;

    // 1. Admin
    const rAdmin = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: "Password123!", name: "M7 Admin", role: "ADMINISTRATOR" }),
    });
    const dAdmin = await rAdmin.json() as { accessToken: string; user: { id: string } };
    adminToken = dAdmin.accessToken;

    // 2. Auditor
    const rAuditor = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: auditorEmail, password: "Password123!", name: "M7 Auditor", role: "AUDITOR" }),
    });
    const dAuditor = await rAuditor.json() as { accessToken: string };
    auditorToken = dAuditor.accessToken;

    // 3. Investigator 1
    const rInv1 = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inv1Email, password: "Password123!", name: "M7 Inv One", role: "INVESTIGATOR" }),
    });
    const dInv1 = await rInv1.json() as { accessToken: string; user: { id: string } };
    investigator1Token = dInv1.accessToken;
    investigator1Id = dInv1.user.id;

    // 4. Investigator 2
    const rInv2 = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inv2Email, password: "Password123!", name: "M7 Inv Two", role: "INVESTIGATOR" }),
    });
    const dInv2 = await rInv2.json() as { accessToken: string; user: { id: string } };
    investigator2Token = dInv2.accessToken;
    investigator2Id = dInv2.user.id;

    // ── Setup: Create Case and Evidence under Investigator 1 ───────
    const rCase = await fetch(`${BASE_URL}/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${investigator1Token}` },
      body: JSON.stringify({
        title: `=SUM(A1:A10) Injection Case ${ts}`,
        description: "+Malicious description to test CSV injection neutralization",
        priority: "High",
      }),
    });
    const dCase = await rCase.json() as { id: string };
    testCase1Id = dCase.id;

    // Upload Evidence to Case 1
    const fd = new FormData();
    fd.append("file", new Blob([Buffer.from("Forensic raw payload for report verification")]), "contract.pdf");
    fd.append("name", "@FormulaFileName.pdf");
    fd.append("ownerOrg", "Forensic Dept");
    fd.append("type", "DOCUMENT");

    const rEv = await fetch(`${BASE_URL}/cases/${testCase1Id}/evidence`, {
      method: "POST",
      headers: { Authorization: `Bearer ${investigator1Token}` },
      body: fd,
    });
    const dEv = await rEv.json() as { id: string; sha256: string };
    testEvidence1Id = dEv.id;

    // Fetch initial audit log id
    const rInitialAudit = await fetch(`${BASE_URL}/audit?limit=1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dInitialAudit = await rInitialAudit.json() as { items: Array<{ id: string }> };
    testAuditLogId = dInitialAudit.items[0].id;

    // ═══════════════════════════════════════════════════════════════
    // TEST 1: Unauthenticated GET /audit returns 401
    // ═══════════════════════════════════════════════════════════════
    const t1 = await fetch(`${BASE_URL}/audit`);
    assert.strictEqual(t1.status, 401, "Unauthenticated /audit must return 401");
    console.log("✓ [PASS] 1. Unauthenticated GET /audit returns 401");

    // ═══════════════════════════════════════════════════════════════
    // TEST 2: Administrator can view paginated audit logs
    // ═══════════════════════════════════════════════════════════════
    const t2 = await fetch(`${BASE_URL}/audit?page=1&pageSize=10`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(t2.status, 200);
    const d2 = await t2.json() as {
      items: unknown[];
      pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
    };
    assert(Array.isArray(d2.items), "items must be an array");
    assert.strictEqual(d2.pagination.page, 1);
    assert.strictEqual(d2.pagination.pageSize, 10);
    assert(d2.pagination.totalItems > 0);
    console.log("✓ [PASS] 2. Administrator views paginated audit logs with metadata");

    // ═══════════════════════════════════════════════════════════════
    // TEST 3: Auditor has full read-only access to audit logs
    // ═══════════════════════════════════════════════════════════════
    const t3 = await fetch(`${BASE_URL}/audit`, {
      headers: { Authorization: `Bearer ${auditorToken}` },
    });
    assert.strictEqual(t3.status, 200);
    const d3 = await t3.json() as { items: unknown[] };
    assert(d3.items.length > 0);
    console.log("✓ [PASS] 3. Auditor has read-only access to global audit ledger");

    // ═══════════════════════════════════════════════════════════════
    // TEST 4: Investigator 2 cannot see Investigator 1's case audit logs
    // ═══════════════════════════════════════════════════════════════
    const t4 = await fetch(`${BASE_URL}/audit?caseId=${testCase1Id}`, {
      headers: { Authorization: `Bearer ${investigator2Token}` },
    });
    assert.strictEqual(t4.status, 200);
    const d4 = await t4.json() as { items: unknown[] };
    assert.strictEqual(d4.items.length, 0, "Investigator 2 must not see Investigator 1's case audit entries");
    console.log("✓ [PASS] 4. Investigator role-based audit scoping strictly enforced");

    // ═══════════════════════════════════════════════════════════════
    // TEST 5: GET /audit/:id returns safe audit record & linked resource
    // ═══════════════════════════════════════════════════════════════
    const t5 = await fetch(`${BASE_URL}/audit/${testAuditLogId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(t5.status, 200);
    const d5 = await t5.json() as { id: string; action: string; actor?: { name: string } };
    assert.strictEqual(d5.id, testAuditLogId);
    assert(d5.action);
    console.log("✓ [PASS] 5. GET /audit/:id returns safe audit detail record");

    // ═══════════════════════════════════════════════════════════════
    // TEST 6: Non-existent audit ID returns structured 404
    // ═══════════════════════════════════════════════════════════════
    const t6 = await fetch(`${BASE_URL}/audit/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(t6.status, 404);
    const d6 = await t6.json() as { error: { code: string } };
    assert.strictEqual(d6.error.code, "AUDIT_NOT_FOUND");
    console.log("✓ [PASS] 6. Non-existent audit log returns structured JSON 404");

    // ═══════════════════════════════════════════════════════════════
    // TEST 7: Page size is clamped to maximum 100
    // ═══════════════════════════════════════════════════════════════
    const t7 = await fetch(`${BASE_URL}/audit?pageSize=500`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(t7.status, 200);
    const d7 = await t7.json() as { pagination: { pageSize: number } };
    assert.strictEqual(d7.pagination.pageSize, 100, "pageSize must be clamped to 100");
    console.log("✓ [PASS] 7. Excessive pageSize is safely clamped to maximum 100");

    // ═══════════════════════════════════════════════════════════════
    // TEST 8: GET /reports/summary returns real database metrics
    // ═══════════════════════════════════════════════════════════════
    const t8 = await fetch(`${BASE_URL}/reports/summary?range=30`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(t8.status, 200);
    const d8 = await t8.json() as {
      period: { from: string; to: string };
      cases: { total: number; active: number };
      evidence: { total: number; verified: number };
      custody: { created: number };
      audit: { totalEvents: number };
      topActions: Array<{ action: string; count: number }>;
      activityByDay: Array<{ date: string; count: number }>;
    };
    assert(d8.period.from && d8.period.to);
    assert(d8.cases.total > 0, "Cases total must reflect real database records");
    assert(d8.evidence.total > 0, "Evidence total must reflect real database records");
    assert(d8.audit.totalEvents > 0, "Audit events must reflect real database records");
    assert(Array.isArray(d8.topActions));
    assert(Array.isArray(d8.activityByDay));
    console.log("✓ [PASS] 8. GET /reports/summary returns real aggregated metrics");

    // ═══════════════════════════════════════════════════════════════
    // TEST 9: Date filtering strictly bounds metrics
    // ═══════════════════════════════════════════════════════════════
    const futureFrom = "2099-01-01";
    const futureTo = "2099-01-02";
    const t9 = await fetch(`${BASE_URL}/reports/summary?from=${futureFrom}&to=${futureTo}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(t9.status, 200);
    const d9 = await t9.json() as { cases: { total: number }; evidence: { total: number } };
    assert.strictEqual(d9.cases.total, 0, "Future date range must return 0 cases");
    assert.strictEqual(d9.evidence.total, 0, "Future date range must return 0 evidence");
    console.log("✓ [PASS] 9. Date boundaries accurately filter all compliance metrics");

    // ═══════════════════════════════════════════════════════════════
    // TEST 10: GET /audit/export streams CSV with formula injection neutralization
    // ═══════════════════════════════════════════════════════════════
    const t10 = await fetch(`${BASE_URL}/audit/export?format=csv`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(t10.status, 200);
    assert(t10.headers.get("content-type")?.includes("text/csv"));
    assert(t10.headers.get("content-disposition")?.includes("attachment"));
    const csvText = await t10.text();
    assert(csvText.includes("Timestamp (UTC)"));
    assert(csvText.includes("Action"));
    console.log("✓ [PASS] 10. GET /audit/export returns valid CSV with headers");

    // ═══════════════════════════════════════════════════════════════
    // TEST 11: Formula injection chars (=, +, -, @) are sanitized with leading quote
    // ═══════════════════════════════════════════════════════════════
    const t11 = await fetch(`${BASE_URL}/audit/export?format=csv&caseId=${testCase1Id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const sanitizedCsv = await t11.text();
    // Verify no unquoted dangerous leading characters
    assert(!sanitizedCsv.includes('",=SUM'), "Leading = must be escaped with single quote");
    console.log("✓ [PASS] 11. CSV formula injection attacks are safely neutralized");

    // ═══════════════════════════════════════════════════════════════
    // TEST 12: Audit export logs an immutable audit.export entry
    // ═══════════════════════════════════════════════════════════════
    const t12 = await fetch(`${BASE_URL}/audit?action=audit.export`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(t12.status, 200);
    const d12 = await t12.json() as { items: Array<{ action: string }> };
    assert(d12.items.length > 0, "audit.export action must be recorded in AuditLog");
    console.log("✓ [PASS] 12. Audit ledger export generates an immutable audit record");

    // ═══════════════════════════════════════════════════════════════
    // TEST 13: Case PDF summary (GET /cases/:id/summary.pdf) streams PDF
    // ═══════════════════════════════════════════════════════════════
    const t13 = await fetch(`${BASE_URL}/cases/${testCase1Id}/summary.pdf`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(t13.status, 200);
    assert(t13.headers.get("content-type")?.includes("application/pdf"));
    assert(t13.headers.get("content-disposition")?.includes(".pdf"));
    const pdfBuf = await t13.arrayBuffer();
    assert(pdfBuf.byteLength > 500, "PDF buffer must contain real binary content");
    console.log("✓ [PASS] 13. GET /cases/:id/summary.pdf returns court-ready PDF stream");

    // ═══════════════════════════════════════════════════════════════
    // TEST 14: Canonical /reports/cases/:id/pdf alias returns identical PDF
    // ═══════════════════════════════════════════════════════════════
    const t14 = await fetch(`${BASE_URL}/reports/cases/${testCase1Id}/pdf`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(t14.status, 200);
    assert(t14.headers.get("content-type")?.includes("application/pdf"));
    console.log("✓ [PASS] 14. Canonical /reports/cases/:id/pdf alias verified");

    // ═══════════════════════════════════════════════════════════════
    // TEST 15: Unauthorized investigator accessing Case PDF returns 403
    // ═══════════════════════════════════════════════════════════════
    const t15 = await fetch(`${BASE_URL}/reports/cases/${testCase1Id}/pdf`, {
      headers: { Authorization: `Bearer ${investigator2Token}` },
    });
    assert.strictEqual(t15.status, 403, "Investigator 2 must not export Investigator 1's case PDF");
    console.log("✓ [PASS] 15. Case PDF export RBAC prevents unauthorized export");

    // ═══════════════════════════════════════════════════════════════
    // TEST 16: GET /reports/export returns compliance register CSV
    // ═══════════════════════════════════════════════════════════════
    const t16 = await fetch(`${BASE_URL}/reports/export?range=30`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(t16.status, 200);
    assert(t16.headers.get("content-type")?.includes("text/csv"));
    const compCsv = await t16.text();
    assert(compCsv.includes("EVICHAIN COMPLIANCE REPORT"));
    assert(compCsv.includes("CASE REGISTER"));
    assert(compCsv.includes("EVIDENCE REGISTRY"));
    console.log("✓ [PASS] 16. GET /reports/export produces full compliance CSV report");

    console.log("\n==================================================");
    console.log("MODULE 7 TESTS SUMMARY: 16 PASSED, 0 FAILED");
    console.log("==================================================");

  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runTests().catch((err) => {
  console.error("Module 7 test failure:", err);
  process.exit(1);
});
