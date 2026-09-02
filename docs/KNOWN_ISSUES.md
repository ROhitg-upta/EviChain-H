# EviChain — Known Issues, Limitations & Workarounds

**Last updated:** 2026-09-01  
**Status:** Pre-submission review

---

## Critical (Blocks Core Functionality)

### KI-001 — File Storage: Evidence Files Are Not Persisted After Upload

**Severity:** High  
**Status:** Known limitation, documented  
**Affects:** Evidence download, S3 integration

**Description:**  
`multer.memoryStorage()` holds the uploaded file in RAM only during the HTTP request. After SHA-256 is computed and the database record is created, the file bytes are discarded. The `storageKey` field records the intended path (`evidence/{timestamp}-{filename}`) but no file is written to disk or cloud storage.

**Impact:**  
- `GET /evidence/:id/download` returns metadata JSON + a note that file storage is not configured
- The DOWNLOADED custody event IS created correctly (audit trail works)
- Annotations work correctly (they reference the evidence ID, not the file bytes)
- Public hash verification works correctly (compares against stored SHA-256)

**Workaround:**  
The SHA-256 fingerprint and all metadata are preserved. For court submission, use the hash to prove integrity. Physical file custody must be maintained separately until S3 is integrated.

**Fix plan:**  
Add AWS S3 upload in `evidence.routes.ts` after SHA-256 computation. Environment variables (`AWS_ACCESS_KEY_ID`, `S3_BUCKET_NAME`) are already in `.env.example`. The `@aws-sdk/client-s3` package is already installed.

---

### KI-002 — No Token Refresh Endpoint

**Severity:** High  
**Status:** Known limitation  
**Affects:** Long sessions (>15 minutes of inactivity)

**Description:**  
The backend issues both `accessToken` (15 min) and `refreshToken` (7 days) on login. The refresh token is stored in `localStorage["evichain-refresh-v1"]` but there is no `POST /auth/refresh` endpoint to exchange it for a new access token.

**Impact:**  
- Users are silently redirected to `/login` after 15 minutes of inactivity
- All work-in-progress form data is lost on redirect
- `apiFetch` in `lib/api.ts` automatically handles the redirect on 401

**Workaround:**  
Log in again. The refresh token is stored and will be usable once the endpoint is built.

**Fix plan:**  
Add `POST /auth/refresh` to `auth.routes.ts` that calls `verifyRefreshToken`, then issues a new `signAccessToken`. No schema changes needed.

---

## Medium (Degrades Experience, Has Workaround)

### KI-003 — Database Migrations Not Applied to Neon

**Severity:** Medium  
**Status:** Setup dependency  
**Affects:** All API endpoints

**Description:**  
The Neon PostgreSQL database requires `npx prisma migrate dev --name init` to be run before any endpoints work. If this has not been run, all API calls return a Prisma connection or table-not-found error.

**Workaround:**  
```bash
cd server
npx prisma migrate dev --name init
```

---

### KI-004 — Notification Preferences Stored but Not Enforced

**Severity:** Medium  
**Status:** Partial implementation  
**Affects:** Notification filtering

**Description:**  
`GET/PUT /users/me/notification-preferences` stores preferences in `NotificationPreference` table. However, the `NotificationContext` polling logic in `notification-context.tsx` does not filter notifications based on these preferences — all audit events are shown regardless of preference settings.

**Workaround:**  
Users can still dismiss individual notifications. The polling continues to show all events.

**Fix plan:**  
In `notification-context.tsx`, after fetching audit logs, fetch preferences via `getNotificationPreferences()` and filter based on action type vs. preference toggles.

---

### KI-005 — Case Assignment UI Not Implemented

**Severity:** Medium  
**Status:** Deferred  
**Affects:** `/cases/:id` status page

**Description:**  
The `leadUserId` can only be set at case creation time. There is no UI to reassign the lead investigator after a case is created. The backend supports it via `PUT /cases/:id { leadUserId }` but there is no form for it.

**Workaround:**  
An ADMINISTRATOR can reassign via direct API call:
```bash
curl -X PUT http://localhost:4000/cases/:id \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"leadUserId":"new-user-uuid"}'
```

---

### KI-006 — Custody Transfer Not Implemented

**Severity:** Medium  
**Status:** Deferred  
**Affects:** Chain of custody completeness

**Description:**  
`TRANSFERRED` custody events are never created. There is no `POST /evidence/:id/transfer` endpoint. Custody events are created for CREATED, ACCESSED, and DOWNLOADED automatically, but physical custody handoffs cannot be recorded in the system.

**Workaround:**  
Document physical transfers outside the system and reference the evidence ID. All other custody events (access, download) are still logged.

---

### KI-007 — Raw Action Names in Audit Timeline and Admin Dashboard

**Severity:** Medium  
**Status:** Partially fixed (profile page fixed; audit/admin pages still show raw names)  
**Affects:** `/audit`, `/admin`, admin audit timeline

**Description:**  
Audit log action names (`evidence.upload`, `case.create`, `auth.login`) are displayed as raw dot-notation strings in the audit timeline and admin dashboard recent activity panel. This is technical jargon not suitable for non-technical users.

**Fix plan:**  
Apply the `fmtAction()` helper (already added to `profile/page.tsx`) to `audit/page.tsx` and `admin/page.tsx` timeline displays.

---

## Low (Cosmetic or Edge Case)

### KI-008 — CORS Accepts All Origins in Development

**Severity:** Low (development only)  
**Status:** Documented, intentional for dev  
**Affects:** Security hardening

**Description:**  
`cors()` in `server/src/index.ts` is called without an `origin` option, accepting requests from any domain. This is intentional for local development but must be restricted before production deployment.

**Fix plan:**  
Set `ALLOWED_ORIGIN` env var in production. See `server/.env.example` and `docs/DEPLOYMENT.md`.

---

### KI-009 — Token Storage in localStorage (XSS Exposure)

**Severity:** Low (acceptable for hackathon phase)  
**Status:** Documented limitation  
**Affects:** Security posture

**Description:**  
JWT access and refresh tokens are stored in `localStorage`, which is accessible to any JavaScript on the same origin. An XSS vulnerability would expose the tokens. Production-grade systems use `httpOnly` cookies.

**Fix plan:**  
Migrate to `httpOnly` cookies with `SameSite=Strict` in a future release. Requires backend session endpoint changes.

---

### KI-010 — No Pagination on List Endpoints

**Severity:** Low  
**Status:** Deferred  
**Affects:** Performance at scale

**Description:**  
`GET /evidence`, `GET /cases`, and `GET /audit` all have hard-coded `take: 100` or `take: 500` limits. No cursor-based or offset pagination is implemented.

**Workaround:**  
Use the `limit` query param on `/audit` (max 500). For evidence and cases, the 100-record cap is sufficient for hackathon scale.

---

### KI-011 — Evidence Deletion Not Implemented

**Severity:** Low  
**Status:** Deferred  
**Affects:** Data management

**Description:**  
There is no `DELETE /evidence/:id` endpoint. Evidence records cannot be removed once uploaded. This is intentional for chain-of-custody immutability but prevents correction of test/accidental uploads.

**Workaround:**  
Mark evidence as `FLAGGED` status to indicate it should be ignored. An ADMINISTRATOR can remove records directly from the database via Prisma Studio: `npx prisma studio`.

---

### KI-012 — Maintenance Mode UI-Only

**Severity:** Low  
**Status:** Deferred  
**Affects:** Admin settings page

**Description:**  
The maintenance mode toggle on `/admin/settings` saves to `localStorage` only. It does not add any middleware to the Express server to block non-admin requests.

**Workaround:**  
For emergency maintenance, stop the backend process (`Ctrl+C`). The frontend will show the "Cannot reach the server" error to all users.

---

## Verified Working (Previously Flagged, Now Fixed)

| Item | Was | Fixed |
|---|---|---|
| Role case mismatch (`AUDITOR` vs `Auditor`) | canEdit always true for Auditors | ✅ Fixed — `normaliseRole()` in `auth-context.tsx` |
| Admin nav link never rendered | Role check compared `"Administrator"` vs `"ADMINISTRATOR"` | ✅ Fixed — same normaliseRole fix |
| `getMyActivity` returned empty | `actorUserId=me` treated as literal UUID | ✅ Fixed — removed broken filter param |
| `markAsRead` reset on next poll | `read: false` hardcoded in poll | ✅ Fixed — `readIdsRef` Set persists read state |
| `export default router` mid-file | Annotation/comment routes potentially unreachable | ✅ Fixed — moved to end of both route files |
| `DELETE /users/:id` — last admin deletable | No guard existed | ✅ Fixed — admin count check added |
| No audit log on login/register | DB events never written | ✅ Fixed — `AuditLog { action: "auth.login/register" }` |
| Profile page shows developer notes to users | Toast messages contained `"backend endpoint pending"` | ✅ Fixed — clean user-facing copy |
| Notification preferences endpoint missing | `GET/PUT /users/me/notification-preferences` returned 404 | ✅ Fixed — endpoints added to `users.routes.ts` |
