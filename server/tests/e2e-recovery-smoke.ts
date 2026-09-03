import assert from "assert";
import crypto from "crypto";

const API_URL = "http://localhost:4000";

async function runSmokeTests() {
  console.log("==================================================");
  console.log("STARTING EVICHAIN RECOVERY E2E SMOKE TEST");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ [FAIL] ${name}:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  // 1. Health check
  await test("GET /health returns 200 with service and connected database", async () => {
    const res = await fetch(`${API_URL}/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.service, "evichain-api");
    assert.strictEqual(data.database, "connected");
  });

  // 2. 404 Structured JSON
  await test("Unknown API route returns structured JSON 404", async () => {
    const res = await fetch(`${API_URL}/non-existent-api-endpoint`);
    assert.strictEqual(res.status, 404);
    const ct = res.headers.get("content-type") || "";
    assert.ok(ct.includes("application/json"), "Content-type must be JSON");
    const data = await res.json();
    assert.strictEqual(data.error?.code, "ROUTE_NOT_FOUND");
  });

  // 3. User Login & Token
  const testEmail = `lead.forensics.${Date.now()}@evichain.local`;
  const testPassword = "Password123!Secure";
  let accessToken = "";
  let userId = "";

  await test("POST /auth/register creates investigator user and returns tokens", async () => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: "Dr. Elena Rostova",
        role: "INVESTIGATOR",
      }),
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.accessToken, "Must return accessToken");
    assert.strictEqual(data.user.role, "INVESTIGATOR");
    accessToken = data.accessToken;
    userId = data.user.id;
  });

  await test("GET /auth/me returns authenticated investigator profile", async () => {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.user.email, testEmail);
    assert.strictEqual(data.user.role, "INVESTIGATOR");
  });

  // 4. Case Management Flow
  let createdCaseId = "";
  await test("POST /cases creates a new investigation case", async () => {
    const res = await fetch(`${API_URL}/cases`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        title: `Operation Silver Horizon — ${Date.now()}`,
        description: "Forensic analysis of encrypted drive artifacts.",
        status: "Active",
        priority: "High",
      }),
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.id);
    createdCaseId = data.id;
  });

  await test("GET /cases/:id retrieves case detail with lead relation", async () => {
    const res = await fetch(`${API_URL}/cases/${createdCaseId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.id, createdCaseId);
    assert.strictEqual(data.lead?.id, userId);
  });

  await test("GET /cases/:id with non-existent ID returns structured 404", async () => {
    const res = await fetch(`${API_URL}/cases/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.code, "CASE_NOT_FOUND");
  });

  // 5. Evidence Upload and Server-Side SHA-256 Flow
  let createdEvidenceId = "";
  let fileSha256 = "";
  const fileBytes = Buffer.from(
    `CRITICAL FORENSIC EVIDENCE PAYLOAD ${Date.now()}-${crypto.randomBytes(8).toString("hex")} - CONFIDENTIAL`
  );
  fileSha256 = crypto.createHash("sha256").update(fileBytes).digest("hex");

  await test("POST /cases/:id/evidence uploads binary file and verifies SHA-256", async () => {
    const form = new FormData();
    const blob = new Blob([fileBytes], { type: "text/plain" });
    form.append("file", blob, "device_memory_dump.raw");
    form.append("name", "Device Memory Dump");
    form.append("description", "RAM extraction taken at scene.");
    form.append("evidenceType", "LOG");
    form.append("ownerOrg", "Cyber Division");

    const res = await fetch(`${API_URL}/cases/${createdCaseId}/evidence`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.sha256, fileSha256);
    assert.strictEqual(data.currentCustodianId, userId);
    createdEvidenceId = data.id;
  });

  await test("GET /evidence/:id retrieves full record and custody events", async () => {
    const res = await fetch(`${API_URL}/evidence/${createdEvidenceId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.id, createdEvidenceId);
    assert.strictEqual(data.sha256, fileSha256);
    assert.ok(Array.isArray(data.custodyEvents));
    assert.ok(data.custodyEvents.length >= 1);
    assert.strictEqual(data.custodyEvents[0].action, "CREATED");
  });

  await test("GET /evidence/:id/download streams exact binary matching SHA-256", async () => {
    const res = await fetch(`${API_URL}/evidence/${createdEvidenceId}/download`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.strictEqual(res.status, 200);
    const buf = Buffer.from(await res.arrayBuffer());
    const downloadedSha256 = crypto.createHash("sha256").update(buf).digest("hex");
    assert.strictEqual(downloadedSha256, fileSha256);
    assert.strictEqual(buf.toString("utf8"), fileBytes.toString("utf8"));
  });

  // 6. Public Verification (No auth required)
  await test("GET /public/verify/hash/:hash verifies evidence without authentication", async () => {
    const res = await fetch(`${API_URL}/public/verify/hash/${fileSha256}`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.matched, true);
    assert.strictEqual(data.sha256, fileSha256);
    assert.strictEqual(data.evidence?.id, createdEvidenceId);
  });

  // 7. Custody Transfer
  const secondEmail = `custodian.transfer.${Date.now()}@evichain.local`;
  let secondUserId = "";
  await test("POST /evidence/:id/transfer transfers custody to another investigator", async () => {
    // Register second investigator
    const regRes = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: secondEmail,
        password: testPassword,
        name: "Officer Marcus Vance",
        role: "INVESTIGATOR",
      }),
    });
    const regData = await regRes.json();
    secondUserId = regData.user.id;

    const res = await fetch(`${API_URL}/evidence/${createdEvidenceId}/transfer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        toUserId: secondUserId,
        toLocation: "Forensic Lab B — Vault 4",
        note: "Handed over for hardware-level bus extraction",
      }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.currentCustodian.id, secondUserId);
  });

  // 8. Auditor Role Enforcement
  const auditorEmail = `auditor.${Date.now()}@evichain.local`;
  let auditorToken = "";
  await test("Auditor cannot download evidence binary (403 AUDITOR_DOWNLOAD_RESTRICTED)", async () => {
    const regRes = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: auditorEmail,
        password: testPassword,
        name: "Auditor Sarah Chen",
        role: "AUDITOR",
      }),
    });
    const regData = await regRes.json();
    auditorToken = regData.accessToken;

    const res = await fetch(`${API_URL}/evidence/${createdEvidenceId}/download`, {
      headers: { Authorization: `Bearer ${auditorToken}` },
    });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.code, "AUDITOR_DOWNLOAD_RESTRICTED");
  });

  // 9. Unauthorized / Missing Token
  await test("Protected routes reject unauthenticated requests with 401", async () => {
    const res = await fetch(`${API_URL}/cases`);
    assert.strictEqual(res.status, 401);
  });

  console.log("==================================================");
  console.log(`SMOKE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runSmokeTests().catch((err) => {
  console.error("FATAL ERROR IN SMOKE TEST:", err);
  process.exit(1);
});
