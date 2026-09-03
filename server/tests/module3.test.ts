import assert from "assert";
process.env.NODE_ENV = "test";
import { app } from "../src/index";
import { prisma, connectDb, disconnectDb } from "../src/db";
import { signAccessToken, hashPassword } from "../src/auth";

let BASE_URL = "";


async function runModule3Tests() {
  console.log("=== MODULE 3: CASE MANAGEMENT TEST SUITE ===\n");
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    return (async () => {
      try {
        await fn();
        console.log(`✓ [PASS] ${name}`);
        passed++;
      } catch (err: unknown) {
        console.error(`✗ [FAIL] ${name}:`, (err as Error).message);
        failed++;
      }
    })();
  }

  await connectDb();

  const testServer = app.listen(0);
  const addr = testServer.address() as import("net").AddressInfo;
  BASE_URL = `http://localhost:${addr.port}`;


  // Setup test users: Admin, Investigator, Auditor
  const ts = Date.now();
  const passwordHash = await hashPassword("TestPassword@123");

  const admin = await prisma.user.create({
    data: {
      email: `admin_case_${ts}@test.internal`,
      name: "Case Test Admin",
      role: "ADMINISTRATOR",
      passwordHash,
    },
  });
  const adminToken = signAccessToken(admin.id, "ADMINISTRATOR");

  const inv = await prisma.user.create({
    data: {
      email: `inv_case_${ts}@test.internal`,
      name: "Case Test Investigator",
      role: "INVESTIGATOR",
      passwordHash,
    },
  });
  const invToken = signAccessToken(inv.id, "INVESTIGATOR");

  const auditor = await prisma.user.create({
    data: {
      email: `auditor_case_${ts}@test.internal`,
      name: "Case Test Auditor",
      role: "AUDITOR",
      passwordHash,
    },
  });
  const auditorToken = signAccessToken(auditor.id, "AUDITOR");

  let createdCaseId = "";

  // ── 1. Validation & Role Access Tests ─────────────────────────────
  await test("Auth: Rejects unauthenticated request to GET /cases", async () => {
    const res = await fetch(`${BASE_URL}/cases`);
    assert.strictEqual(res.status, 401);
  });

  await test("Auth: Rejects case creation from AUDITOR role (403 Forbidden)", async () => {
    const res = await fetch(`${BASE_URL}/cases`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auditorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Unauthorized Auditor Case",
      }),
    });
    assert.strictEqual(res.status, 403);
  });

  await test("Validation: Rejects case creation with invalid title (<2 chars)", async () => {
    const res = await fetch(`${BASE_URL}/cases`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${invToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "A",
      }),
    });
    assert.strictEqual(res.status, 400);
  });

  // ── 2. Case Creation Tests ────────────────────────────────────────
  await test("Case: Investigator creates case with valid fields", async () => {
    const res = await fetch(`${BASE_URL}/cases`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${invToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: `Operation Phoenix ${ts}`,
        description: "Forensic breach investigation of primary database.",
        priority: "High",
        status: "Active",
      }),
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.title, `Operation Phoenix ${ts}`);
    assert.strictEqual(data.priority, "High");
    assert.strictEqual(data.status, "Active");
    assert.strictEqual(data.lead.id, inv.id);
    createdCaseId = data.id;
  });

  await test("Audit: Verifies case.create audit log was created", async () => {
    const log = await prisma.auditLog.findFirst({
      where: { resourceId: createdCaseId, action: "case.create" },
    });
    assert(log !== null, "Audit log for case creation not found");
    assert.strictEqual(log?.actorUserId, inv.id);
  });

  // ── 3. Case Listing & Filtering Tests ─────────────────────────────
  await test("Case: Lists cases with evidenceCount and lead user", async () => {
    const res = await fetch(`${BASE_URL}/cases`, {
      headers: { Authorization: `Bearer ${invToken}` },
    });
    assert.strictEqual(res.status, 200);
    const list = await res.json();
    assert(Array.isArray(list));
    const target = list.find((c) => c.id === createdCaseId);
    assert(target !== undefined);
    assert.strictEqual(typeof target.evidenceCount, "number");
  });

  await test("Case: Filters cases by status (Active)", async () => {
    const res = await fetch(`${BASE_URL}/cases?status=Active`, {
      headers: { Authorization: `Bearer ${invToken}` },
    });
    assert.strictEqual(res.status, 200);
    const list = await res.json();
    assert(list.every((c: { status: string }) => c.status.toLowerCase() === "active"));
  });

  await test("Case: Filters cases by search query (?q=Phoenix)", async () => {
    const res = await fetch(`${BASE_URL}/cases?q=Phoenix`, {
      headers: { Authorization: `Bearer ${invToken}` },
    });
    assert.strictEqual(res.status, 200);
    const list = await res.json();
    assert(list.some((c: { id: string }) => c.id === createdCaseId));
  });

  // ── 4. Case Detail & Update Tests ─────────────────────────────────
  await test("Case: Retrieves case detail with evidence array", async () => {
    const res = await fetch(`${BASE_URL}/cases/${createdCaseId}`, {
      headers: { Authorization: `Bearer ${invToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.id, createdCaseId);
    assert(Array.isArray(data.evidence));
  });

  await test("Case: Returns 404 for non-existent case ID", async () => {
    const res = await fetch(`${BASE_URL}/cases/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: `Bearer ${invToken}` },
    });
    assert.strictEqual(res.status, 404);
  });

  await test("Case: Updates case priority and description", async () => {
    const res = await fetch(`${BASE_URL}/cases/${createdCaseId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${invToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        priority: "Critical",
        description: "Updated: Breached database contained encrypted secrets.",
      }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.priority, "Critical");
  });

  // ── 5. Case Comments & Mentions Tests ─────────────────────────────
  let commentId = "";
  await test("Case: Adds comment with @mention to case", async () => {
    const res = await fetch(`${BASE_URL}/cases/${createdCaseId}/comments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${invToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: `Attn @[Case Test Admin](${admin.id}), preliminary findings attached.`,
        mentions: [{ userId: admin.id, userName: "Case Test Admin" }],
      }),
    });
    assert.strictEqual(res.status, 201);
    const comment = await res.json();
    assert.strictEqual(comment.caseId, createdCaseId);
    commentId = comment.id;
  });

  await test("Case: Adds nested reply to existing comment", async () => {
    const res = await fetch(`${BASE_URL}/cases/${createdCaseId}/comments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: "Acknowledged, reviewing the evidence items now.",
        parentId: commentId,
      }),
    });
    assert.strictEqual(res.status, 201);
    const reply = await res.json();
    assert.strictEqual(reply.parentId, commentId);
  });

  await test("Case: Lists case comments with nested replies", async () => {
    const res = await fetch(`${BASE_URL}/cases/${createdCaseId}/comments`, {
      headers: { Authorization: `Bearer ${invToken}` },
    });
    assert.strictEqual(res.status, 200);
    const comments = await res.json();
    assert(comments.length >= 1);
    const parent = comments.find((c: { id: string }) => c.id === commentId);
    assert(parent !== undefined);
    assert(parent.replies.length >= 1);
  });

  // ── 6. PDF Report Generation Test ─────────────────────────────────
  await test("Case: Streams Case Intelligence Summary PDF", async () => {
    const res = await fetch(`${BASE_URL}/cases/${createdCaseId}/export/pdf`, {
      headers: { Authorization: `Bearer ${invToken}` },
    });
    assert.strictEqual(res.status, 200);
    assert(res.headers.get("content-type")?.includes("application/pdf"));
    const bytes = await res.arrayBuffer();
    assert(bytes.byteLength > 1000);
  });

  // ── 7. Case Deletion & Cleanup Tests ──────────────────────────────
  await test("Case: Rejects DELETE /cases/:id from non-admin (403)", async () => {
    const res = await fetch(`${BASE_URL}/cases/${createdCaseId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${invToken}` },
    });
    assert.strictEqual(res.status, 403);
  });

  await test("Case: Deletes case as ADMINISTRATOR with clean cascade", async () => {
    const res = await fetch(`${BASE_URL}/cases/${createdCaseId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);

    const deleted = await prisma.case.findUnique({ where: { id: createdCaseId } });
    assert.strictEqual(deleted, null);

    const orphanComments = await prisma.caseComment.findMany({ where: { caseId: createdCaseId } });
    assert.strictEqual(orphanComments.length, 0);
  });

  // Cleanup test users
  await prisma.user.deleteMany({
    where: { id: { in: [admin.id, inv.id, auditor.id] } },
  });

  await new Promise((resolve) => testServer.close(resolve));
  await disconnectDb();


  console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) process.exit(1);
}

runModule3Tests().catch((err) => {
  console.error("Module 3 test suite threw uncaught exception:", err);
  process.exit(1);
});
