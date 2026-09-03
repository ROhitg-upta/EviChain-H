import assert from "assert";
import crypto from "crypto";

const API_URL = "http://localhost:4000";

async function runModule6Tests() {
  console.log("=== MODULE 6: PUBLIC EVIDENCE VERIFICATION TEST SUITE ===\n");

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

  // Helper setup: Create an investigator user, case, and registered evidence
  const testEmail = `mod6.investigator.${Date.now()}@evichain.local`;
  const regRes = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: testEmail,
      password: "Password123!Secure",
      name: "Inspector Alex Mercer",
      role: "INVESTIGATOR",
    }),
  });
  const regData = await regRes.json();
  const token = regData.accessToken;

  // Create case
  const caseRes = await fetch(`${API_URL}/cases`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: `Mod6 Verification Evidence Vault ${Date.now()}`,
      description: "Test case for public verification validation.",
      status: "Active",
      priority: "High",
    }),
  });
  const caseData = await caseRes.json();
  const caseId = caseData.id;

  // Register real evidence item
  const originalBytes = Buffer.from(
    `EVI-CHAIN PUBLIC VERIFICATION AUDIT PAYLOAD ${Date.now()} - ${crypto.randomBytes(16).toString("hex")}`
  );
  const knownSha256 = crypto.createHash("sha256").update(originalBytes).digest("hex");

  const form = new FormData();
  const blob = new Blob([originalBytes], { type: "text/plain" });
  form.append("file", blob, "audit_ledger_artifact.txt");
  form.append("name", "Audit Ledger Artifact");
  form.append("description", "Cryptographic ledger specimen.");
  form.append("evidenceType", "DOCUMENT");
  form.append("ownerOrg", "Forensic Lab 7");

  const uploadRes = await fetch(`${API_URL}/cases/${caseId}/evidence`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const uploadData = await uploadRes.json();
  assert.strictEqual(uploadRes.status, 201);
  const evidenceId = uploadData.id;

  // ────────────────────────────────────────────────────────────────
  // GROUP 1: HASH VERIFICATION (NO AUTH)
  // ────────────────────────────────────────────────────────────────

  await test("1. Valid matching hash returns VERIFIED and safe metadata", async () => {
    const res = await fetch(`${API_URL}/public/verify/hash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha256: knownSha256 }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.verified, true);
    assert.strictEqual(data.matched, true);
    assert.strictEqual(data.sha256, knownSha256);
    assert.strictEqual(data.result, "VERIFIED");
    assert.strictEqual(data.evidence.id, evidenceId);
    assert.strictEqual(data.evidence.name, "Audit Ledger Artifact");
    assert.strictEqual(data.evidence.ownerOrg, "Forensic Lab 7");
  });

  await test("2. Valid non-matching hash returns NOT_FOUND (verified: false)", async () => {
    const fakeHash = "a".repeat(64);
    const res = await fetch(`${API_URL}/public/verify/hash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha256: fakeHash }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.verified, false);
    assert.strictEqual(data.matched, false);
    assert.strictEqual(data.result, "NOT_FOUND");
    assert.strictEqual(data.sha256, fakeHash);
    assert.strictEqual(data.evidence, null);
  });

  await test("3. Uppercase hash is normalized to lowercase and matches", async () => {
    const uppercaseHash = knownSha256.toUpperCase();
    const res = await fetch(`${API_URL}/public/verify/hash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha256: uppercaseHash }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.verified, true);
    assert.strictEqual(data.sha256, knownSha256);
  });

  await test("4. Hash with surrounding whitespace is trimmed and verified", async () => {
    const paddedHash = `  ${knownSha256}  `;
    const res = await fetch(`${API_URL}/public/verify/hash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha256: paddedHash }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.verified, true);
    assert.strictEqual(data.sha256, knownSha256);
  });

  await test("5. Invalid length hash returns 400 with INVALID_SHA256", async () => {
    const shortHash = "abcd1234ef";
    const res = await fetch(`${API_URL}/public/verify/hash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha256: shortHash }),
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.code, "INVALID_SHA256");
  });

  await test("6. Non-hex characters return 400 with INVALID_SHA256", async () => {
    const nonHex = "g".repeat(64);
    const res = await fetch(`${API_URL}/public/verify/hash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha256: nonHex }),
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.code, "INVALID_SHA256");
  });

  await test("7. Missing sha256 field returns 400", async () => {
    const res = await fetch(`${API_URL}/public/verify/hash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.code, "INVALID_SHA256");
  });

  await test("8. Object/Array body instead of expected shape returns 400", async () => {
    const res = await fetch(`${API_URL}/public/verify/hash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha256: { nested: "invalid" } }),
    });
    assert.strictEqual(res.status, 400);
  });

  // ────────────────────────────────────────────────────────────────
  // GROUP 2: FILE VERIFICATION (NO AUTH)
  // ────────────────────────────────────────────────────────────────

  await test("9. Valid matching file returns VERIFIED and correct SHA-256", async () => {
    const fileForm = new FormData();
    const fileBlob = new Blob([originalBytes], { type: "text/plain" });
    fileForm.append("file", fileBlob, "audit_ledger_artifact.txt");

    const res = await fetch(`${API_URL}/public/verify/file`, {
      method: "POST",
      body: fileForm,
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.verified, true);
    assert.strictEqual(data.sha256, knownSha256);
    assert.strictEqual(data.evidence.id, evidenceId);
  });

  await test("10. Modified file returns NOT_FOUND with distinct computed SHA-256", async () => {
    const modifiedBytes = Buffer.from(`${originalBytes.toString("utf8")} -- TAMPERED`);
    const tamperedSha256 = crypto.createHash("sha256").update(modifiedBytes).digest("hex");

    const fileForm = new FormData();
    const fileBlob = new Blob([modifiedBytes], { type: "text/plain" });
    fileForm.append("file", fileBlob, "tampered_artifact.txt");

    const res = await fetch(`${API_URL}/public/verify/file`, {
      method: "POST",
      body: fileForm,
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.verified, false);
    assert.strictEqual(data.matched, false);
    assert.strictEqual(data.result, "NOT_FOUND");
    assert.strictEqual(data.sha256, tamperedSha256);
    assert.strictEqual(data.evidence, null);
  });

  await test("11. Server-computed hash matches independent local SHA-256 calculation", async () => {
    const randomBuffer = crypto.randomBytes(1024);
    const expectedHash = crypto.createHash("sha256").update(randomBuffer).digest("hex");

    const fileForm = new FormData();
    const fileBlob = new Blob([randomBuffer], { type: "application/octet-stream" });
    fileForm.append("file", fileBlob, "random_bytes.bin");

    const res = await fetch(`${API_URL}/public/verify/file`, {
      method: "POST",
      body: fileForm,
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.sha256, expectedHash);
  });

  await test("12. Missing file payload returns 400 FILE_REQUIRED", async () => {
    const emptyForm = new FormData();
    const res = await fetch(`${API_URL}/public/verify/file`, {
      method: "POST",
      body: emptyForm,
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.code, "FILE_REQUIRED");
  });

  await test("13. 0-byte empty file returns 400 FILE_EMPTY", async () => {
    const emptyForm = new FormData();
    const emptyBlob = new Blob([], { type: "text/plain" });
    emptyForm.append("file", emptyBlob, "empty.txt");

    const res = await fetch(`${API_URL}/public/verify/file`, {
      method: "POST",
      body: emptyForm,
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.code, "FILE_EMPTY");
  });

  await test("14. Dual POST /public/verify handles JSON hash and multipart file interchangeably", async () => {
    // Mode A: JSON hash
    const jsonRes = await fetch(`${API_URL}/public/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha256: knownSha256 }),
    });
    assert.strictEqual(jsonRes.status, 200);
    const jsonData = await jsonRes.json();
    assert.strictEqual(jsonData.verified, true);

    // Mode B: File upload
    const fileForm = new FormData();
    const fileBlob = new Blob([originalBytes], { type: "text/plain" });
    fileForm.append("file", fileBlob, "dual_test.txt");

    const fileRes = await fetch(`${API_URL}/public/verify`, {
      method: "POST",
      body: fileForm,
    });
    assert.strictEqual(fileRes.status, 200);
    const fileData = await fileRes.json();
    assert.strictEqual(fileData.verified, true);
  });

  await test("15. Read-only GET /public/verify/:sha256 returns identical verification payload", async () => {
    const res = await fetch(`${API_URL}/public/verify/${knownSha256}`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.verified, true);
    assert.strictEqual(data.sha256, knownSha256);
    assert.strictEqual(data.evidence.id, evidenceId);
  });

  // ────────────────────────────────────────────────────────────────
  // GROUP 3: SECURITY, PRIVACY & AUDITING
  // ────────────────────────────────────────────────────────────────

  await test("16. Public response strictly excludes private storage keys, passwords, and tokens", async () => {
    const res = await fetch(`${API_URL}/public/verify/hash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha256: knownSha256 }),
    });
    const data = await res.json();
    const str = JSON.stringify(data);

    assert.ok(!str.includes("storageKey"), "Must not leak storageKey");
    assert.ok(!str.includes("passwordHash"), "Must not leak passwordHash");
    assert.ok(!str.includes("password"), "Must not leak password");
    assert.ok(!str.includes("token"), "Must not leak token");
    assert.ok(!str.includes("secret"), "Must not leak secrets");
    assert.ok(!str.includes("s3://"), "Must not leak s3 URI");
    assert.ok(!str.includes("C:\\"), "Must not leak local filesystem path");
  });

  await test("17. Public verification creates an audit log entry with action public.verify", async () => {
    // Check audit logs for the recent verification action
    const auditRes = await fetch(`${API_URL}/audit?limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(auditRes.status, 200);
    const rawLogs = await auditRes.json();
    const logList = Array.isArray(rawLogs) ? rawLogs : rawLogs.items || [];
    const publicVerifyLogs = logList.filter((l: { action: string }) => l.action === "public.verify");
    assert.ok(publicVerifyLogs.length >= 1, "Must contain at least 1 public.verify audit log");
    assert.strictEqual(publicVerifyLogs[0].resourceType, "evidence");
  });

  await test("18. Unknown public endpoint returns structured JSON 404, not HTML", async () => {
    const res = await fetch(`${API_URL}/public/unknown-endpoint`);
    assert.strictEqual(res.status, 404);
    const ct = res.headers.get("content-type") || "";
    assert.ok(ct.includes("application/json"), "Must return application/json");
  });

  console.log("\n==================================================");
  console.log(`MODULE 6 TESTS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runModule6Tests().catch((err) => {
  console.error("FATAL ERROR IN MODULE 6 TESTS:", err);
  process.exit(1);
});
