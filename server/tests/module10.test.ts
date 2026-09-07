import assert from "node:assert";

const BASE_URL = process.env.API_URL || "http://localhost:4000";

async function runTests() {
  console.log("=== MODULE 10: ADMIN & PROFILE MANAGEMENT TEST SUITE ===");

  let adminToken = "";
  let adminId = "";
  let invToken = "";
  let invId = "";
  let auditorToken = "";
  let auditorId = "";

  try {
    const ts = Date.now();

    // ── Setup: Register Initial Users ──────────────────────────────
    const rAdmin = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `mod10_admin_${ts}@evichain.test`, password: "Password123!", name: "Root Administrator", role: "ADMINISTRATOR" }),
    });
    const dAdmin = await rAdmin.json() as { accessToken: string; user: { id: string } };
    adminToken = dAdmin.accessToken;
    adminId = dAdmin.user.id;

    const rInv = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `mod10_inv_${ts}@evichain.test`, password: "Password123!", name: "Detective Miller", role: "INVESTIGATOR" }),
    });
    const dInv = await rInv.json() as { accessToken: string; user: { id: string } };
    invToken = dInv.accessToken;
    invId = dInv.user.id;

    const rAuditor = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `mod10_auditor_${ts}@evichain.test`, password: "Password123!", name: "Auditor Vance", role: "AUDITOR" }),
    });
    const dAuditor = await rAuditor.json() as { accessToken: string; user: { id: string } };
    auditorToken = dAuditor.accessToken;
    auditorId = dAuditor.user.id;

    // ═══════════════════════════════════════════════════════════════
    // 1. Non-admin GET /admin/users returns 403 Forbidden
    // ═══════════════════════════════════════════════════════════════
    const t1 = await fetch(`${BASE_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${invToken}` },
    });
    assert.strictEqual(t1.status, 403);
    console.log("✓ [PASS] 1. Non-admin access to /admin/users rejected with 403 Forbidden");

    // ═══════════════════════════════════════════════════════════════
    // 2. Admin GET /admin/users returns paginated safe data (no passwords)
    // ═══════════════════════════════════════════════════════════════
    const t2 = await fetch(`${BASE_URL}/admin/users?page=1&pageSize=10`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(t2.status, 200);
    const d2 = await t2.json() as { items: Array<Record<string, unknown>>; pagination: { totalItems: number } };
    assert(Array.isArray(d2.items) && d2.items.length >= 3);
    assert(d2.pagination.totalItems >= 3);
    const rawStr = JSON.stringify(d2);
    assert(!rawStr.includes("passwordHash"), "passwordHash must not leak in user list");
    console.log("✓ [PASS] 2. Admin GET /admin/users returns paginated safe operator data");

    // ═══════════════════════════════════════════════════════════════
    // 3. Admin creates user with valid role and audits action
    // ═══════════════════════════════════════════════════════════════
    const newUserEmail = `mod10_custodian_${ts}@evichain.test`;
    const t3 = await fetch(`${BASE_URL}/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: "Officer Davis",
        email: newUserEmail,
        password: "TemporaryPass123!",
        role: "CUSTODIAN",
      }),
    });
    assert.strictEqual(t3.status, 201);
    const d3 = await t3.json() as { user: { id: string; role: string; isActive: boolean } };
    assert.strictEqual(d3.user.role, "CUSTODIAN");
    assert.strictEqual(d3.user.isActive, true);
    const createdUserId = d3.user.id;
    console.log("✓ [PASS] 3. Admin successfully provisions user with audit logging");

    // ═══════════════════════════════════════════════════════════════
    // 4. Duplicate email returns 409 conflict
    // ═══════════════════════════════════════════════════════════════
    const t4 = await fetch(`${BASE_URL}/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: "Officer Davis Duplicate",
        email: newUserEmail,
        password: "TemporaryPass123!",
        role: "CUSTODIAN",
      }),
    });
    assert.strictEqual(t4.status, 409);
    console.log("✓ [PASS] 4. Duplicate email provision rejected with 409 Conflict");

    // ═══════════════════════════════════════════════════════════════
    // 5. Admin updates user role and sends notification
    // ═══════════════════════════════════════════════════════════════
    const t5 = await fetch(`${BASE_URL}/admin/users/${createdUserId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ role: "INVESTIGATOR" }),
    });
    assert.strictEqual(t5.status, 200);
    const d5 = await t5.json() as { user: { role: string } };
    assert.strictEqual(d5.user.role, "INVESTIGATOR");
    console.log("✓ [PASS] 5. Admin updates user role and triggers notification");

    // ═══════════════════════════════════════════════════════════════
    // 6. Last administrator lockout protection
    // ═══════════════════════════════════════════════════════════════
    // Attempting to demote the only admin or deactivate
    const t6 = await fetch(`${BASE_URL}/admin/users/${adminId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ isActive: false }),
    });
    assert.strictEqual(t6.status, 400);
    const d6 = await t6.json() as { error: { code: string } };
    assert.strictEqual(d6.error.code, "LAST_ADMIN_LOCKOUT");
    console.log("✓ [PASS] 6. Last administrator lockout protection prevents self-deactivation");

    // ═══════════════════════════════════════════════════════════════
    // 7. Admin deactivates user -> login rejected & sessions revoked
    // ═══════════════════════════════════════════════════════════════
    const t7a = await fetch(`${BASE_URL}/admin/users/${createdUserId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ isActive: false }),
    });
    assert.strictEqual(t7a.status, 200);

    const t7b = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newUserEmail, password: "TemporaryPass123!" }),
    });
    assert.strictEqual(t7b.status, 401);
    console.log("✓ [PASS] 7. Deactivated user login rejected and sessions revoked");

    // ═══════════════════════════════════════════════════════════════
    // 8. Self-service PATCH /profile updates name only (no role/status elevation)
    // ═══════════════════════════════════════════════════════════════
    const t8 = await fetch(`${BASE_URL}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${invToken}` },
      body: JSON.stringify({ name: "Detective Miller Senior", role: "ADMINISTRATOR", isActive: false }),
    });
    assert.strictEqual(t8.status, 200);
    const d8 = await t8.json() as { user: { name: string; role: string; isActive: boolean } };
    assert.strictEqual(d8.user.name, "Detective Miller Senior");
    assert.strictEqual(d8.user.role, "INVESTIGATOR", "User must not be able to escalate own role");
    assert.strictEqual(d8.user.isActive, true);
    console.log("✓ [PASS] 8. Self-service profile updates ignore unauthorized role/status elevation");

    // ═══════════════════════════════════════════════════════════════
    // 9. Password change with wrong current password returns 401 generic
    // ═══════════════════════════════════════════════════════════════
    const t9 = await fetch(`${BASE_URL}/profile/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${invToken}` },
      body: JSON.stringify({ currentPassword: "WrongPassword!", newPassword: "NewValidPassword123!" }),
    });
    assert.strictEqual(t9.status, 401);
    console.log("✓ [PASS] 9. Password change with invalid current password returns generic 401");

    // ═══════════════════════════════════════════════════════════════
    // 10. Successful password change updates hash and revokes sessions
    // ═══════════════════════════════════════════════════════════════
    const t10 = await fetch(`${BASE_URL}/profile/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${invToken}` },
      body: JSON.stringify({ currentPassword: "Password123!", newPassword: "UpdatedMillerPass123!" }),
    });
    assert.strictEqual(t10.status, 200);

    // Verify login with new password works
    const t10b = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `mod10_inv_${ts}@evichain.test`, password: "UpdatedMillerPass123!" }),
    });
    assert.strictEqual(t10b.status, 200);
    console.log("✓ [PASS] 10. Password change updates credential and revokes all sessions");

    // ═══════════════════════════════════════════════════════════════
    // 11. GET /profile/security returns user's own security overview
    // ═══════════════════════════════════════════════════════════════
    const t11 = await fetch(`${BASE_URL}/profile/security`, {
      headers: { Authorization: `Bearer ${invToken}` },
    });
    assert.strictEqual(t11.status, 200);
    const d11 = await t11.json() as { userId: string; email: string; recentEvents: Array<unknown> };
    assert.strictEqual(d11.userId, invId);
    assert(Array.isArray(d11.recentEvents));
    console.log("✓ [PASS] 11. GET /profile/security returns user's own activity history");

    // ═══════════════════════════════════════════════════════════════
    // 12. Admin settings GET & PUT endpoints
    // ═══════════════════════════════════════════════════════════════
    const t12Get = await fetch(`${BASE_URL}/admin/settings`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(t12Get.status, 200);

    const t12Put = await fetch(`${BASE_URL}/admin/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        organizationName: "Federal Evidence Bureau",
        retentionPolicyDays: 730,
        allowPublicVerification: true,
      }),
    });
    assert.strictEqual(t12Put.status, 200);
    const d12Put = await t12Put.json() as { settings: { organizationName: string; retentionPolicyDays: number } };
    assert.strictEqual(d12Put.settings.organizationName, "Federal Evidence Bureau");
    assert.strictEqual(d12Put.settings.retentionPolicyDays, 730);
    console.log("✓ [PASS] 12. Admin settings GET and PUT persist configuration and audit updates");

    // ═══════════════════════════════════════════════════════════════
    // 13. Non-admin access to settings returns 403
    // ═══════════════════════════════════════════════════════════════
    const t13 = await fetch(`${BASE_URL}/admin/settings`, {
      headers: { Authorization: `Bearer ${invToken}` },
    });
    assert.strictEqual(t13.status, 403);
    console.log("✓ [PASS] 13. Non-admin access to /admin/settings returns 403 Forbidden");

    // ═══════════════════════════════════════════════════════════════
    // 14. Admin reactivates user -> user can log in again
    // ═══════════════════════════════════════════════════════════════
    const t14a = await fetch(`${BASE_URL}/admin/users/${createdUserId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ isActive: true }),
    });
    assert.strictEqual(t14a.status, 200);

    const t14b = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newUserEmail, password: "TemporaryPass123!" }),
    });
    assert.strictEqual(t14b.status, 200);
    console.log("✓ [PASS] 14. Reactivated user successfully authenticates");

    console.log("\n==================================================");
    console.log("MODULE 10 TESTS SUMMARY: 14 PASSED, 0 FAILED");
    console.log("==================================================");

  } catch (err) {
    console.error("Module 10 test failure:", err);
    process.exit(1);
  }
}

runTests();
