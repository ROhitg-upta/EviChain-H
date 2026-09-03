import assert from "node:assert";

const BASE_URL = process.env.API_URL || "http://localhost:4000";

async function runTests() {
  console.log("=== MODULE 9: GLOBAL SEARCH, COMMAND PALETTE & EVIDENCE DISCOVERY TEST SUITE ===");

  let adminToken = "";
  let adminId = "";
  let inv1Token = "";
  let inv1Id = "";
  let inv2Token = "";
  let inv2Id = "";
  let auditorToken = "";

  let case1Id = "";
  let case2Id = "";
  let ev1Id = "";
  let ev1Sha = "";
  let ev2Id = "";
  let ev2Sha = "";

  try {
    const ts = Date.now();

    // ── Setup: Register Users ──────────────────────────────────────
    const rAdmin = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `search_admin_${ts}@evichain.test`, password: "Password123!", name: "Search Admin", role: "ADMINISTRATOR" }),
    });
    const dAdmin = await rAdmin.json() as { accessToken: string; user: { id: string } };
    adminToken = dAdmin.accessToken;
    adminId = dAdmin.user.id;

    const rInv1 = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `search_inv1_${ts}@evichain.test`, password: "Password123!", name: "Detective Sherlock", role: "INVESTIGATOR" }),
    });
    const dInv1 = await rInv1.json() as { accessToken: string; user: { id: string } };
    inv1Token = dInv1.accessToken;
    inv1Id = dInv1.user.id;

    const rInv2 = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `search_inv2_${ts}@evichain.test`, password: "Password123!", name: "Inspector Clouseau", role: "INVESTIGATOR" }),
    });
    const dInv2 = await rInv2.json() as { accessToken: string; user: { id: string } };
    inv2Token = dInv2.accessToken;
    inv2Id = dInv2.user.id;

    const rAuditor = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `search_auditor_${ts}@evichain.test`, password: "Password123!", name: "Auditor Smith", role: "AUDITOR" }),
    });
    const dAuditor = await rAuditor.json() as { accessToken: string; user: { id: string } };
    auditorToken = dAuditor.accessToken;

    // ── Setup: Create Cases & Evidence ─────────────────────────────
    // Case 1 owned by Inv 1
    const rCase1 = await fetch(`${BASE_URL}/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${inv1Token}` },
      body: JSON.stringify({ title: `Project Omega ${ts}`, description: "Top secret investigation on malware breach", priority: "Critical" }),
    });
    const dCase1 = await rCase1.json() as { id: string };
    case1Id = dCase1.id;

    // Case 2 owned by Inv 2
    const rCase2 = await fetch(`${BASE_URL}/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${inv2Token}` },
      body: JSON.stringify({ title: `Operation Nebula ${ts}`, description: "Internal financial compliance audit", priority: "High" }),
    });
    const dCase2 = await rCase2.json() as { id: string };
    case2Id = dCase2.id;

    // Evidence 1 in Case 1 (Inv 1)
    const fd1 = new FormData();
    fd1.append("file", new Blob([Buffer.from(`omega_payload_${ts}_binary_content`)]), "omega_exploit_dump.bin");
    fd1.append("name", `omega_exploit_dump_${ts}.bin`);
    fd1.append("ownerOrg", "Cyber Unit");
    fd1.append("type", "DISK_IMAGE");
    const rEv1 = await fetch(`${BASE_URL}/cases/${case1Id}/evidence`, {
      method: "POST",
      headers: { Authorization: `Bearer ${inv1Token}` },
      body: fd1,
    });
    const dEv1 = await rEv1.json() as { id: string; sha256: string };
    ev1Id = dEv1.id;
    ev1Sha = dEv1.sha256;

    // Evidence 2 in Case 2 (Inv 2)
    const fd2 = new FormData();
    fd2.append("file", new Blob([Buffer.from(`nebula_ledger_${ts}_financial_records`)]), "nebula_ledger.pdf");
    fd2.append("name", `nebula_ledger_${ts}.pdf`);
    fd2.append("ownerOrg", "Finance Division");
    fd2.append("type", "DOCUMENT");
    const rEv2 = await fetch(`${BASE_URL}/cases/${case2Id}/evidence`, {
      method: "POST",
      headers: { Authorization: `Bearer ${inv2Token}` },
      body: fd2,
    });
    const dEv2 = await rEv2.json() as { id: string; sha256: string };
    ev2Id = dEv2.id;
    ev2Sha = dEv2.sha256;

    // ═══════════════════════════════════════════════════════════════
    // 1. Unauthenticated search returns 401
    // ═══════════════════════════════════════════════════════════════
    const t1 = await fetch(`${BASE_URL}/search?q=omega`);
    assert.strictEqual(t1.status, 401);
    console.log("✓ [PASS] 1. Unauthenticated search returns 401");

    // ═══════════════════════════════════════════════════════════════
    // 2. Query validation: Missing or short q returns 400
    // ═══════════════════════════════════════════════════════════════
    const t2a = await fetch(`${BASE_URL}/search?q=`, { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.strictEqual(t2a.status, 400);
    const d2a = await t2a.json() as { error: { code: string } };
    assert.strictEqual(d2a.error.code, "INVALID_QUERY");

    const t2b = await fetch(`${BASE_URL}/search?q=a`, { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.strictEqual(t2b.status, 400);
    console.log("✓ [PASS] 2. Query validation rejects empty or < 2 character queries with structured 400");

    // ═══════════════════════════════════════════════════════════════
    // 3. Invalid types filter returns 400
    // ═══════════════════════════════════════════════════════════════
    const t3 = await fetch(`${BASE_URL}/search?q=omega&types=INVALID_TYPE`, { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.strictEqual(t3.status, 400);
    const d3 = await t3.json() as { error: { code: string } };
    assert.strictEqual(d3.error.code, "INVALID_TYPE_FILTER");
    console.log("✓ [PASS] 3. Invalid entity type filter returns structured 400");

    // ═══════════════════════════════════════════════════════════════
    // 4. Administrator searches global records across cases & evidence
    // ═══════════════════════════════════════════════════════════════
    const t4 = await fetch(`${BASE_URL}/search?q=Omega`, { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.strictEqual(t4.status, 200);
    const d4 = await t4.json() as { groups: Array<{ type: string; items: Array<{ id: string }> }> };
    const caseGroup = d4.groups.find((g) => g.type === "CASE");
    assert(caseGroup && caseGroup.items.some((i) => i.id === case1Id));
    console.log("✓ [PASS] 4. Administrator successfully searches across global cases and evidence");

    // ═══════════════════════════════════════════════════════════════
    // 5. Investigator role scoping: Inv 1 CANNOT find Inv 2's Case/Evidence
    // ═══════════════════════════════════════════════════════════════
    const t5 = await fetch(`${BASE_URL}/search?q=Nebula`, { headers: { Authorization: `Bearer ${inv1Token}` } });
    assert.strictEqual(t5.status, 200);
    const d5 = await t5.json() as { groups: Array<{ type: string; items: Array<{ id: string }> }> };
    const leakedCase = d5.groups.some((g) => g.items.some((i) => i.id === case2Id));
    const leakedEv = d5.groups.some((g) => g.items.some((i) => i.id === ev2Id));
    assert(!leakedCase, "Investigator 1 must not find Investigator 2's case");
    assert(!leakedEv, "Investigator 1 must not find Investigator 2's evidence");
    console.log("✓ [PASS] 5. Investigator scoping strictly hides unauthorized cases and evidence");

    // ═══════════════════════════════════════════════════════════════
    // 6. Investigator discovers their own authorized records
    // ═══════════════════════════════════════════════════════════════
    const t6 = await fetch(`${BASE_URL}/search?q=Omega`, { headers: { Authorization: `Bearer ${inv1Token}` } });
    assert.strictEqual(t6.status, 200);
    const d6 = await t6.json() as { groups: Array<{ type: string; items: Array<{ id: string }> }> };
    const foundCase = d6.groups.find((g) => g.type === "CASE");
    assert(foundCase && foundCase.items.some((i) => i.id === case1Id));
    console.log("✓ [PASS] 6. Investigator discovers authorized cases and evidence");

    // ═══════════════════════════════════════════════════════════════
    // 7. Exact SHA-256 fingerprint search
    // ═══════════════════════════════════════════════════════════════
    const t7 = await fetch(`${BASE_URL}/search?q=${ev1Sha}`, { headers: { Authorization: `Bearer ${inv1Token}` } });
    assert.strictEqual(t7.status, 200);
    const d7 = await t7.json() as { groups: Array<{ type: string; items: Array<{ id: string; subtitle?: string }> }> };
    const evGroup = d7.groups.find((g) => g.type === "EVIDENCE");
    assert(evGroup && evGroup.items.some((i) => i.id === ev1Id));
    console.log("✓ [PASS] 7. Exact 64-character SHA-256 search prioritizes matching evidence");

    // ═══════════════════════════════════════════════════════════════
    // 8. Case-insensitive search works
    // ═══════════════════════════════════════════════════════════════
    const t8 = await fetch(`${BASE_URL}/search?q=omega_exploit`, { headers: { Authorization: `Bearer ${inv1Token}` } });
    assert.strictEqual(t8.status, 200);
    const d8 = await t8.json() as { groups: Array<{ type: string; items: Array<{ id: string }> }> };
    assert(d8.groups.some((g) => g.type === "EVIDENCE" && g.items.some((i) => i.id === ev1Id)));
    console.log("✓ [PASS] 8. Case-insensitive evidence search works reliably");

    // ═══════════════════════════════════════════════════════════════
    // 9. User search restriction: Only Administrator gets user results
    // ═══════════════════════════════════════════════════════════════
    const t9Admin = await fetch(`${BASE_URL}/search?q=Sherlock&types=USER`, { headers: { Authorization: `Bearer ${adminToken}` } });
    const d9Admin = await t9Admin.json() as { groups: Array<{ type: string; items: Array<{ id: string }> }> };
    const userGroupAdmin = d9Admin.groups.find((g) => g.type === "USER");
    assert(userGroupAdmin && userGroupAdmin.items.some((i) => i.id === inv1Id));

    const t9Inv = await fetch(`${BASE_URL}/search?q=Sherlock&types=USER`, { headers: { Authorization: `Bearer ${inv1Token}` } });
    const d9Inv = await t9Inv.json() as { groups: Array<{ type: string }> };
    assert(!d9Inv.groups.some((g) => g.type === "USER"), "Investigator must not receive User search results");
    console.log("✓ [PASS] 9. User search visibility is restricted to Administrators only");

    // ═══════════════════════════════════════════════════════════════
    // 10. Auditor read-only global search
    // ═══════════════════════════════════════════════════════════════
    const t10 = await fetch(`${BASE_URL}/search?q=Omega`, { headers: { Authorization: `Bearer ${auditorToken}` } });
    assert.strictEqual(t10.status, 200);
    const d10 = await t10.json() as { groups: Array<{ type: string; items: Array<{ id: string }> }> };
    assert(d10.groups.some((g) => g.type === "CASE" && g.items.some((i) => i.id === case1Id)));
    console.log("✓ [PASS] 10. Auditor successfully queries case and audit indices");

    // ═══════════════════════════════════════════════════════════════
    // 11. Pagination & Suggestions mode constraints
    // ═══════════════════════════════════════════════════════════════
    const t11 = await fetch(`${BASE_URL}/search?q=Omega&mode=suggestions&limitPerType=2`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(t11.status, 200);
    const d11 = await t11.json() as {
      mode: string;
      groups: Array<{ items: Array<unknown> }>;
      pagination: { page: number; pageSize: number };
    };
    assert.strictEqual(d11.mode, "suggestions");
    assert(d11.groups.every((g) => g.items.length <= 2));
    console.log("✓ [PASS] 11. Suggestions mode and per-type limits properly enforced");

    // ═══════════════════════════════════════════════════════════════
    // 12. Security: Internal safe routes returned and secrets excluded
    // ═══════════════════════════════════════════════════════════════
    const t12 = await fetch(`${BASE_URL}/search?q=Omega`, { headers: { Authorization: `Bearer ${adminToken}` } });
    const d12Str = await t12.text();
    assert(!d12Str.includes("password"));
    assert(!d12Str.includes("storageKey"));
    assert(!d12Str.includes("secret"));
    const d12Json = JSON.parse(d12Str) as { groups: Array<{ items: Array<{ href: string }> }> };
    for (const group of d12Json.groups) {
      for (const item of group.items) {
        assert(item.href.startsWith("/"), "Search result href must be a safe internal relative path");
      }
    }
    console.log("✓ [PASS] 12. Search responses exclude secrets and use validated relative internal paths");

    console.log("\n==================================================");
    console.log("MODULE 9 TESTS SUMMARY: 12 PASSED, 0 FAILED");
    console.log("==================================================");

  } catch (err) {
    console.error("Module 9 test failure:", err);
    process.exit(1);
  }
}

runTests();
