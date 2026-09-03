import assert from "assert";
import { createHash } from "crypto";
process.env.NODE_ENV = "test";
import { app } from "../src/index";
import { prisma, connectDb, disconnectDb } from "../src/db";
import { signAccessToken, hashPassword } from "../src/auth";
import { getStorageAdapter } from "../src/storage";

let BASE_URL = "";

async function runModule4Tests() {
  console.log("=== MODULE 4: EVIDENCE UPLOAD & INTEGRITY TEST SUITE ===\n");
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

  const ts = Date.now();
  const passwordHash = await hashPassword("TestPassword@123");

  // Setup roles
  const admin = await prisma.user.create({
    data: {
      email: `admin_ev_${ts}@test.internal`,
      name: "Upload Test Admin",
      role: "ADMINISTRATOR",
      passwordHash,
    },
  });
  const adminToken = signAccessToken(admin.id, "ADMINISTRATOR");

  const inv = await prisma.user.create({
    data: {
      email: `inv_ev_${ts}@test.internal`,
      name: "Upload Test Investigator",
      role: "INVESTIGATOR",
      passwordHash,
    },
  });
  const invToken = signAccessToken(inv.id, "INVESTIGATOR");

  const auditor = await prisma.user.create({
    data: {
      email: `auditor_ev_${ts}@test.internal`,
      name: "Upload Test Auditor",
      role: "AUDITOR",
      passwordHash,
    },
  });
  const auditorToken = signAccessToken(auditor.id, "AUDITOR");

  // Create target test case
  const testCase = await prisma.case.create({
    data: {
      title: `Upload Test Case ${ts}`,
      description: "Case for verifying evidence upload integrity.",
      priority: "High",
      status: "Active",
      leadUserId: inv.id,
    },
  });

  const rawBytes = Buffer.from(`FORENSIC_RAW_PAYLOAD_EVIDENCE_${ts}_VERIFY_INTEGRITY`);
  const expectedSha256 = createHash("sha256").update(rawBytes).digest("hex").toLowerCase();

  let uploadedEvidenceId = "";

  // ── 1. Authentication & Role Tests ──────────────────────────────
  await test("Auth: Unauthenticated upload returns 401", async () => {
    const fd = new FormData();
    fd.append("file", new Blob([rawBytes], { type: "text/plain" }), "test.txt");
    const res = await fetch(`${BASE_URL}/cases/${testCase.id}/evidence`, {
      method: "POST",
      body: fd,
    });
    assert.strictEqual(res.status, 401);
  });

  await test("Auth: AUDITOR upload returns 403 Forbidden", async () => {
    const fd = new FormData();
    fd.append("file", new Blob([rawBytes], { type: "text/plain" }), "test.txt");
    const res = await fetch(`${BASE_URL}/cases/${testCase.id}/evidence`, {
      method: "POST",
      headers: { Authorization: `Bearer ${auditorToken}` },
      body: fd,
    });
    assert.strictEqual(res.status, 403);
  });

  await test("Auth: Non-existent case returns 404", async () => {
    const fd = new FormData();
    fd.append("file", new Blob([rawBytes], { type: "text/plain" }), "test.txt");
    const res = await fetch(`${BASE_URL}/cases/00000000-0000-0000-0000-000000000000/evidence`, {
      method: "POST",
      headers: { Authorization: `Bearer ${invToken}` },
      body: fd,
    });
    assert.strictEqual(res.status, 404);
  });

  // ── 2. Validation Tests ──────────────────────────────────────────
  await test("Validation: Missing file returns 400 JSON", async () => {
    const fd = new FormData();
    fd.append("name", "No File Attached");
    const res = await fetch(`${BASE_URL}/cases/${testCase.id}/evidence`, {
      method: "POST",
      headers: { Authorization: `Bearer ${invToken}` },
      body: fd,
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.code, "FILE_REQUIRED");
  });

  await test("Validation: Empty file (0 bytes) is rejected with 400", async () => {
    const fd = new FormData();
    fd.append("file", new Blob([], { type: "text/plain" }), "empty.txt");
    const res = await fetch(`${BASE_URL}/cases/${testCase.id}/evidence`, {
      method: "POST",
      headers: { Authorization: `Bearer ${invToken}` },
      body: fd,
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert(data.error?.includes("empty"));
  });

  await test("Validation: Disallowed executable file (.exe) returns 400 with forbidden error", async () => {
    const fd = new FormData();
    fd.append("file", new Blob([Buffer.from("MZ malware binary")], { type: "application/octet-stream" }), "malware.exe");
    const res = await fetch(`${BASE_URL}/cases/${testCase.id}/evidence`, {
      method: "POST",
      headers: { Authorization: `Bearer ${invToken}` },
      body: fd,
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert(data.error?.includes("forbidden"));
  });

  await test("Validation: Disallowed MIME type returns 415", async () => {
    const fd = new FormData();
    fd.append("file", new Blob([Buffer.from("custom data")], { type: "application/x-unknown-hacker-type" }), "data.bin");
    const res = await fetch(`${BASE_URL}/cases/${testCase.id}/evidence`, {
      method: "POST",
      headers: { Authorization: `Bearer ${invToken}` },
      body: fd,
    });
    assert.strictEqual(res.status, 415);
  });

  // ── 3. Integrity & Upload Tests ──────────────────────────────────
  await test("Upload: Investigator uploads valid file and receives safe metadata with SHA-256", async () => {
    const fd = new FormData();
    fd.append("file", new Blob([rawBytes], { type: "text/plain" }), "access-log.txt");
    fd.append("name", "Firewall Access Log");
    fd.append("description", "Acquired from perimeter firewall port 443");
    fd.append("evidenceType", "LOG");
    fd.append("fakeHash", "client_attempted_spoofed_hash_abcdef123456");

    const res = await fetch(`${BASE_URL}/cases/${testCase.id}/evidence`, {
      method: "POST",
      headers: { Authorization: `Bearer ${invToken}` },
      body: fd,
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();

    assert.strictEqual(data.caseId, testCase.id);
    assert.strictEqual(data.filename, "Firewall Access Log");
    assert.strictEqual(data.size, rawBytes.length);
    assert.strictEqual(data.mimeType, "text/plain");
    assert.strictEqual(data.sha256, expectedSha256);
    assert.strictEqual(data.uploader.id, inv.id);
    assert.strictEqual(data.uploader.role, "INVESTIGATOR");
    // Ensure internal storage paths are never leaked
    assert.strictEqual(data.storageKey, undefined);
    assert.strictEqual(data.internalPath, undefined);

    uploadedEvidenceId = data.id;
  });

  await test("Integrity: Stored SHA-256 is exactly 64-character lowercase hex", async () => {
    const ev = await prisma.evidence.findUnique({ where: { id: uploadedEvidenceId } });
    assert(ev !== null);
    assert.strictEqual(ev?.sha256.length, 64);
    assert(/^[0-9a-f]{64}$/.test(ev!.sha256));
    assert.strictEqual(ev?.sha256, expectedSha256);
  });

  await test("Storage: File exists in storage and content matches byte-for-byte", async () => {
    const ev = await prisma.evidence.findUnique({ where: { id: uploadedEvidenceId } });
    assert(ev?.storageKey !== undefined);

    const storage = getStorageAdapter();
    const exists = await storage.exists(ev!.storageKey);
    assert.strictEqual(exists, true);

    const storedBuf = await storage.downloadBuffer(ev!.storageKey);
    assert.strictEqual(storedBuf.toString(), rawBytes.toString());
  });

  await test("Custody: Creates initial CREATED custody event", async () => {
    const event = await prisma.custodyEvent.findFirst({
      where: { evidenceId: uploadedEvidenceId, action: "CREATED" },
    });
    assert(event !== null);
    assert.strictEqual(event?.actorUserId, inv.id);
    assert(event?.note.includes("SHA-256 fingerprint"));
  });

  await test("Audit: Creates immutable evidence.create audit log", async () => {
    const log = await prisma.auditLog.findFirst({
      where: { resourceId: uploadedEvidenceId, action: "evidence.create" },
    });
    assert(log !== null);
    assert.strictEqual(log?.actorUserId, inv.id);
    const detail = log?.detailJson as Record<string, unknown>;
    assert.strictEqual(detail["sha256"], expectedSha256);
  });

  await test("Case Integration: Evidence appears in GET /cases/:id", async () => {
    const res = await fetch(`${BASE_URL}/cases/${testCase.id}`, {
      headers: { Authorization: `Bearer ${invToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert(data.evidence.some((e: { id: string }) => e.id === uploadedEvidenceId));
    assert.strictEqual(data.evidenceCount, 1);
  });

  await test("Case Integration: Evidence count updates in GET /cases", async () => {
    const res = await fetch(`${BASE_URL}/cases`, {
      headers: { Authorization: `Bearer ${invToken}` },
    });
    assert.strictEqual(res.status, 200);
    const cases = await res.json();
    const target = cases.find((c: { id: string }) => c.id === testCase.id);
    assert(target !== undefined);
    assert.strictEqual(target.evidenceCount, 1);
  });

  await test("Upload: Administrator upload also succeeds", async () => {
    const fd = new FormData();
    fd.append("file", new Blob([Buffer.from("Admin supplemental evidence")], { type: "text/plain" }), "admin-notes.txt");
    const res = await fetch(`${BASE_URL}/cases/${testCase.id}/evidence`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: fd,
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.uploader.role, "ADMINISTRATOR");
  });

  // Cleanup test data
  await prisma.custodyEvent.deleteMany({ where: { actorUserId: { in: [admin.id, inv.id, auditor.id] } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: [admin.id, inv.id, auditor.id] } } });
  await prisma.evidence.deleteMany({ where: { collectedById: { in: [admin.id, inv.id, auditor.id] } } });
  await prisma.case.deleteMany({ where: { id: testCase.id } });
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, inv.id, auditor.id] } } });

  await new Promise((resolve) => testServer.close(resolve));
  await disconnectDb();

  console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) process.exit(1);
}

runModule4Tests().catch((err) => {
  console.error("Module 4 test suite threw uncaught exception:", err);
  process.exit(1);
});
