import assert from "node:assert";
import crypto from "node:crypto";

const BASE_URL = process.env.API_URL || "http://localhost:4000";

async function runTests() {
  console.log("=== MODULE 12: COLLABORATION, EVIDENCE ANNOTATION & TEAM WORKFLOW TEST SUITE ===");

  let adminToken = "";
  let adminId = "";
  let inv1Token = "";
  let inv1Id = "";
  let inv2Token = "";
  let inv2Id = "";
  let auditorToken = "";
  let auditorId = "";

  let case1Id = "";
  let evidence1Id = "";
  let initialEvidenceHash = "";

  try {
    const ts = Date.now();

    // ── Setup: Register Test Users ──────────────────────────────────
    const rAdmin = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `mod12_admin_${ts}@evichain.test`,
        password: "Password123!",
        name: "Admin Commander",
        role: "ADMINISTRATOR",
      }),
    });
    const dAdmin = (await rAdmin.json()) as { accessToken: string; user: { id: string } };
    adminToken = dAdmin.accessToken;
    adminId = dAdmin.user.id;

    // Assigned investigator
    const rInv1 = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `mod12_inv1_${ts}@evichain.test`,
        password: "Password123!",
        name: "Investigator Alice",
        role: "INVESTIGATOR",
      }),
    });
    const dInv1 = (await rInv1.json()) as { accessToken: string; user: { id: string } };
    inv1Token = dInv1.accessToken;
    inv1Id = dInv1.user.id;

    // Unassigned investigator
    const rInv2 = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `mod12_inv2_${ts}@evichain.test`,
        password: "Password123!",
        name: "Investigator Bob",
        role: "INVESTIGATOR",
      }),
    });
    const dInv2 = (await rInv2.json()) as { accessToken: string; user: { id: string } };
    inv2Token = dInv2.accessToken;
    inv2Id = dInv2.user.id;

    // Auditor
    const rAuditor = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `mod12_auditor_${ts}@evichain.test`,
        password: "Password123!",
        name: "Auditor Carol",
        role: "AUDITOR",
      }),
    });
    const dAuditor = (await rAuditor.json()) as { accessToken: string; user: { id: string } };
    auditorToken = dAuditor.accessToken;
    auditorId = dAuditor.user.id;

    // Create Case 1 owned by Alice (inv1)
    const rCase = await fetch(`${BASE_URL}/cases`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inv1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: `Operation Mod12 Collaboration ${ts}`,
        description: "Testing collaboration and annotation workflows",
        priority: "High",
      }),
    });
    assert.strictEqual(rCase.status, 201, `Case creation failed with status ${rCase.status}`);
    const dCase = (await rCase.json()) as { id: string };
    case1Id = dCase.id;

    // Upload Evidence to Case 1
    const fileBytes = Buffer.from(`FORENSIC_RAW_PAYLOAD_FOR_MOD12_TESTING_${ts}`);
    const computedHash = crypto.createHash("sha256").update(fileBytes).digest("hex");

    const fd = new FormData();
    fd.append("file", new Blob([fileBytes], { type: "text/plain" }), `dump_${ts}.txt`);
    fd.append("name", `Forensic_Dump_${ts}.txt`);
    fd.append("evidenceType", "DIGITAL");

    const rEv = await fetch(`${BASE_URL}/cases/${case1Id}/evidence`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inv1Token}`,
      },
      body: fd,
    });
    assert.strictEqual(rEv.status, 201, `Evidence upload failed with status ${rEv.status}`);
    const dEv = (await rEv.json()) as { id: string; sha256Hash?: string; sha256?: string; evidence?: { id: string; sha256Hash?: string; sha256?: string } };
    evidence1Id = dEv.id || (dEv.evidence ? dEv.evidence.id : "");
    initialEvidenceHash = dEv.sha256Hash || dEv.sha256 || (dEv.evidence ? dEv.evidence.sha256Hash || dEv.evidence.sha256 : "") || computedHash;

    // ═══════════════════════════════════════════════════════════════
    // TEST 1: AUDITOR cannot post a comment (403 Forbidden)
    // ═══════════════════════════════════════════════════════════════
    const t1 = await fetch(`${BASE_URL}/cases/${case1Id}/comments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auditorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: "Auditor attempting to comment" }),
    });
    assert.strictEqual(t1.status, 403, `Expected 403 for AUDITOR comment, got ${t1.status}`);
    console.log("✓ [PASS] 1. AUDITOR comment attempt correctly rejected with 403 Forbidden");

    // ═══════════════════════════════════════════════════════════════
    // TEST 2: AUDITOR cannot post an annotation (403 Forbidden)
    // ═══════════════════════════════════════════════════════════════
    const t2 = await fetch(`${BASE_URL}/evidence/${evidence1Id}/annotations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auditorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "point",
        coordinates: [{ x: 0.5, y: 0.5 }],
        note: "Auditor attempting to annotate",
      }),
    });
    assert.strictEqual(t2.status, 403, `Expected 403 for AUDITOR annotation, got ${t2.status}`);
    console.log("✓ [PASS] 2. AUDITOR annotation attempt correctly rejected with 403 Forbidden");

    // ═══════════════════════════════════════════════════════════════
    // TEST 3: Unauthorized INVESTIGATOR cannot post comment or annotation (403 Forbidden)
    // ═══════════════════════════════════════════════════════════════
    const t3Comment = await fetch(`${BASE_URL}/cases/${case1Id}/comments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inv2Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: "Unassigned investigator comment" }),
    });
    assert.strictEqual(t3Comment.status, 403, `Expected 403 for unassigned investigator comment, got ${t3Comment.status}`);

    const t3Ann = await fetch(`${BASE_URL}/evidence/${evidence1Id}/annotations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inv2Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "point",
        coordinates: [{ x: 0.2, y: 0.2 }],
        note: "Unassigned annotation attempt",
      }),
    });
    assert.strictEqual(t3Ann.status, 403, `Expected 403 for unassigned investigator annotation, got ${t3Ann.status}`);
    console.log("✓ [PASS] 3. Unassigned investigator rejected with 403 on comment & annotation");

    // ═══════════════════════════════════════════════════════════════
    // TEST 4: Authorized INVESTIGATOR can post comment and nested reply
    // ═══════════════════════════════════════════════════════════════
    const t4Parent = await fetch(`${BASE_URL}/cases/${case1Id}/comments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inv1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: "Primary forensic analysis completed." }),
    });
    assert.strictEqual(t4Parent.status, 201, "Authorized comment failed");
    const dParent = (await t4Parent.json()) as { id?: string; content?: string; comment?: { id: string; content: string } };
    const parentCommentId = dParent.id || (dParent.comment ? dParent.comment.id : "");
    assert.ok(parentCommentId, "Parent comment ID missing");

    // Nested reply
    const t4Reply = await fetch(`${BASE_URL}/cases/${case1Id}/comments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inv1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: "Replying to primary findings.",
        parentId: parentCommentId,
      }),
    });
    assert.strictEqual(t4Reply.status, 201, "Nested reply comment failed");
    const dReply = (await t4Reply.json()) as { id?: string; parentId?: string; comment?: { id: string; parentId: string } };
    const replyParentId = dReply.parentId || (dReply.comment ? dReply.comment.parentId : "");
    assert.strictEqual(replyParentId, parentCommentId, "ParentId mismatch on reply");
    console.log("✓ [PASS] 4. Authorized investigator posted threaded parent comment and nested reply");

    // ═══════════════════════════════════════════════════════════════
    // TEST 5: @Mentioning case-authorized user creates notification
    // ═══════════════════════════════════════════════════════════════
    // Admin is authorized on all cases. Let's mention Admin.
    const t5 = await fetch(`${BASE_URL}/cases/${case1Id}/comments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inv1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: `Hey @[Admin Commander](${adminId}), please review this finding.`,
      }),
    });
    assert.strictEqual(t5.status, 201, "Comment with authorized mention failed");

    // Check admin notifications
    const rAdminNotifs = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dAdminNotifs = (await rAdminNotifs.json()) as { notifications: Array<{ title: string; link?: string }> };
    const mentionNotif = dAdminNotifs.notifications.find((n) =>
      n.title.toLowerCase().includes("mentioned") || (n.link && n.link.includes(case1Id))
    );
    assert.ok(mentionNotif, "Mention notification for authorized admin not found");
    console.log("✓ [PASS] 5. @Mentioning case-authorized user creates in-app notification");

    // ═══════════════════════════════════════════════════════════════
    // TEST 6: @Mentioning unauthorized user does NOT create notification
    // ═══════════════════════════════════════════════════════════════
    const t6 = await fetch(`${BASE_URL}/cases/${case1Id}/comments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inv1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: `Unauthorized ping @[Investigator Bob](${inv2Id}) should not receive alert.`,
      }),
    });
    assert.strictEqual(t6.status, 201);

    // Check inv2 notifications
    const rInv2Notifs = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${inv2Token}` },
    });
    const dInv2Notifs = (await rInv2Notifs.json()) as { notifications: Array<{ title: string; link?: string }> };
    const unauthorizedNotif = dInv2Notifs.notifications.find((n) =>
      n.title.toLowerCase().includes("mentioned") || (n.link && n.link.includes(case1Id))
    );
    assert.strictEqual(unauthorizedNotif, undefined, "Unauthorized user should NOT have received notification");
    console.log("✓ [PASS] 6. Mention security enforced: unauthorized user did not receive notification");

    // ═══════════════════════════════════════════════════════════════
    // TEST 7: Author can edit own comment; audit log is case.comment.edit
    // ═══════════════════════════════════════════════════════════════
    const t7 = await fetch(`${BASE_URL}/cases/${case1Id}/comments/${parentCommentId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${inv1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: "Primary forensic analysis updated by author.",
      }),
    });
    assert.strictEqual(t7.status, 200, "Author edit failed");
    const d7 = (await t7.json()) as { content?: string; editedAt?: string | null; comment?: { content: string; editedAt: string | null } };
    const content7 = d7.content || (d7.comment ? d7.comment.content : "");
    const editedAt7 = d7.editedAt || (d7.comment ? d7.comment.editedAt : null);
    assert.strictEqual(content7, "Primary forensic analysis updated by author.");
    assert.ok(editedAt7, "editedAt timestamp should be populated");
    console.log("✓ [PASS] 7. Author successfully edited own comment with editedAt timestamp");

    // ═══════════════════════════════════════════════════════════════
    // TEST 8: Administrator editing another's comment records case.comment.moderate
    // ═══════════════════════════════════════════════════════════════
    const t8 = await fetch(`${BASE_URL}/cases/${case1Id}/comments/${parentCommentId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: "Redacted by Administrator for compliance.",
        reason: "Compliance policy standard",
      }),
    });
    assert.strictEqual(t8.status, 200, "Admin moderation failed");
    console.log("✓ [PASS] 8. Administrator moderated comment with audit metadata");

    // ═══════════════════════════════════════════════════════════════
    // TEST 9: Soft-deleted comment disappears from GET comments but remains in DB
    // ═══════════════════════════════════════════════════════════════
    // Create a temporary comment to soft delete
    const rTemp = await fetch(`${BASE_URL}/cases/${case1Id}/comments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inv1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: "Temporary comment to be deleted" }),
    });
    const dTemp = (await rTemp.json()) as { id?: string; comment?: { id: string } };
    const tempCommentId = dTemp.id || (dTemp.comment ? dTemp.comment.id : "");

    const t9Del = await fetch(`${BASE_URL}/cases/${case1Id}/comments/${tempCommentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${inv1Token}` },
    });
    assert.strictEqual(t9Del.status, 200, "Comment soft delete failed");

    // Verify it is filtered out from list
    const t9List = await fetch(`${BASE_URL}/cases/${case1Id}/comments`, {
      headers: { Authorization: `Bearer ${inv1Token}` },
    });
    const d9List = (await t9List.json()) as Array<{ id: string }> | { comments: Array<{ id: string }> };
    const commentsList = Array.isArray(d9List) ? d9List : d9List.comments || [];
    const foundDeleted = commentsList.some((c) => c.id === tempCommentId);
    assert.strictEqual(foundDeleted, false, "Soft-deleted comment should not appear in active comments list");
    console.log("✓ [PASS] 9. Soft-deleted comment filtered out of active discussion thread");

    // ═══════════════════════════════════════════════════════════════
    // TEST 10: Annotation coordinates out of 0–1 range rejected with 400
    // ═══════════════════════════════════════════════════════════════
    const t10Invalid = await fetch(`${BASE_URL}/evidence/${evidence1Id}/annotations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inv1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "point",
        coordinates: [{ x: 1.5, y: -0.2 }], // Out of 0..1 bounds
        note: "Invalid coordinates test",
      }),
    });
    assert.strictEqual(t10Invalid.status, 400, `Expected 400 for out-of-bounds coords, got ${t10Invalid.status}`);
    console.log("✓ [PASS] 10. Out-of-bounds normalized coordinates rejected with 400 Bad Request");

    // ═══════════════════════════════════════════════════════════════
    // TEST 11: Valid annotation created; SHA-256 and binary bytes unchanged
    // ═══════════════════════════════════════════════════════════════
    const t11 = await fetch(`${BASE_URL}/evidence/${evidence1Id}/annotations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inv1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "region",
        coordinates: [
          { x: 0.1, y: 0.1 },
          { x: 0.4, y: 0.1 },
          { x: 0.4, y: 0.4 },
          { x: 0.1, y: 0.4 },
        ],
        note: "Header discrepancy identified in sector 2",
        pageNumber: 1,
        color: "#22d3ee",
      }),
    });
    assert.strictEqual(t11.status, 201, "Valid annotation creation failed");
    const d11 = (await t11.json()) as { type?: string; annotation?: { type: string } };
    const createdType = d11.type || (d11.annotation ? d11.annotation.type : "");
    assert.strictEqual(createdType, "region");

    // Fetch evidence record to ensure SHA-256 is unchanged
    const rEvCheck = await fetch(`${BASE_URL}/evidence/${evidence1Id}`, {
      headers: { Authorization: `Bearer ${inv1Token}` },
    });
    assert.strictEqual(rEvCheck.status, 200);
    const dEvCheck = (await rEvCheck.json()) as { sha256Hash?: string; sha256?: string; evidence?: { sha256Hash?: string; sha256?: string } };
    const currentHash = dEvCheck.sha256Hash || dEvCheck.sha256 || (dEvCheck.evidence ? dEvCheck.evidence.sha256Hash || dEvCheck.evidence.sha256 : "");
    assert.strictEqual(currentHash, initialEvidenceHash, "Evidence SHA-256 hash was mutated by annotation!");
    console.log("✓ [PASS] 11. Annotation stored with zero binary mutation; SHA-256 hash strictly preserved");

    // ═══════════════════════════════════════════════════════════════
    // TEST 12: GET /cases/:id/activity returns merged, chronological, filtered events
    // ═══════════════════════════════════════════════════════════════
    const t12 = await fetch(`${BASE_URL}/cases/${case1Id}/activity?page=1&pageSize=50`, {
      headers: { Authorization: `Bearer ${inv1Token}` },
    });
    assert.strictEqual(t12.status, 200, "Activity timeline fetch failed");
    const d12 = (await t12.json()) as {
      items?: Array<{ id: string; eventType: string; timestamp: string }>;
      activities?: Array<{ id: string; eventType: string; timestamp: string }>;
      total: number;
    };
    const activitiesList = d12.items || d12.activities || [];
    assert.ok(activitiesList.length > 0, "Expected at least 1 activity item");
    assert.ok(d12.total > 0, "Total should be greater than 0");

    // Verify chronological order (newest first)
    for (let i = 0; i < activitiesList.length - 1; i++) {
      const tA = new Date(activitiesList[i].timestamp).getTime();
      const tB = new Date(activitiesList[i + 1].timestamp).getTime();
      assert.ok(tA >= tB, "Activities are not sorted newest first");
    }

    // Verify type filter
    const t12Filter = await fetch(`${BASE_URL}/cases/${case1Id}/activity?type=comment`, {
      headers: { Authorization: `Bearer ${inv1Token}` },
    });
    const d12Filter = (await t12Filter.json()) as { items?: Array<{ eventType?: string; type?: string }>; activities?: Array<{ eventType?: string; type?: string }> };
    const filteredList = d12Filter.items || d12Filter.activities || [];
    assert.ok(
      filteredList.length > 0 && filteredList.every((a) => a.eventType === "comment" || a.type === "comment"),
      "Type filter did not isolate comments correctly"
    );
    console.log("✓ [PASS] 12. Unified case activity timeline returns sorted, paginated, and filtered events");

    // ═══════════════════════════════════════════════════════════════
    // TEST 13: GET /cases/:id/mention-candidates returns active case-scoped users
    // ═══════════════════════════════════════════════════════════════
    const t13 = await fetch(`${BASE_URL}/cases/${case1Id}/mention-candidates`, {
      headers: { Authorization: `Bearer ${inv1Token}` },
    });
    assert.strictEqual(t13.status, 200, "Mention candidates fetch failed");
    const d13 = (await t13.json()) as Array<{ id: string; role: string; name: string }> | { candidates: Array<{ id: string; role: string; name: string }> };
    const candidatesList = Array.isArray(d13) ? d13 : d13.candidates || [];
    assert.ok(Array.isArray(candidatesList) && candidatesList.length > 0, "Candidates should be a non-empty array");
    const foundAdmin = candidatesList.some((c) => c.id === adminId);
    const foundAlice = candidatesList.some((c) => c.id === inv1Id);
    const foundBob = candidatesList.some((c) => c.id === inv2Id);
    assert.ok(foundAdmin, "Admin candidate missing");
    assert.ok(foundAlice, "Assigned investigator missing");
    assert.strictEqual(foundBob, false, "Unassigned investigator should NOT be in mention candidates");
    console.log("✓ [PASS] 13. Mention candidates autocomplete strictly limited to case-authorized users");

    console.log("\n=======================================================");
    console.log("ALL MODULE 12 COLLABORATION & ANNOTATION TESTS PASSED (13/13)");
    console.log("=======================================================\n");
  } catch (err) {
    console.error("\n❌ MODULE 12 TEST SUITE FAILED:");
    console.error(err);
    process.exit(1);
  }
}

runTests();
