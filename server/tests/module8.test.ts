import assert from "node:assert";
import { prisma } from "../src/db";
import { app } from "../src";
import { notificationService } from "../src/services/notification.service";
import http from "node:http";

const PORT = 4006;
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log("=== MODULE 8: NOTIFICATIONS & USER PREFERENCES TEST SUITE ===");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  let user1Token = "";
  let user1Id = "";
  let user2Token = "";
  let user2Id = "";
  let notif1Id = "";
  let notif2Id = "";

  try {
    // ── Setup: Register Test Users ─────────────────────────────────
    const ts = Date.now();
    const email1 = `notif_user1_${ts}@evichain.test`;
    const email2 = `notif_user2_${ts}@evichain.test`;

    const r1 = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email1, password: "Password123!", name: "Notif User One", role: "INVESTIGATOR" }),
    });
    const d1 = await r1.json() as { accessToken: string; user: { id: string } };
    user1Token = d1.accessToken;
    user1Id = d1.user.id;

    const r2 = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email2, password: "Password123!", name: "Notif User Two", role: "INVESTIGATOR" }),
    });
    const d2 = await r2.json() as { accessToken: string; user: { id: string } };
    user2Token = d2.accessToken;
    user2Id = d2.user.id;

    // ═══════════════════════════════════════════════════════════════
    // 1. Notification creation for valid user
    // ═══════════════════════════════════════════════════════════════
    const created1 = await notificationService.createNotification({
      userId: user1Id,
      type: "CASE_CREATED",
      title: "Case Created Test",
      message: "Test message for case creation",
      link: "/cases/123",
      entityType: "CASE",
      entityId: "123",
    });
    assert(created1 !== null && created1.id);
    notif1Id = created1.id;
    console.log("✓ [PASS] 1. Notification successfully created for valid user");

    // ═══════════════════════════════════════════════════════════════
    // 2. Unknown recipient is safely rejected
    // ═══════════════════════════════════════════════════════════════
    const invalidRecipient = await notificationService.createNotification({
      userId: "00000000-0000-0000-0000-000000000000",
      type: "SECURITY_EVENT",
      title: "Invalid User",
      message: "Should not be created",
    });
    assert.strictEqual(invalidRecipient, null);
    console.log("✓ [PASS] 2. Non-existent recipient is safely rejected");

    // ═══════════════════════════════════════════════════════════════
    // 3. Dedupe key prevents duplicate event notifications
    // ═══════════════════════════════════════════════════════════════
    const dedupeKey = `TEST_DEDUPE_${ts}`;
    const firstEmit = await notificationService.createNotification({
      userId: user1Id,
      type: "EVIDENCE_UPLOADED",
      title: "Evidence Upload Event",
      message: "Initial event",
      dedupeKey,
    });
    const duplicateEmit = await notificationService.createNotification({
      userId: user1Id,
      type: "EVIDENCE_UPLOADED",
      title: "Evidence Upload Event Duplicate",
      message: "Duplicate replay event",
      dedupeKey,
    });
    assert(firstEmit !== null && duplicateEmit !== null);
    assert.strictEqual(firstEmit.id, duplicateEmit.id, "Duplicate dedupeKey must return existing record");
    console.log("✓ [PASS] 3. Deduplication key prevents duplicate notifications");

    // ═══════════════════════════════════════════════════════════════
    // 4. Sensitive metadata is not leaked
    // ═══════════════════════════════════════════════════════════════
    const rawRecord = await prisma.notification.findUnique({ where: { id: notif1Id } });
    const strRecord = JSON.stringify(rawRecord);
    assert(!strRecord.includes("password"));
    assert(!strRecord.includes("storageKey"));
    assert(!strRecord.includes("secret"));
    console.log("✓ [PASS] 4. Notification records exclude sensitive storage and auth secrets");

    // ═══════════════════════════════════════════════════════════════
    // 5. Unauthenticated GET /notifications returns 401
    // ═══════════════════════════════════════════════════════════════
    const t5 = await fetch(`${BASE_URL}/notifications`);
    assert.strictEqual(t5.status, 401);
    console.log("✓ [PASS] 5. Unauthenticated GET /notifications returns 401");

    // ═══════════════════════════════════════════════════════════════
    // 6. User receives only their own notifications
    // ═══════════════════════════════════════════════════════════════
    // Create notif for user2
    const created2 = await notificationService.createNotification({
      userId: user2Id,
      type: "CUSTODY_TRANSFER_RECEIVED",
      title: "User 2 Notif",
      message: "Secret transfer for user 2",
    });
    assert(created2 !== null);
    notif2Id = created2.id;

    const t6 = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.strictEqual(t6.status, 200);
    const d6 = await t6.json() as { items: Array<{ id: string; userId: string }> };
    assert(d6.items.every((n) => n.userId === user1Id), "User 1 must only see User 1 notifications");
    assert(!d6.items.some((n) => n.id === notif2Id), "User 1 must not see User 2 notification");
    console.log("✓ [PASS] 6. User scoping strictly enforced for notification lists");

    // ═══════════════════════════════════════════════════════════════
    // 7. User cannot mark another user's notification as read
    // ═══════════════════════════════════════════════════════════════
    const t7 = await fetch(`${BASE_URL}/notifications/${notif2Id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.strictEqual(t7.status, 404, "Accessing another user's notification must return 404");
    console.log("✓ [PASS] 7. User cannot mark another user's notification as read (404)");

    // ═══════════════════════════════════════════════════════════════
    // 8. User cannot delete another user's notification
    // ═══════════════════════════════════════════════════════════════
    const t8 = await fetch(`${BASE_URL}/notifications/${notif2Id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.strictEqual(t8.status, 404);
    console.log("✓ [PASS] 8. User cannot delete another user's notification (404)");

    // ═══════════════════════════════════════════════════════════════
    // 9. Pagination metadata is correct
    // ═══════════════════════════════════════════════════════════════
    const t9 = await fetch(`${BASE_URL}/notifications?page=1&pageSize=10`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.strictEqual(t9.status, 200);
    const d9 = await t9.json() as {
      pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
      unreadCount: number;
    };
    assert.strictEqual(d9.pagination.page, 1);
    assert.strictEqual(d9.pagination.pageSize, 10);
    assert(d9.pagination.totalItems >= 2);
    assert(typeof d9.unreadCount === "number");
    console.log("✓ [PASS] 9. Notification pagination metadata and unreadCount verified");

    // ═══════════════════════════════════════════════════════════════
    // 10. GET /notifications/unread-count returns accurate count
    // ═══════════════════════════════════════════════════════════════
    const t10 = await fetch(`${BASE_URL}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.strictEqual(t10.status, 200);
    const d10 = await t10.json() as { unreadCount: number };
    assert(d10.unreadCount >= 2);
    console.log("✓ [PASS] 10. GET /notifications/unread-count returns accurate count");

    // ═══════════════════════════════════════════════════════════════
    // 11. Mark single notification as read is idempotent
    // ═══════════════════════════════════════════════════════════════
    const t11a = await fetch(`${BASE_URL}/notifications/${notif1Id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.strictEqual(t11a.status, 200);
    const d11a = await t11a.json() as { read: boolean; readAt: string };
    assert.strictEqual(d11a.read, true);
    assert(d11a.readAt);

    // Second call should succeed idempotently
    const t11b = await fetch(`${BASE_URL}/notifications/${notif1Id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.strictEqual(t11b.status, 200);
    console.log("✓ [PASS] 11. Mark notification as read is idempotent");

    // ═══════════════════════════════════════════════════════════════
    // 12. Mark all notifications as read
    // ═══════════════════════════════════════════════════════════════
    const t12 = await fetch(`${BASE_URL}/notifications/read-all`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.strictEqual(t12.status, 200);
    const d12 = await t12.json() as { count: number; updatedCount: number };
    assert(typeof d12.count === "number");

    // Verify unread count is now 0
    const t12Check = await fetch(`${BASE_URL}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const d12Check = await t12Check.json() as { unreadCount: number };
    assert.strictEqual(d12Check.unreadCount, 0, "Unread count must be 0 after mark-all-read");
    console.log("✓ [PASS] 12. Mark all notifications as read clears unread backlog");

    // ═══════════════════════════════════════════════════════════════
    // 13. GET /notifications/preferences returns defaults
    // ═══════════════════════════════════════════════════════════════
    const t13 = await fetch(`${BASE_URL}/notifications/preferences`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.strictEqual(t13.status, 200);
    const d13 = await t13.json() as {
      caseUpdates: boolean;
      evidenceUploads: boolean;
      custodyTransfers: boolean;
      securityAlerts: boolean;
    };
    assert.strictEqual(d13.caseUpdates, true);
    assert.strictEqual(d13.evidenceUploads, true);
    assert.strictEqual(d13.custodyTransfers, true);
    assert.strictEqual(d13.securityAlerts, true);
    console.log("✓ [PASS] 13. Preferences endpoint returns standard default configuration");

    // ═══════════════════════════════════════════════════════════════
    // 14. PUT /notifications/preferences updates allowed keys
    // ═══════════════════════════════════════════════════════════════
    const t14 = await fetch(`${BASE_URL}/notifications/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({
        caseUpdates: false,
        evidenceUploads: false,
        custodyTransfers: true,
        auditActivity: true,
      }),
    });
    assert.strictEqual(t14.status, 200);
    const d14 = await t14.json() as { caseUpdates: boolean; evidenceUploads: boolean; securityAlerts: boolean };
    assert.strictEqual(d14.caseUpdates, false);
    assert.strictEqual(d14.evidenceUploads, false);
    assert.strictEqual(d14.securityAlerts, true, "Security alerts must remain active");
    console.log("✓ [PASS] 14. Preference updates persist and enforce security alert policy");

    // ═══════════════════════════════════════════════════════════════
    // 15. PUT /notifications/preferences rejects unknown keys (400)
    // ═══════════════════════════════════════════════════════════════
    const t15 = await fetch(`${BASE_URL}/notifications/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({
        invalidKey: "malicious_payload",
      }),
    });
    assert.strictEqual(t15.status, 400);
    const d15 = await t15.json() as { error: { code: string } };
    assert.strictEqual(d15.error.code, "INVALID_KEY");
    console.log("✓ [PASS] 15. Unknown preference keys rejected with structured 400");

    // ═══════════════════════════════════════════════════════════════
    // 16. Domain event: Custody transfer generates recipient notification
    // ═══════════════════════════════════════════════════════════════
    // 1. Create a case for User 1
    const rCase = await fetch(`${BASE_URL}/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({ title: `Custody Notif Case ${ts}`, priority: "High" }),
    });
    const dCase = await rCase.json() as { id: string };

    // 2. Upload evidence to case
    const fd = new FormData();
    fd.append("file", new Blob([Buffer.from("Forensic file for notification verification")]), "test.dat");
    fd.append("name", "Notification Test Evidence");
    fd.append("ownerOrg", "Cyber Unit");
    fd.append("type", "DIGITAL_IMAGE");

    const rEv = await fetch(`${BASE_URL}/cases/${dCase.id}/evidence`, {
      method: "POST",
      headers: { Authorization: `Bearer ${user1Token}` },
      body: fd,
    });
    const dEv = await rEv.json() as { id: string };

    // 3. User 1 transfers custody to User 2
    const rTransfer = await fetch(`${BASE_URL}/evidence/${dEv.id}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({
        toUserId: user2Id,
        note: "Transferred for forensic laboratory analysis",
      }),
    });
    assert.strictEqual(rTransfer.status, 200);

    // 4. Verify User 2 received CUSTODY_TRANSFER_RECEIVED notification
    const rUser2Notifs = await fetch(`${BASE_URL}/notifications?type=CUSTODY_TRANSFER_RECEIVED`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    assert.strictEqual(rUser2Notifs.status, 200);
    const dUser2Notifs = await rUser2Notifs.json() as { items: Array<{ title: string; entityId: string }> };
    assert(dUser2Notifs.items.some((n) => n.title.includes("Custody") || n.entityId === dEv.id));
    console.log("✓ [PASS] 16. Domain Event: Custody transfer automatically notifies recipient");

    console.log("\n==================================================");
    console.log("MODULE 8 TESTS SUMMARY: 16 PASSED, 0 FAILED");
    console.log("==================================================");

  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runTests().catch((err) => {
  console.error("Module 8 test failure:", err);
  process.exit(1);
});
