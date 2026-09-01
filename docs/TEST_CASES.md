# EviChain — Manual Test Cases & Security Checklist

**Version:** 1.0 — post-QA-verification-pass  
**Tested against:** Next.js 15.3 frontend + Express 5 backend + Prisma 5 + PostgreSQL (Neon)  
**How to use:** Run each test case manually. Mark ✅ Pass / ❌ Fail / ⏭ Skip (out of scope). Note any failure details.

---

## Part 1 — Authentication Test Cases

### TC-AUTH-001: Successful Registration
**Precondition:** Backend running on port 4000. Email not previously registered.
**Steps:**
1. Navigate to `http://localhost:3000/login`
2. Click "Register" tab
3. Fill: Name = "Test User", Email = "test@lab.gov", Password = "TestPass123!", Role = "Investigator"
4. Click "Create account"

**Expected:**
- Redirected to `http://localhost:3000/`
- Dashboard shows user's name in sidebar
- User role displayed correctly as "Investigator" (title-case)
- `localStorage["evichain-session-v1"]` contains user JSON
- `localStorage["evichain-token-v1"]` contains JWT
- `localStorage["evichain-refresh-v1"]` contains refresh token
- AuditLog row created with `action = "auth.register"`

**Result:** ___  **Notes:** ___

---

### TC-AUTH-002: Duplicate Email Registration
**Steps:**
1. Attempt to register with an email already in the database

**Expected:**
- Error message: "Email already registered"
- No new user created in database

**Result:** ___

---

### TC-AUTH-003: Weak Password
**Steps:**
1. Register with password "abc" (under 8 chars)

**Expected:**
- Form shows field-level error before submission OR
- API returns `400` with `fieldErrors.password` containing the error

**Result:** ___

---

### TC-AUTH-004: Successful Login
**Precondition:** User registered in TC-AUTH-001 exists.
**Steps:**
1. Sign out (if logged in)
2. Go to `/login` → Sign in tab
3. Enter correct credentials
4. Click "Sign in"

**Expected:**
- Redirected to dashboard
- AuditLog row created with `action = "auth.login"`

**Result:** ___

---

### TC-AUTH-005: Wrong Password
**Steps:**
1. Login with correct email but wrong password

**Expected:**
- Error: "Invalid credentials" (NOT "user not found" — no enumeration)
- User remains on login page

**Result:** ___

---

### TC-AUTH-006: Session Persistence on Refresh
**Steps:**
1. Log in successfully
2. Hard-refresh the browser (Ctrl+Shift+R)

**Expected:**
- User remains logged in (not redirected to /login)
- Dashboard loads with correct user data

**Result:** ___

---

### TC-AUTH-007: Auto-Logout on Expired Token
**Steps:**
1. Log in
2. Manually corrupt the token in localStorage: `localStorage["evichain-token-v1"] = "invalid"`
3. Navigate to `/evidence`

**Expected:**
- Automatically redirected to `/login`
- localStorage keys cleared

**Result:** ___

---

### TC-AUTH-008: Auditor Cannot Edit
**Steps:**
1. Register/login as Auditor role
2. Navigate to `/evidence/new`

**Expected:**
- "Auditor mode — evidence upload is disabled" banner shown
- Upload button disabled

**Result:** ___

---

## Part 2 — Evidence Management Test Cases

### TC-EV-001: Successful File Upload
**Precondition:** Logged in as Investigator or Administrator.
**Steps:**
1. Navigate to `/evidence/new`
2. Drop or select a JPEG image file (< 5 MB)
3. Fill name = "Test Evidence"
4. Click "Register evidence"

**Expected:**
- Progress bar reaches 100%
- Success screen shows evidence ID and full 64-char SHA-256 hash
- Evidence record visible in `/evidence` list
- CustodyEvent with `action = "CREATED"` exists in DB
- AuditLog with `action = "evidence.upload"` exists in DB
- Status = "PENDING"

**Result:** ___

---

### TC-EV-002: File Over 50 MB Rejected Client-Side
**Steps:**
1. Attempt to select a file > 50 MB

**Expected:**
- Error shown immediately: "File is too large — maximum size is 50 MB."
- No upload initiated

**Result:** ___

---

### TC-EV-003: Disallowed MIME Type Rejected
**Steps:**
1. Rename an `.exe` file to `.jpg` or use a file with content-type `application/x-msdownload`
2. Attempt upload

**Expected:**
- Server returns `415 File type not allowed`
- Frontend shows error message

**Result:** ___

---

### TC-EV-004: SHA-256 Hash Consistency
**Steps:**
1. Upload a known file (e.g., a 1KB text file)
2. Note the SHA-256 shown on success screen
3. Run `sha256sum <file>` or use an online SHA-256 calculator on the same file
4. Compare

**Expected:**
- Hash from EviChain exactly matches the independently computed hash

**Result:** ___  **Computed hash:** ___  **EviChain hash:** ___

---

### TC-EV-005: ACCESSED Custody Event on View
**Steps:**
1. Navigate to `/evidence/:id`
2. Note the custody timeline

**Expected:**
- A new "ACCESSED" custody event appears at the top of the timeline with your name and current timestamp

**Result:** ___

---

### TC-EV-006: DOWNLOADED Custody Event on Download
**Steps:**
1. On evidence detail page, click "Download"

**Expected:**
- A "DOWNLOADED" custody event is logged
- Response shows metadata + note about file storage placeholder

**Result:** ___

---

### TC-EV-007: Public Hash Verification — File Match
**Steps:**
1. Navigate to `/verify`
2. Upload the same file that was registered in TC-EV-001

**Expected:**
- "Hash match — integrity confirmed"
- Shows evidence name, owner, status, registered date
- "View full record →" link

**Result:** ___

---

### TC-EV-008: Public Hash Verification — No Match
**Steps:**
1. Navigate to `/verify`
2. Upload a file that was NOT registered

**Expected:**
- "No matching record found"
- Shows computed SHA-256 hash
- No evidence details

**Result:** ___

---

### TC-EV-009: Public Hash Lookup by SHA-256 String
**Steps:**
1. Navigate to `/verify` → "Check a hash" tab
2. Paste a valid 64-char SHA-256 of a registered file

**Expected:**
- Match found with evidence details

**Result:** ___

---

### TC-EV-010: Invalid Hash Format Rejected
**Steps:**
1. `/verify` → "Check a hash" tab
2. Enter "not-a-hash"
3. Click submit

**Expected:**
- Client-side error: "Invalid SHA-256 hash — must be exactly 64 hexadecimal characters"
- No API call made

**Result:** ___

---

## Part 3 — Case Management Test Cases

### TC-CASE-001: Create Case
**Precondition:** Logged in as Investigator.
**Steps:**
1. Navigate to `/cases/new`
2. Fill title = "Test Investigation 001", priority = "High"
3. Click "Create case"

**Expected:**
- Redirected to `/cases/:id`
- Case status = "Active" by default
- `leadUserId` = logged-in user's ID
- AuditLog with `action = "case.create"` exists

**Result:** ___

---

### TC-CASE-002: Custodian Cannot Create Case
**Steps:**
1. Login as Custodian
2. Navigate to `/cases/new`

**Expected:**
- "Auditor mode — case creation is disabled" banner OR
- API returns `403 Insufficient permissions`

**Result:** ___

---

### TC-CASE-003: Case Status Update
**Steps:**
1. Open a case detail page
2. Change status dropdown to "Closed"
3. Click "Update status"

**Expected:**
- Success banner: "Status updated to Closed"
- AuditLog with `action = "case.update"` and `detailJson.status = "Closed"`

**Result:** ___

---

### TC-CASE-004: Link Evidence to Case
**Steps:**
1. Upload evidence (TC-EV-001 prerequisite)
2. Open a case detail page
3. Click "+ Add evidence"
4. Upload the same file with the case pre-selected

**Expected:**
- Evidence appears in case's evidence list
- `evidence.caseId` updated in DB

**Result:** ___

---

### TC-CASE-005: Add Comment with @Mention
**Steps:**
1. Open a case detail page
2. Type: "Please review @Test User"
3. Click "Post comment"

**Expected:**
- Comment appears in discussion section
- @mention rendered in brand color
- AuditLog with `action = "case.comment"`

**Result:** ___

---

## Part 4 — Audit & Reports Test Cases

### TC-AUDIT-001: Audit Log Filters
**Steps:**
1. Navigate to `/audit`
2. Filter by action type "evidence.upload"

**Expected:**
- Only upload events shown
- Each row has actor name, timestamp, resource ID

**Result:** ___

---

### TC-AUDIT-002: CSV Export
**Steps:**
1. Navigate to `/audit/export`
2. Select CSV format
3. Click "Download CSV"

**Expected:**
- File downloads as `audit-export-YYYY-MM-DD.csv`
- CSV has headers: id, timestamp, action, resourceType, resourceId, actorUserId, actorName, actorRole, ipAddress, details
- Data rows contain real records

**Result:** ___

---

### TC-AUDIT-003: Non-Admin Cannot Export (Frontend)
**Steps:**
1. Login as Investigator
2. Navigate to `/audit/export`

**Expected:**
- "Only Administrators and Auditors can export audit logs" banner
- Export button disabled in UI

**Result:** ___

---

### TC-AUDIT-004: Non-Admin Cannot Export (Backend)
**Steps:**
1. Get an Investigator JWT
2. Directly call: `curl -X POST http://localhost:4000/audit/export -H "Authorization: Bearer <investigator-token>"`

**Expected:**
- `403 Insufficient permissions`
- Role enforcement is backend-side, not just UI

**Result:** ___  ← **Security-critical test**

---

### TC-REPORTS-001: Reports Load with Real Data
**Steps:**
1. Ensure some cases and evidence exist
2. Navigate to `/reports`
3. Select "Last 90 days"

**Expected:**
- Stats strip shows correct counts (not zeros if data exists)
- Charts render without error
- `totalCases` matches actual case count in DB

**Result:** ___

---

## Part 5 — Admin Test Cases

### TC-ADMIN-001: Admin Nav Link Visible
**Steps:**
1. Login as Administrator

**Expected:**
- "Admin" link visible in sidebar navigation
- Navigates to `/admin` successfully

**Result:** ___

---

### TC-ADMIN-002: Admin Nav Link Hidden from Others
**Steps:**
1. Login as Investigator

**Expected:**
- No "Admin" link in sidebar

**Result:** ___

---

### TC-ADMIN-003: User List
**Steps:**
1. Login as Administrator
2. Navigate to `/admin/users`

**Expected:**
- All registered users listed with name, email, role, joined date
- No `passwordHash` field exposed

**Result:** ___

---

### TC-ADMIN-004: Cannot Delete Last Admin
**Steps:**
1. Ensure only one ADMINISTRATOR account exists
2. Login as that administrator
3. Call: `DELETE /users/:admin-id` with the admin's own token (on another admin's ID)

**Expected:**
- `400 Cannot delete the last administrator account. Promote another user first.`

**Result:** ___  ← **Security-critical test**

---

### TC-ADMIN-005: Cannot Delete Self
**Steps:**
1. Call `DELETE /users/:own-id` with own token

**Expected:**
- `400 You cannot delete your own account.`

**Result:** ___

---

## Part 6 — Profile Test Cases

### TC-PROFILE-001: Change Display Name
**Steps:**
1. Navigate to `/profile` → General tab
2. Change name to "Updated Name"
3. Click "Save changes"

**Expected:**
- Toast: "Profile saved locally (backend endpoint pending)" OR
- Toast: "Profile updated" (if backend connected)
- AuditLog with `action = "user.update_profile"`

**Result:** ___

---

### TC-PROFILE-002: Change Password
**Steps:**
1. Navigate to `/profile` → Security tab
2. Enter current password, new password (8+ chars), confirm
3. Click "Update password"

**Expected:**
- Success response
- Can login with new password

**Result:** ___

---

### TC-PROFILE-003: Wrong Current Password
**Steps:**
1. Profile → Security → enter wrong current password

**Expected:**
- Error: "Current password is incorrect"

**Result:** ___

---

### TC-PROFILE-004: Notification Preferences Saved
**Steps:**
1. Profile → Notifications → toggle off "Case Updates"
2. Click "Save preferences"

**Expected:**
- Preference record upserted in DB
- Setting persists on page refresh

**Result:** ___

---

## Part 7 — Search Test Cases

### TC-SEARCH-001: Command Palette Opens
**Steps:**
1. Press `Ctrl+K` (or `Cmd+K` on Mac)

**Expected:**
- Command palette modal opens
- Static actions visible immediately
- Input focused

**Result:** ___

---

### TC-SEARCH-002: Search Returns Results
**Steps:**
1. Open palette
2. Type "midnight" (or a known case title)
3. Wait 250ms

**Expected:**
- Results grouped by type (Case, Evidence)
- Arrow keys navigate
- Enter selects and navigates

**Result:** ___

---

### TC-SEARCH-003: Escape Closes Palette
**Steps:**
1. Open palette
2. Press Escape

**Expected:**
- Palette closes, query cleared

**Result:** ___

---

## Part 8 — Edge Cases & Error States

### TC-EDGE-001: Backend Down
**Steps:**
1. Stop the backend (`Ctrl+C` in server terminal)
2. Attempt to login

**Expected:**
- Error: "Cannot reach the server — is the backend running on port 4000?"
- Not "Unexpected token '<'" or a blank error

**Result:** ___

---

### TC-EDGE-002: Network Drop During Upload
**Steps:**
1. Start uploading a large file
2. Disconnect network mid-upload

**Expected:**
- XHR onerror fires
- Error message shown: "Cannot reach the server…"
- No partial record created in DB

**Result:** ___

---

### TC-EDGE-003: Large File (50 MB Boundary)
**Steps:**
1. Upload a file that is exactly 50.0 MB (52,428,800 bytes)

**Expected:**
- Should succeed (boundary is inclusive)
- Upload a file of 50.1 MB
- Should fail with "Upload error: File too large"

**Result:** ___

---

### TC-EDGE-004: SQL-Like Characters in Case Title
**Steps:**
1. Create case with title: `Test'; DROP TABLE "Case"; --`

**Expected:**
- Case created normally
- Title stored literally (Prisma parameterised queries prevent injection)

**Result:** ___

---

### TC-EDGE-005: Empty Evidence Registry
**Steps:**
1. Login with a fresh account with no evidence

**Expected:**
- `/evidence` shows empty state: "No evidence registered yet"
- Link to `/evidence/new`

**Result:** ___

---

## Part 9 — Security Audit Checklist

| # | Check | How to Verify | Status |
|---|---|---|---|
| SEC-01 | Passwords hashed with bcrypt (12 rounds) | Check DB — `passwordHash` column starts with `$2b$12$` | ___ |
| SEC-02 | Passwords never returned in API responses | Call `GET /users` and `GET /users/me` — confirm no `passwordHash` field | ___ |
| SEC-03 | JWT signed with strong secret | Check `server/.env` — `JWT_SECRET` is 32+ random chars | ___ |
| SEC-04 | Access token expires in 15 min | Decode JWT at jwt.io — check `exp` claim | ___ |
| SEC-05 | Protected routes return 401 without token | `curl http://localhost:4000/evidence` (no Authorization header) → `401` | ___ |
| SEC-06 | Non-admin cannot access admin endpoints | Use Investigator token on `GET /users` → `403` | ___ |
| SEC-07 | Auditor cannot upload evidence | Use Auditor token on `POST /evidence` → `403` | ___ |
| SEC-08 | Non-admin cannot export audit logs | Use Investigator token on `POST /audit/export` → `403` | ___ |
| SEC-09 | MIME type allowlist enforced server-side | Send `.exe` file to `POST /evidence` → `415` | ___ |
| SEC-10 | File size limit enforced server-side | Send 51 MB file to `POST /evidence` → `400 Upload error: File too large` | ___ |
| SEC-11 | SHA-256 computed server-side (not trusted from client) | Upload file, compare server hash with `sha256sum` output | ___ |
| SEC-12 | Audit logs are insert-only (no update/delete endpoint) | Search codebase — no `DELETE /audit` or `PUT /audit` routes | ___ |
| SEC-13 | Last-admin deletion prevented | `DELETE /users/:only-admin-id` → `400 Cannot delete the last administrator` | ___ |
| SEC-14 | Self-deletion prevented | `DELETE /users/:own-id` with own token → `400` | ___ |
| SEC-15 | SQL injection not possible | Create evidence with `'; DROP TABLE "Evidence"; --` in name → stored literally | ___ |
| SEC-16 | XSS in comments — @mention rendered safely | Post comment with `<script>alert(1)</script>` → rendered as text, not executed | ___ |
| SEC-17 | Public verify returns no sensitive user data | `GET /public/verify/:sha256` → response has no email, userId, or internal fields | ___ |
| SEC-18 | CORS configured (production only) | Check `server/src/index.ts` — `cors()` called. Note: full restriction is a pending hardening item | ___ |

---

## Part 10 — Performance Benchmarks

Run these after the backend is deployed to production (not local).

| Test | Tool | Target | Result |
|---|---|---|---|
| 10 MB upload time | Browser DevTools Network tab | < 10 seconds | ___ |
| 50 MB upload time | Browser DevTools Network tab | < 45 seconds | ___ |
| `GET /evidence` response | `curl -w "%{time_total}"` | < 500 ms | ___ |
| `GET /cases` response | `curl -w "%{time_total}"` | < 500 ms | ___ |
| `GET /audit?limit=100` | `curl -w "%{time_total}"` | < 1 second | ___ |
| Dashboard page load (cold) | Lighthouse → Performance | Score > 70 | ___ |
| Login page load | Lighthouse → Performance | Score > 80 | ___ |
| Lighthouse Accessibility | Lighthouse → Accessibility | Score > 85 | ___ |

**Lighthouse command:**
```bash
npx lighthouse http://localhost:3000/login --output json --output-path ./lighthouse-report.json
```

---

## Test Execution Log

| Date | Tester | Environment | Pass | Fail | Skip | Notes |
|---|---|---|---|---|---|---|
| | | dev local | | | | |
| | | staging | | | | |
| | | production | | | | |
