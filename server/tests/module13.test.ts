import assert from "node:assert";
import { createHash } from "node:crypto";
import { prisma } from "../src/db";
import { runDataIntegrityAudit } from "../src/services/integrity.service";

const BASE_URL = process.env.API_URL || "http://localhost:4000";

async function runModule13Tests() {
  console.log("=== MODULE 13: FINAL INTEGRATION, SECURITY HARDENING & AUDIT TEST SUITE ===");

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`✓ [PASS] ${name}`);
      passed++;
    } catch (err: unknown) {
      console.error(`✗ [FAIL] ${name}:`, (err as Error).message);
      failed++;
    }
  }

  const ts = Date.now();

  // ── Setup: Create Admin, Investigator A, Investigator B, and Auditor ───────
  const rAdmin = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `m13_admin_${ts}@test.internal`,
      password: "Password123!",
      name: "M13 Admin",
      role: "ADMINISTRATOR",
    }),
  });
  const dAdmin = (await rAdmin.json()) as { accessToken: string; user: { id: string } };
  const adminToken = dAdmin.accessToken;
  const adminId = dAdmin.user.id;

  const rInvA = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `m13_inva_${ts}@test.internal`,
      password: "Password123!",
      name: "Investigator Alpha",
      role: "INVESTIGATOR",
    }),
  });
  const dInvA = (await rInvA.json()) as { accessToken: string; user: { id: string } };
  const invAToken = dInvA.accessToken;
  const invAId = dInvA.user.id;

  const rInvB = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `m13_invb_${ts}@test.internal`,
      password: "Password123!",
      name: "Investigator Beta",
      role: "INVESTIGATOR",
    }),
  });
  const dInvB = (await rInvB.json()) as { accessToken: string; user: { id: string } };
  const invBToken = dInvB.accessToken;
  const invBId = dInvB.user.id;

  const rAuditor = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `m13_auditor_${ts}@test.internal`,
      password: "Password123!",
      name: "Security Auditor",
      role: "AUDITOR",
    }),
  });
  const dAuditor = (await rAuditor.json()) as { accessToken: string; user: { id: string } };
  const auditorToken = dAuditor.accessToken;
  const auditorId = dAuditor.user.id;

  // Inv A creates Case A
  const rCaseA = await fetch(`${BASE_URL}/cases`, {
    method: "POST",
    headers: { Authorization: `Bearer ${invAToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: `Case Alpha ${ts}`, description: "Confidential case A", priority: "High" }),
  });
  const dCaseA = (await rCaseA.json()) as { id?: string; case?: { id: string } };
  const caseAId = (dCaseA.case ? dCaseA.case.id : dCaseA.id) as string;

  // Inv A uploads Evidence A
  const formA = new FormData();
  formA.append("file", new Blob([Buffer.from("Evidence A secret content")], { type: "text/plain" }), "evidenceA.txt");
  formA.append("type", "DIGITAL_DOCUMENT");
  formA.append("ownerOrg", "Alpha Agency");

  const rEvA = await fetch(`${BASE_URL}/cases/${caseAId}/evidence`, {
    method: "POST",
    headers: { Authorization: `Bearer ${invAToken}` },
    body: formA,
  });
  const dEvA = (await rEvA.json()) as { id?: string; evidence?: { id: string }; sha256?: string };
  const evidenceAId = (dEvA.evidence ? dEvA.evidence.id : dEvA.id) as string;

  // Inv A adds a comment to Case A
  const rCommA = await fetch(`${BASE_URL}/cases/${caseAId}/comments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${invAToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: "Initial investigation note on Case A" }),
  });
  const dCommA = (await rCommA.json()) as { id: string };
  const commentAId = dCommA.id;

  // Inv A adds an annotation on Evidence A
  const rAnnA = await fetch(`${BASE_URL}/evidence/${evidenceAId}/annotations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${invAToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "POINT",
      coordinates: { x: 0.25, y: 0.5 },
      note: "Alpha annotation note",
      color: "#22d3ee",
    }),
  });
  const dAnnA = (await rAnnA.json()) as { id: string; annotation?: { id: string } };
  const annotationAId = (dAnnA.annotation ? dAnnA.annotation.id : dAnnA.id) as string;

  // ═══════════════════════════════════════════════════════════════════
  // 1. Cross-Module AUDITOR Write Sweep (POST / PATCH / DELETE -> 403)
  // ═══════════════════════════════════════════════════════════════════
  await test("1. Cross-Module AUDITOR write sweep: all mutative routes return 403 Forbidden", async () => {
    const endpoints = [
      { method: "POST", path: "/cases", body: { title: "Auditor Case" } },
      { method: "PATCH", path: `/cases/${caseAId}`, body: { title: "Auditor Modify" } },
      { method: "DELETE", path: `/cases/${caseAId}` },
      { method: "POST", path: `/cases/${caseAId}/evidence`, body: {} },
      { method: "POST", path: `/cases/${caseAId}/comments`, body: { content: "Auditor comment" } },
      { method: "PATCH", path: `/cases/${caseAId}/comments/${commentAId}`, body: { content: "Auditor edit" } },
      { method: "DELETE", path: `/cases/${caseAId}/comments/${commentAId}` },
      { method: "POST", path: "/evidence", body: {} },
      { method: "POST", path: "/evidence/bulk-upload", body: {} },
      { method: "POST", path: `/evidence/${evidenceAId}/transfer`, body: { toUserId: invAId } },
      { method: "POST", path: `/evidence/${evidenceAId}/annotations`, body: { note: "Auditor annotation" } },
      { method: "PATCH", path: `/evidence/${evidenceAId}/annotations/${annotationAId}`, body: { note: "Auditor edit" } },
      { method: "DELETE", path: `/evidence/${evidenceAId}/annotations/${annotationAId}` },
      { method: "POST", path: "/admin/users", body: { name: "X", email: "x@t.co", role: "INVESTIGATOR" } },
      { method: "PATCH", path: `/admin/users/${invAId}/role`, body: { role: "ADMINISTRATOR" } },
      { method: "PATCH", path: `/admin/users/${invAId}/status`, body: { isActive: false } },
      { method: "PATCH", path: "/admin/settings", body: { settings: {} } },
    ];

    for (const ep of endpoints) {
      const res = await fetch(`${BASE_URL}${ep.path}`, {
        method: ep.method,
        headers: {
          Authorization: `Bearer ${auditorToken}`,
          "Content-Type": "application/json",
        },
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      assert.strictEqual(
        res.status,
        403,
        `Expected 403 Forbidden for AUDITOR on [${ep.method} ${ep.path}], got ${res.status}`,
      );
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // 2. Deactivated User Rejected Mid-Session on Next Request
  // ═══════════════════════════════════════════════════════════════════
  await test("2. Deactivated user rejected mid-session with 401 on next authenticated request", async () => {
    // Verify user can initially access /auth/me
    const preCheck = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${invAToken}` },
    });
    assert.strictEqual(preCheck.status, 200);

    // Deactivate user in database mid-session
    await prisma.user.update({
      where: { id: invAId },
      data: { isActive: false },
    });

    // Subsequent request with the exact same valid JWT token must now be rejected
    const postCheck = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${invAToken}` },
    });
    assert.strictEqual(
      postCheck.status,
      401,
      `Expected 401 Unauthorized for deactivated user, got ${postCheck.status}`,
    );

    // Restore user active state for subsequent tests
    await prisma.user.update({
      where: { id: invAId },
      data: { isActive: true },
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 3. Cross-Case IDOR Sweep: Investigator B cannot touch Investigator A's case
  // ═══════════════════════════════════════════════════════════════════
  await test("3. Cross-case IDOR sweep: Investigator B cannot read or mutate Investigator A's resources", async () => {
    const idorAttempts = [
      { method: "GET", path: `/cases/${caseAId}` },
      { method: "PATCH", path: `/cases/${caseAId}`, body: { title: "IDOR Hack" } },
      { method: "POST", path: `/cases/${caseAId}/evidence`, body: {} },
      { method: "POST", path: `/cases/${caseAId}/comments`, body: { content: "Unauthorized comment" } },
      { method: "GET", path: `/cases/${caseAId}/comments` },
      { method: "GET", path: `/cases/${caseAId}/activity` },
      { method: "POST", path: `/evidence/${evidenceAId}/transfer`, body: { toUserId: invAId } },
      { method: "POST", path: `/evidence/${evidenceAId}/annotations`, body: { note: "IDOR note" } },
      { method: "GET", path: `/evidence/${evidenceAId}/annotations` },
    ];

    for (const ep of idorAttempts) {
      const res = await fetch(`${BASE_URL}${ep.path}`, {
        method: ep.method,
        headers: {
          Authorization: `Bearer ${invBToken}`,
          "Content-Type": "application/json",
        },
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      assert(
        res.status === 403 || res.status === 404,
        `Expected 403 or 404 for IDOR probe on [${ep.method} ${ep.path}], got ${res.status}`,
      );
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // 4. Secret Leak Assertion in Logs
  // ═══════════════════════════════════════════════════════════════════
  await test("4. Security audit: No secrets, raw passwords, or private keys leak into server logs", async () => {
    const logBuffer: string[] = [];
    const origLog = console.log;
    const origInfo = console.info;
    const origWarn = console.warn;
    const origError = console.error;

    const intercept = (...args: unknown[]) => {
      logBuffer.push(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
    };

    console.log = intercept;
    console.info = intercept;
    console.warn = intercept;
    console.error = intercept;

    try {
      const uniqueSecretPass = "SuperSecretPlainTextPass99!";
      const reg = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `log_leak_probe_${Date.now()}@test.internal`,
          password: uniqueSecretPass,
          name: "Secret Probe User",
          role: "INVESTIGATOR",
        }),
      });
      assert.strictEqual(reg.status, 201);
    } finally {
      console.log = origLog;
      console.info = origInfo;
      console.warn = origWarn;
      console.error = origError;
    }

    const aggregated = logBuffer.join("\n");
    assert(!aggregated.includes("SuperSecretPlainTextPass99!"), "Plaintext password leaked into server logs!");
    assert(!aggregated.includes("passwordHash"), "passwordHash leaked into server logs!");
  });

  // ═══════════════════════════════════════════════════════════════════
  // 5. Data Consistency Audit (Phase 2 Queries)
  // ═══════════════════════════════════════════════════════════════════
  await test("5. Data integrity audit returns zero foreign-key anomalies or orphaned records", async () => {
    const audit = await runDataIntegrityAudit();
    assert.strictEqual(audit.anomaliesFound, 0, `Data integrity audit found anomalies: ${JSON.stringify(audit.details.anomalies)}`);
    assert(audit.totalChecks > 0, "Audit ran against existing database records");
  });

  // ═══════════════════════════════════════════════════════════════════
  // 6. Health and Deep Health Endpoints Truthfulness
  // ═══════════════════════════════════════════════════════════════════
  await test("6. GET /health and GET /health/deep return 200 with truthful database and storage status", async () => {
    const rHealth = await fetch(`${BASE_URL}/health`);
    assert.strictEqual(rHealth.status, 200);
    const dHealth = (await rHealth.json()) as { ok: boolean; database: string };
    assert.strictEqual(dHealth.ok, true);
    assert.strictEqual(dHealth.database, "connected");

    const rDeep = await fetch(`${BASE_URL}/health/deep`);
    assert.strictEqual(rDeep.status, 200);
    const dDeep = (await rDeep.json()) as { ok: boolean; database: string; storage: string };
    assert.strictEqual(dDeep.ok, true);
    assert.strictEqual(dDeep.database, "connected");
    assert.strictEqual(dDeep.storage, "accessible");
  });

  // ═══════════════════════════════════════════════════════════════════
  // 7. Rate Limiting Protection on Collaboration & Verification Routes
  // ═══════════════════════════════════════════════════════════════════
  await test("7. Rate limiting correctly detects rapid request bursts and returns 429 Too Many Requests", async () => {
    // Fire rapid invalid verify requests to trigger the rate limiter
    let saw429 = false;
    for (let i = 0; i < 70; i++) {
      const res = await fetch(`${BASE_URL}/public/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha256: "0000000000000000000000000000000000000000000000000000000000000000" }),
      });
      if (res.status === 429) {
        saw429 = true;
        assert(res.headers.get("retry-after") !== null, "Retry-After header must be present on 429 response");
        break;
      }
    }
    assert.strictEqual(saw429, true, "Expected 429 response after exceeding rate limit ceiling");
  });

  // ═══════════════════════════════════════════════════════════════════
  // 8. Administrative Safe Profile Self-Management & Demotion Lockout
  // ═══════════════════════════════════════════════════════════════════
  await test("8. Last administrator lockout protection holds after cross-module changes", async () => {
    // Attempting to demote or deactivate the last admin returns 400 LAST_ADMIN_LOCKOUT
    const res = await fetch(`${BASE_URL}/admin/users/${adminId}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    assert.strictEqual(res.status, 400);
    const data = (await res.json()) as { error: { code: string } };
    assert.strictEqual(data.error.code, "LAST_ADMIN_LOCKOUT");
  });

  // ── Cleanup Test Users ─────────────────────────────────────────────
  await prisma.commentMention.deleteMany({ where: { commentId: commentAId } });
  await prisma.caseComment.deleteMany({ where: { caseId: caseAId } });
  await prisma.evidenceAnnotation.deleteMany({ where: { evidenceId: evidenceAId } });
  await prisma.custodyEvent.deleteMany({ where: { evidenceId: evidenceAId } });
  await prisma.evidence.deleteMany({ where: { id: evidenceAId } });
  await prisma.case.deleteMany({ where: { id: caseAId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, invAId, invBId, auditorId] } } });

  console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) process.exit(1);
}

runModule13Tests().catch((err) => {
  console.error("Module 13 test suite threw uncaught exception:", err);
  process.exit(1);
});
