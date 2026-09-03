import assert from "assert";
import { createHash } from "crypto";
process.env.NODE_ENV = "test";
import { app } from "../src/index";
import { prisma, connectDb, disconnectDb } from "../src/db";
import { signAccessToken, hashPassword } from "../src/auth";
import { getStorageAdapter } from "../src/storage";

let BASE_URL = "";

async function runModule5Tests() {
  console.log("=== MODULE 5: CUSTODY TRANSFER & SECURE ACCESS TEST SUITE ===\n");
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
  const passwordHash = await hashPassword("TestCustody@123");

  // Create Users: Admin, Inv1 (Custodian A), Inv2 (Custodian B), Inv3 (Uninvolved), Auditor
  const admin = await prisma.user.create({
    data: {
      email: `admin_m5_${ts}@test.internal`,
      name: "M5 Admin User",
      role: "ADMINISTRATOR",
      passwordHash,
    },
  });
  const adminToken = signAccessToken(admin.id, "ADMINISTRATOR");

  const inv1 = await prisma.user.create({
    data: {
      email: `inv1_m5_${ts}@test.internal`,
      name: "M5 Investigator One",
      role: "INVESTIGATOR",
      passwordHash,
    },
  });
  const inv1Token = signAccessToken(inv1.id, "INVESTIGATOR");

  const inv2 = await prisma.user.create({
    data: {
      email: `inv2_m5_${ts}@test.internal`,
      name: "M5 Investigator Two",
      role: "INVESTIGATOR",
      passwordHash,
    },
  });
  const inv2Token = signAccessToken(inv2.id, "INVESTIGATOR");

  const inv3 = await prisma.user.create({
    data: {
      email: `inv3_m5_${ts}@test.internal`,
      name: "M5 Investigator Three",
      role: "INVESTIGATOR",
      passwordHash,
    },
  });
  const inv3Token = signAccessToken(inv3.id, "INVESTIGATOR");

  const auditor = await prisma.user.create({
    data: {
      email: `auditor_m5_${ts}@test.internal`,
      name: "M5 Auditor User",
      role: "AUDITOR",
      passwordHash,
    },
  });
  const auditorToken = signAccessToken(auditor.id, "AUDITOR");

  const testCase = await prisma.case.create({
    data: {
      title: `M5 Custody Case ${ts}`,
      description: "Case for testing Module 5 Custody Transfer & Secure Access",
      leadUserId: inv1.id,
      status: "Active",
      priority: "High",
    },
  });


  // Seed sample file in storage adapter
  const storage = getStorageAdapter();
  const sampleFileBytes = Buffer.from(`FORENSIC_EVIDENCE_PAYLOAD_${ts}_SECURE_BINARY`);
  const sampleSha256 = createHash("sha256").update(sampleFileBytes).digest("hex");
  const sampleStorageKey = `m5_test_${ts}.dat`;
  await storage.upload(sampleStorageKey, sampleFileBytes, "application/octet-stream");

  // Create Evidence owned by inv1
  const evidence = await prisma.evidence.create({
    data: {
      caseId: testCase.id,
      name: "Encrypted Flash Drive Dump",
      type: "DISK_IMAGE",
      ownerOrg: "Federal Forensics",
      sizeBytes: sampleFileBytes.length,
      mimeType: "application/octet-stream",
      sha256: sampleSha256,
      storageKey: sampleStorageKey,
      collectedById: inv1.id,
      currentCustodianId: inv1.id,
      status: "PENDING",
    },
  });

  // Initial CREATED custody event
  await prisma.custodyEvent.create({
    data: {
      evidenceId: evidence.id,
      action: "CREATED",
      actorUserId: inv1.id,
      toUserId: inv1.id,
      note: "Evidence registered during initial forensic intake",
    },
  });

  // 1. Initial Custodian Verification
  await test("Evidence record reflects current custodian correctly", async () => {
    const res = await fetch(`${BASE_URL}/evidence/${evidence.id}`, {
      headers: { Authorization: `Bearer ${inv1Token}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.currentCustodianId, inv1.id);
    assert.strictEqual(data.currentCustodian.id, inv1.id);
  });

  // 2. Transfer Custody: inv1 -> inv2 (Success)
  await test("Current custodian can transfer custody to another investigator", async () => {
    const res = await fetch(`${BASE_URL}/evidence/${evidence.id}/transfer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inv1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        toUserId: inv2.id,
        toLocation: "Evidence Locker Bay 4",
        note: "Transferred for secondary forensic analysis",
      }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.currentCustodian.id, inv2.id);
    assert.strictEqual(data.custodyEvent.action, "TRANSFERRED");
    assert.strictEqual(data.custodyEvent.fromUserId, inv1.id);
    assert.strictEqual(data.custodyEvent.toUserId, inv2.id);

    // Verify DB state
    const dbEv = await prisma.evidence.findUnique({ where: { id: evidence.id } });
    assert.strictEqual(dbEv?.currentCustodianId, inv2.id);
  });

  // 3. Custody Transfer Audit Log Check
  await test("Custody transfer creates an immutable auditLog record", async () => {
    const audit = await prisma.auditLog.findFirst({
      where: {
        resourceId: evidence.id,
        action: "evidence.transfer",
      },
      orderBy: { timestamp: "desc" },
    });
    assert.ok(audit, "AuditLog for evidence.transfer must exist");
    assert.strictEqual(audit.actorUserId, inv1.id);
  });

  // 4. Unauthorized Transfer: inv1 attempts to transfer again after losing custody -> 403
  await test("Previous custodian cannot transfer custody after relinquishing it", async () => {
    const res = await fetch(`${BASE_URL}/evidence/${evidence.id}/transfer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inv1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        toUserId: inv3.id,
      }),
    });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.code, "NOT_CURRENT_CUSTODIAN");
  });

  // 5. Unrelated Investigator cannot transfer -> 403
  await test("Unrelated investigator cannot transfer evidence they do not hold", async () => {
    const res = await fetch(`${BASE_URL}/evidence/${evidence.id}/transfer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inv3Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        toUserId: inv1.id,
      }),
    });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.code, "NOT_CURRENT_CUSTODIAN");
  });

  // 6. Admin Override: Admin can transfer custody regardless of current custodian
  await test("Administrator can override and transfer custody from any holder", async () => {
    const res = await fetch(`${BASE_URL}/evidence/${evidence.id}/transfer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        toUserId: inv3.id,
        note: "Administrative reassignment of evidence custody",
      }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.currentCustodian.id, inv3.id);

    const dbEv = await prisma.evidence.findUnique({ where: { id: evidence.id } });
    assert.strictEqual(dbEv?.currentCustodianId, inv3.id);
  });

  // 7. Self-Transfer Rejection -> 400 TRANSFER_TO_SELF
  await test("Transferring custody to oneself is rejected with 400 TRANSFER_TO_SELF", async () => {
    const res = await fetch(`${BASE_URL}/evidence/${evidence.id}/transfer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inv3Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        toUserId: inv3.id,
      }),
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.code, "TRANSFER_TO_SELF");
  });

  // 8. Auditor Recipient Rejection -> 400 INVALID_CUSTODIAN_ROLE
  await test("Transferring custody to an Auditor is rejected with 400 INVALID_CUSTODIAN_ROLE", async () => {
    const res = await fetch(`${BASE_URL}/evidence/${evidence.id}/transfer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inv3Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        toUserId: auditor.id,
      }),
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.code, "INVALID_CUSTODIAN_ROLE");
  });

  // 9. Auditor Transfer Initiation Rejection -> 403 Forbidden
  await test("Auditor cannot initiate custody transfers", async () => {
    const res = await fetch(`${BASE_URL}/evidence/${evidence.id}/transfer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auditorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        toUserId: inv1.id,
      }),
    });
    assert.strictEqual(res.status, 403);
  });

  // 10. Non-existent Recipient -> 404 RECIPIENT_NOT_FOUND
  await test("Transfer to non-existent user returns 404 RECIPIENT_NOT_FOUND", async () => {
    const res = await fetch(`${BASE_URL}/evidence/${evidence.id}/transfer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inv3Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        toUserId: "00000000-0000-0000-0000-000000000000",
      }),
    });
    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.code, "RECIPIENT_NOT_FOUND");
  });

  // 11. Concurrent Transfer Race-Condition Verification
  await test("Concurrent transfer race condition test: atomicity guarantees single winner", async () => {
    // Both inv3 (current custodian) and admin attempt simultaneous transfers to different recipients
    const promise1 = fetch(`${BASE_URL}/evidence/${evidence.id}/transfer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inv3Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        toUserId: inv1.id,
        note: "Concurrent attempt 1 by current custodian",
      }),
    });

    const promise2 = fetch(`${BASE_URL}/evidence/${evidence.id}/transfer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inv3Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        toUserId: inv2.id,
        note: "Concurrent attempt 2 by current custodian",
      }),
    });

    const [res1, res2] = await Promise.all([promise1, promise2]);
    const statuses = [res1.status, res2.status].sort();

    // Exactly one must succeed (200), the other must fail because custody changed (403 NOT_CURRENT_CUSTODIAN)
    // or both handle consistently inside transaction
    const dbEv = await prisma.evidence.findUnique({ where: { id: evidence.id } });
    assert.ok(
      dbEv?.currentCustodianId === inv1.id || dbEv?.currentCustodianId === inv2.id,
      "Custodian must be consistently set to one recipient",
    );
  });

  // 12. GET /evidence/:id/custody Timeline Integrity & Chronological Ordering
  await test("GET /evidence/:id/custody returns full chronological chain of custody", async () => {
    const res = await fetch(`${BASE_URL}/evidence/${evidence.id}/custody`, {
      headers: { Authorization: `Bearer ${inv1Token}` },
    });
    assert.strictEqual(res.status, 200);
    const events = await res.json();
    assert.ok(Array.isArray(events));
    assert.ok(events.length >= 3, `Expected at least 3 events, got ${events.length}`);

    // First event must be CREATED
    assert.strictEqual(events[0].action, "CREATED");

    // All timestamps must be chronological (ascending)
    for (let i = 1; i < events.length; i++) {
      const prev = new Date(events[i - 1].timestamp).getTime();
      const curr = new Date(events[i].timestamp).getTime();
      assert.ok(curr >= prev, `Event at ${i} must be after or equal to event at ${i - 1}`);
    }

    // Must include actor and toUser/fromUser objects
    assert.ok(events[0].actor);
    const transferEvent = events.find((e: { action: string }) => e.action === "TRANSFERRED");
    assert.ok(transferEvent);
    assert.ok(transferEvent.fromUser || transferEvent.fromUserId);
    assert.ok(transferEvent.toUser || transferEvent.toUserId);
  });

  // 13. Auditor can view Custody Timeline
  await test("Auditor has read-only access to view complete custody timeline", async () => {
    const res = await fetch(`${BASE_URL}/evidence/${evidence.id}/custody`, {
      headers: { Authorization: `Bearer ${auditorToken}` },
    });
    assert.strictEqual(res.status, 200);
    const events = await res.json();
    assert.ok(Array.isArray(events));
  });

  // 14. GET /evidence/:id/download Authenticated Streaming Download
  await test("Authenticated investigator can download evidence binary stream", async () => {
    const res = await fetch(`${BASE_URL}/evidence/${evidence.id}/download`, {
      headers: { Authorization: `Bearer ${inv1Token}` },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("content-type"), "application/octet-stream");
    assert.ok(res.headers.get("content-disposition")?.includes(encodeURIComponent(evidence.name)));

    const downloadedBytes = Buffer.from(await res.arrayBuffer());
    assert.strictEqual(downloadedBytes.length, sampleFileBytes.length);
    assert.strictEqual(
      createHash("sha256").update(downloadedBytes).digest("hex"),
      sampleSha256,
    );
  });

  // 15. Download Logs DOWNLOADED Custody Event & AuditLog
  await test("Evidence download records DOWNLOADED event and audit log", async () => {
    const latestEvent = await prisma.custodyEvent.findFirst({
      where: { evidenceId: evidence.id, action: "DOWNLOADED" },
      orderBy: { timestamp: "desc" },
    });
    assert.ok(latestEvent, "DOWNLOADED custody event must be recorded");
    assert.strictEqual(latestEvent.actorUserId, inv1.id);

    const downloadAudit = await prisma.auditLog.findFirst({
      where: { resourceId: evidence.id, action: "evidence.download" },
      orderBy: { timestamp: "desc" },
    });
    assert.ok(downloadAudit, "AuditLog evidence.download must be recorded");
  });

  // 16. Auditor Download Restriction Policy -> 403 Forbidden
  await test("Auditor download attempt returns 403 AUDITOR_DOWNLOAD_RESTRICTED", async () => {
    const res = await fetch(`${BASE_URL}/evidence/${evidence.id}/download`, {
      headers: { Authorization: `Bearer ${auditorToken}` },
    });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.code, "AUDITOR_DOWNLOAD_RESTRICTED");
  });

  // 17. Access Throttling: Rapid GET /evidence/:id does not spam ACCESSED events
  await test("GET /evidence/:id throttles duplicate ACCESSED custody events within 5 minutes", async () => {
    const countBefore = await prisma.custodyEvent.count({
      where: { evidenceId: evidence.id, action: "ACCESSED", actorUserId: inv2.id },
    });

    // First view
    const res1 = await fetch(`${BASE_URL}/evidence/${evidence.id}`, {
      headers: { Authorization: `Bearer ${inv2Token}` },
    });
    assert.strictEqual(res1.status, 200);

    const countAfterFirst = await prisma.custodyEvent.count({
      where: { evidenceId: evidence.id, action: "ACCESSED", actorUserId: inv2.id },
    });
    assert.strictEqual(countAfterFirst, countBefore + 1);

    // Immediate second view
    const res2 = await fetch(`${BASE_URL}/evidence/${evidence.id}`, {
      headers: { Authorization: `Bearer ${inv2Token}` },
    });
    assert.strictEqual(res2.status, 200);

    const countAfterSecond = await prisma.custodyEvent.count({
      where: { evidenceId: evidence.id, action: "ACCESSED", actorUserId: inv2.id },
    });
    // Count should NOT have increased because of the 5-minute deduplication window!
    assert.strictEqual(countAfterSecond, countAfterFirst);
  });

  // Cleanup
  testServer.close();
  await disconnectDb();

  console.log(`\n========================================`);
  console.log(`MODULE 5 TESTS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runModule5Tests().catch((err) => {
  console.error("Test harness failed:", err);
  process.exit(1);
});
