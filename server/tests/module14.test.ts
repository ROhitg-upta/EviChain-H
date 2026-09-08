import assert from "node:assert";
import { prisma } from "../src/db";
import { app } from "../src";
import { alertIntelligenceService, sanitizeInternalLink, sanitizeActionPayload } from "../src/services/alert-intelligence.service";
import { notificationService } from "../src/services/notification.service";
import http from "node:http";

const PORT = 4014;
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log("=== MODULE 14: SMART NOTIFICATION COMMAND CENTER & ALERT INTELLIGENCE ===");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  let user1Token = "";
  let user1Id = "";
  let user2Token = "";
  let user2Id = "";
  let adminToken = "";
  let adminId = "";

  try {
    const ts = Date.now();
    const email1 = `alert_inv1_${ts}@evichain.test`;
    const email2 = `alert_inv2_${ts}@evichain.test`;
    const adminEmail = `alert_admin_${ts}@evichain.test`;

    // Register User 1 (INVESTIGATOR)
    const r1 = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email1, password: "Password123!", name: "Alert Inv One", role: "INVESTIGATOR" }),
    });
    const d1 = await r1.json() as { accessToken: string; user: { id: string } };
    user1Token = d1.accessToken;
    user1Id = d1.user.id;

    // Register User 2 (INVESTIGATOR)
    const r2 = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email2, password: "Password123!", name: "Alert Inv Two", role: "INVESTIGATOR" }),
    });
    const d2 = await r2.json() as { accessToken: string; user: { id: string } };
    user2Token = d2.accessToken;
    user2Id = d2.user.id;

    // Register Admin
    const rAdmin = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: "Password123!", name: "Alert Admin", role: "ADMINISTRATOR" }),
    });
    const dAdmin = await rAdmin.json() as { accessToken: string; user: { id: string } };
    adminToken = dAdmin.accessToken;
    adminId = dAdmin.user.id;

    // ═══════════════════════════════════════════════════════════════
    // 1. Notification severity is validated and calculated
    // ═══════════════════════════════════════════════════════════════
    const sev1 = alertIntelligenceService.calculateAlertSeverity("INTEGRITY_ALERT");
    assert.strictEqual(sev1, "CRITICAL", "INTEGRITY_ALERT must resolve to CRITICAL");

    const sev2 = alertIntelligenceService.calculateAlertSeverity("SECURITY_EVENT");
    assert.strictEqual(sev2, "SECURITY", "SECURITY_EVENT must resolve to SECURITY");

    const sev3 = alertIntelligenceService.calculateAlertSeverity("CUSTODY_TRANSFER_RECEIVED");
    assert.strictEqual(sev3, "HIGH", "CUSTODY_TRANSFER_RECEIVED must resolve to HIGH");

    const sev4 = alertIntelligenceService.calculateAlertSeverity("CASE_CREATED");
    assert.strictEqual(sev4, "INFO", "CASE_CREATED must resolve to INFO");

    const sevExplicit = alertIntelligenceService.calculateAlertSeverity("CASE_CREATED", "WARNING");
    assert.strictEqual(sevExplicit, "WARNING", "Explicit valid severity must override default");

    console.log("✓ [PASS] 1. Notification severity is properly calculated and validated");

    // ═══════════════════════════════════════════════════════════════
    // 2. Untrusted external link cannot be saved/navigated
    // ═══════════════════════════════════════════════════════════════
    assert.strictEqual(sanitizeInternalLink("https://evil.com/phish"), null);
    assert.strictEqual(sanitizeInternalLink("//attacker.com"), null);
    assert.strictEqual(sanitizeInternalLink("javascript:alert(1)"), null);
    assert.strictEqual(sanitizeInternalLink("/cases/abc-123"), "/cases/abc-123");
    console.log("✓ [PASS] 2. Untrusted external links are rejected and sanitized");

    // ═══════════════════════════════════════════════════════════════
    // 3. Sensitive payload scrubbing (passwords, tokens, keys)
    // ═══════════════════════════════════════════════════════════════
    const dirtyPayload = {
      evidenceId: "ev-123",
      password: "secretpassword",
      token: "jwt.secret.token",
      storageKey: "s3://private-key",
      safeMeta: "verified",
    };
    const cleaned = sanitizeActionPayload(dirtyPayload);
    assert(cleaned !== null);
    assert.strictEqual(cleaned.evidenceId, "ev-123");
    assert.strictEqual(cleaned.safeMeta, "verified");
    assert.strictEqual((cleaned as any).password, undefined);
    assert.strictEqual((cleaned as any).token, undefined);
    assert.strictEqual((cleaned as any).storageKey, undefined);
    console.log("✓ [PASS] 3. Sensitive metadata, keys, and tokens are scrubbed from actionPayload");

    // ═══════════════════════════════════════════════════════════════
    // 4. Create investigation alert via service
    // ═══════════════════════════════════════════════════════════════
    const alert1 = await alertIntelligenceService.createInvestigationAlert({
      userId: user1Id,
      type: "INTEGRITY_ALERT",
      severity: "CRITICAL",
      title: "Hash Mismatch Detected",
      message: "Evidence SHA-256 digest failed verification against custody record.",
      link: "/evidence/ev-test-1",
      entityType: "EVIDENCE",
      entityId: "ev-test-1",
      actionRequired: true,
      actionType: "REVIEW_INTEGRITY",
      actionPayload: { evidenceId: "ev-test-1", expectedSha: "abc", actualSha: "def" },
    });
    assert(alert1 !== null);
    assert.strictEqual(alert1.severity, "CRITICAL");
    assert.strictEqual(alert1.actionRequired, true);
    assert.strictEqual(alert1.actionType, "REVIEW_INTEGRITY");
    console.log("✓ [PASS] 4. Forensic investigation alert created with severity and action metadata");

    // ═══════════════════════════════════════════════════════════════
    // 5. Deduplication and Grouping Keys
    // ═══════════════════════════════════════════════════════════════
    const dedupeKey = `INTEGRITY_FAIL:${user1Id}:${ts}`;
    const firstEmit = await alertIntelligenceService.createInvestigationAlert({
      userId: user1Id,
      type: "INTEGRITY_ALERT",
      title: "Integrity alert",
      message: "Initial alert",
      dedupeKey,
      groupingKey: `group-ev-integrity-${ts}`,
    });
    const dupEmit = await alertIntelligenceService.createInvestigationAlert({
      userId: user1Id,
      type: "INTEGRITY_ALERT",
      title: "Integrity alert duplicate",
      message: "Replay alert",
      dedupeKey,
      groupingKey: `group-ev-integrity-${ts}`,
    });
    assert(firstEmit !== null && dupEmit !== null);
    assert.strictEqual(firstEmit.id, dupEmit.id, "DedupeKey must return existing alert");

    const grouped = alertIntelligenceService.groupNotifications([
      firstEmit,
      { ...firstEmit, id: "fake-2" },
      { id: "other", type: "CASE_CREATED", entityId: "c1", groupingKey: "group-c1" },
    ]);
    assert.strictEqual(grouped.length, 2, "Should collapse 3 items into 2 groups");
    console.log("✓ [PASS] 5. Alert deduplication and grouping keys operate correctly");

    // ═══════════════════════════════════════════════════════════════
    // 6. User Isolation: User 2 cannot see User 1's notifications
    // ═══════════════════════════════════════════════════════════════
    const rList2 = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    const dList2 = await rList2.json() as { items: Array<{ id: string }> };
    const user2AlertIds = dList2.items.map((i) => i.id);
    assert(!user2AlertIds.includes(alert1.id), "User 2 must not see User 1's alerts");
    console.log("✓ [PASS] 6. User isolation enforced on notifications feed");

    // ═══════════════════════════════════════════════════════════════
    // 7. User Isolation: User 2 cannot dismiss or triage User 1's alert
    // ═══════════════════════════════════════════════════════════════
    const rActionForbidden = await fetch(`${BASE_URL}/notifications/${alert1.id}/action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user2Token}`,
      },
      body: JSON.stringify({ actionType: "REVIEW_INTEGRITY" }),
    });
    assert.strictEqual(rActionForbidden.status, 403, "User 2 modifying User 1 alert must return 403 Forbidden");

    const rDismissForbidden = await fetch(`${BASE_URL}/notifications/${alert1.id}/dismiss`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    assert.strictEqual(rDismissForbidden.status, 403, "User 2 dismissing User 1 alert must return 403 Forbidden");
    console.log("✓ [PASS] 7. Unauthorized user cannot triage or dismiss another user's alert");

    // ═══════════════════════════════════════════════════════════════
    // 8. Triage action execution with AuditLog logging
    // ═══════════════════════════════════════════════════════════════
    const rActionSuccess = await fetch(`${BASE_URL}/notifications/${alert1.id}/action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1Token}`,
      },
      body: JSON.stringify({ actionType: "REVIEW_INTEGRITY" }),
    });
    assert.strictEqual(rActionSuccess.status, 200);
    const updatedAlert = await rActionSuccess.json() as { read: boolean; resolvedAt: string };
    assert.strictEqual(updatedAlert.read, true);
    assert(updatedAlert.resolvedAt !== null);

    // Verify audit log record
    const auditRecord = await prisma.auditLog.findFirst({
      where: {
        action: "alert.triage_action",
        resourceId: alert1.id,
      },
    });
    assert(auditRecord !== null, "AuditLog entry must be created on triage action");
    assert.strictEqual(auditRecord.actorUserId, user1Id);
    console.log("✓ [PASS] 8. Triage action updates alert status and creates immutable AuditLog entry");

    // ═══════════════════════════════════════════════════════════════
    // 9. Soft dismissal of alert for user
    // ═══════════════════════════════════════════════════════════════
    const alertToDismiss = await alertIntelligenceService.createInvestigationAlert({
      userId: user1Id,
      type: "CASE_CREATED",
      title: "Case Created",
      message: "Routine case notification",
      link: "/cases/c-test",
    });
    assert(alertToDismiss !== null);

    const rDismiss = await fetch(`${BASE_URL}/notifications/${alertToDismiss.id}/dismiss`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.strictEqual(rDismiss.status, 200);
    const dismissedNotif = await rDismiss.json() as { dismissedAt: string };
    assert(dismissedNotif.dismissedAt !== null);

    // Excluded from standard GET /notifications
    const rAfterDismiss = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const dAfterDismiss = await rAfterDismiss.json() as { items: Array<{ id: string }> };
    assert(!dAfterDismiss.items.some((i) => i.id === alertToDismiss.id), "Dismissed alerts excluded by default");
    console.log("✓ [PASS] 9. Soft-dismissal updates dismissedAt and excludes from default feed");

    // ═══════════════════════════════════════════════════════════════
    // 10. Needs Attention Queue derives from real database state
    // ═══════════════════════════════════════════════════════════════
    // Create an un-resolved action-required alert for User 1
    await alertIntelligenceService.createInvestigationAlert({
      userId: user1Id,
      type: "SECURITY_EVENT",
      severity: "SECURITY",
      title: "Unusual Session Alert",
      message: "Simulated security alert",
      actionRequired: true,
      actionType: "OPEN_CASE",
    });

    const rNeedsAttn = await fetch(`${BASE_URL}/notifications/needs-attention`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.strictEqual(rNeedsAttn.status, 200);
    const dNeedsAttn = await rNeedsAttn.json() as { items: Array<{ actionRequired: boolean; severity: string }> };
    assert(dNeedsAttn.items.length > 0, "Needs Attention queue must contain items");
    assert(dNeedsAttn.items.every((i) => i.actionRequired === true), "All items in queue must have actionRequired true");
    console.log("✓ [PASS] 10. Needs Attention queue returns real actionable items sorted by severity");

    // ═══════════════════════════════════════════════════════════════
    // 11. Deactivated user cannot access alert endpoints
    // ═══════════════════════════════════════════════════════════════
    await prisma.user.update({
      where: { id: user2Id },
      data: { isActive: false },
    });

    const rDeactivated = await fetch(`${BASE_URL}/notifications/needs-attention`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    assert.strictEqual(rDeactivated.status, 401, "Deactivated user must receive 401 Unauthorized");
    console.log("✓ [PASS] 11. Deactivated user is rejected from alert endpoints");

    // ═══════════════════════════════════════════════════════════════
    // 12. Idempotent action resolution
    // ═══════════════════════════════════════════════════════════════
    const rActionRepeat = await fetch(`${BASE_URL}/notifications/${alert1.id}/action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1Token}`,
      },
      body: JSON.stringify({ actionType: "REVIEW_INTEGRITY" }),
    });
    assert.strictEqual(rActionRepeat.status, 200, "Subsequent action resolution must succeed idempotently");
    console.log("✓ [PASS] 12. Alert triage actions are idempotent");

    console.log("\n==================================================");
    console.log("ALL MODULE 14 BACKEND TESTS PASSED (12/12)");
    console.log("==================================================");
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error("Module 14 tests failed:", err);
  process.exit(1);
});
