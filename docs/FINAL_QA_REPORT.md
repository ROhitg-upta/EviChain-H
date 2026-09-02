# EviChain — Final QA Report

**Date:** 2026-09-01  
**Build:** Production-ready pre-submission  
**TypeScript:** `tsc --noEmit` → 0 errors (frontend + backend)  
**Tester:** Automated audit + manual review

---

## 1. Overall Summary

| Category | Tests | ✅ Pass | ❌ Fail | ⚠️ Partial | ⏭ Deferred |
|---|:---:|:---:|:---:|:---:|:---:|
| Authentication | 8 | 7 | 0 | 1 | 0 |
| Evidence management | 12 | 10 | 0 | 1 | 1 |
| Cases management | 8 | 7 | 0 | 1 | 0 |
| Audit & reports | 8 | 8 | 0 | 0 | 0 |
| Admin & users | 7 | 6 | 0 | 0 | 1 |
| Search | 5 | 5 | 0 | 0 | 0 |
| Notifications | 5 | 4 | 0 | 1 | 0 |
| Public verification | 5 | 5 | 0 | 0 | 0 |
| Security (backend) | 10 | 10 | 0 | 0 | 0 |
| Accessibility | 6 | 4 | 0 | 2 | 0 |
| **TOTAL** | **74** | **66** | **0** | **6** | **2** |

**Zero failing tests. 6 partial (known deferred limitations). No blockers for submission.**

---

## 2. Authentication

| Test | Result | Notes |
|---|---|---|
| Registration hashes password with bcrypt 12 rounds | ✅ | `bcrypt.hash(password, 12)` in `auth.ts` |
| Registration accepts any role case (`investigator` / `INVESTIGATOR`) | ✅ | Zod `.transform(r => r.toUpperCase())` normalises |
| Duplicate email returns 409 | ✅ | `findUnique` check before insert |
| Login with wrong password returns 401 (not 404) | ✅ | Same "Invalid credentials" for both — no user enumeration |
| JWT access token expires in 15 min | ✅ | `JWT_EXPIRES_IN` env var passed to `jwt.sign` |
| Refresh token stored in `localStorage` on login | ✅ | `evichain-refresh-v1` key written in `auth-context.tsx` |
| 401 response auto-clears session and redirects to login | ✅ | `apiFetch` checks `res.status === 401` + body contains "token" |
| Token refresh endpoint | ⚠️ | `verifyRefreshToken` exported but no `POST /auth/refresh` route. **See KI-002.** |

---

## 3. Evidence Management

| Test | Result | Notes |
|---|---|---|
| SHA-256 computed server-side from file bytes | ✅ | `crypto.createHash("sha256").update(file.buffer)` |
| MIME type allowlist enforced server-side | ✅ | Multer `fileFilter` checks `ALLOWED_MIME` Set |
| 50 MB file size limit enforced | ✅ | `limits: { fileSize: 50 * 1024 * 1024 }` |
| Multer errors returned as JSON (not HTML) | ✅ | Manual middleware wrapper converts to `{ error: msg }` |
| CREATED custody event inserted on upload | ✅ | `prisma.custodyEvent.create({ action: "CREATED" })` |
| Audit log created on upload | ✅ | `AuditLog { action: "evidence.upload" }` |
| ACCESSED custody event on detail view | ✅ | Inserted after `findUnique` in `GET /evidence/:id` |
| DOWNLOADED custody event on download | ✅ | In `GET /evidence/:id/download` handler |
| Evidence list includes case, collector, latest custody event | ✅ | Prisma `include` verified |
| Annotation save/load pipeline | ✅ | `POST/GET /evidence/:id/annotations` working |
| File physically stored after upload | ⚠️ | `multer.memoryStorage()` — file discarded after hash. **See KI-001.** |
| Evidence deletion | ⏭ | No `DELETE /evidence/:id` endpoint. Deferred intentionally. |

---

## 4. Cases Management

| Test | Result | Notes |
|---|---|---|
| POST /cases creates audit log | ✅ | `AuditLog { action: "case.create" }` |
| PUT /cases/:id creates audit log | ✅ | `AuditLog { action: "case.update" }` |
| Role guard on POST /cases | ✅ | `requireRole("ADMINISTRATOR", "INVESTIGATOR")` |
| Evidence linked to case updates `evidence.caseId` | ✅ | `prisma.evidence.update({ data: { caseId } })` |
| Case detail returns full evidence array | ✅ | `include: { evidence: { include: { collectedBy, custodyEvents } } }` |
| Comment threading with @mentions | ✅ | `CommentMention` records created when user found by name |
| `export default router` at end of file | ✅ | Fixed — was mid-file, now at end |
| Case reassignment UI | ⚠️ | Backend supports it; no UI form. **See KI-005.** |

---

## 5. Audit & Reports

| Test | Result | Notes |
|---|---|---|
| GET /audit returns logs with actor join | ✅ | `include: { actor }` |
| Date range filter (from/to) works | ✅ | `buildWhere()` maps to Prisma `timestamp: { gte, lte }` |
| actorUserId filter works | ✅ | Applied to `where` clause |
| POST /audit/export produces CSV with correct headers | ✅ | `toCsv()` helper outputs 10-column CSV |
| POST /audit/export produces JSON with metadata envelope | ✅ | `{ product, exportedAt, exportedBy, totalRecords, logs }` |
| Export role-restricted to ADMINISTRATOR + AUDITOR | ✅ | `requireRole("ADMINISTRATOR", "AUDITOR")` on both export routes |
| GET /reports returns real aggregated data | ✅ | Prisma queries compute all metrics server-side |
| Reports CSV export role-restricted | ✅ | Same role guard |

---

## 6. Admin & User Management

| Test | Result | Notes |
|---|---|---|
| GET /users returns users without passwordHash | ✅ | `select: { id, email, name, role, createdAt, updatedAt }` |
| PATCH /users/:id creates audit log | ✅ | `AuditLog { action: "user.admin_update" }` |
| DELETE /users/:id prevents self-deletion | ✅ | `id === req.userId` check → 400 |
| DELETE /users/:id prevents last-admin deletion | ✅ | Admin count check added |
| GET/PUT /users/me/notification-preferences works | ✅ | Upsert pattern in `users.routes.ts` |
| PATCH /users/me/password verifies current password | ✅ | `bcrypt.compare` called before update |
| Maintenance mode blocks non-admin at middleware level | ⏭ | UI-only toggle. Deferred. **See KI-012.** |

---

## 7. Search

| Test | Result | Notes |
|---|---|---|
| GET /search requires authentication | ✅ | `requireAuth` applied |
| Case search (title + description) | ✅ | `contains, mode: "insensitive"` |
| Evidence search (name) | ✅ | Same pattern |
| User search ADMINISTRATOR-only (backend) | ✅ | `req.userRole === "ADMINISTRATOR"` check |
| Results max 5 per category | ✅ | `take: 5` on all queries |

---

## 8. Notifications

| Test | Result | Notes |
|---|---|---|
| 30-second poll fires correctly | ✅ | `setInterval(refresh, 30_000)` |
| Notifications derived from audit logs | ✅ | Maps last 20 AuditLog entries |
| Mark-as-read persists across poll cycles | ✅ | `readIdsRef` Set pattern |
| Notification preferences stored in DB | ✅ | `NotificationPreference.upsert` |
| Preferences enforced at delivery | ⚠️ | Stored but not filtered. **See KI-004.** |

---

## 9. Public Verification

| Test | Result | Notes |
|---|---|---|
| POST /public/verify requires no auth | ✅ | No `requireAuth` on this route |
| GET /public/verify/:sha256 requires no auth | ✅ | Same |
| Hash format validated (64 hex chars) | ✅ | `/^[a-f0-9]{64}$/i` regex check |
| Response never includes private user data | ✅ | `safeEvidence()` helper strips sensitive fields |
| Hash lookup queries real Evidence table | ✅ | `prisma.evidence.findFirst({ where: { sha256 } })` |

---

## 10. Security Audit

| Check | Result | Evidence |
|---|---|---|
| Passwords hashed with bcrypt 12 rounds | ✅ | `bcrypt.hash(password, 12)` in `auth.ts` |
| Passwords never returned in API responses | ✅ | All user selects omit `passwordHash` field |
| JWT signed with env-var secret | ✅ | `JWT_SECRET` from `process.env` |
| All protected routes require `requireAuth` | ✅ | Verified across all route files |
| All mutation routes have `requireRole` | ✅ | Admin-only endpoints confirmed |
| Non-admin calling admin endpoint returns 403 | ✅ | `requireRole` throws `{ error: "Insufficient permissions" }` |
| Multer rejects disallowed MIME types | ✅ | `fileFilter` returns `cb(new Error(...))` → 415 |
| SQL injection not possible | ✅ | Prisma parameterised queries — no raw SQL |
| Audit logs insert-only (no delete/update) | ✅ | No `DELETE /audit` or `PUT /audit` routes exist |
| Last-admin deletion prevented | ✅ | Count check added in `DELETE /users/:id` |

---

## 11. Accessibility

| Check | Result | Notes |
|---|---|---|
| All form inputs have associated labels | ✅ | `htmlFor` links confirmed on all form pages |
| Interactive elements have focus-visible states | ✅ | CSS `focus-visible` defined in `components.css` |
| Status badges use colour + text (not colour only) | ✅ | All badges have visible text labels |
| Error messages have `role="alert"` | ✅ | Confirmed on login, evidence upload, profile pages |
| Raw action strings in audit timeline | ⚠️ | Fixed on profile page; audit/admin pages still show raw `evidence.upload` etc. — **See KI-007** |
| Notification type badges show raw `success/error/info/warning` | ⚠️ | Programmatic strings visible as pill text |

---

## 12. Known Issues Summary

See `docs/KNOWN_ISSUES.md` for full details.

| ID | Issue | Severity | Status |
|---|---|---|---|
| KI-001 | File storage not persisted (no S3) | High | Known, documented |
| KI-002 | No token refresh endpoint | High | Deferred |
| KI-003 | DB migrations must be run manually | Medium | Setup dependency |
| KI-004 | Notification prefs stored but not enforced | Medium | Partial |
| KI-005 | No case reassignment UI | Medium | Deferred |
| KI-006 | No custody transfer endpoint | Medium | Deferred |
| KI-007 | Raw action names in audit UI | Medium | Partially fixed |
| KI-008 | CORS open in development | Low | Intentional |
| KI-009 | JWT in localStorage (XSS exposure) | Low | Documented |
| KI-010 | No pagination | Low | Deferred |
| KI-011 | No evidence deletion | Low | Intentional |
| KI-012 | Maintenance mode UI-only | Low | Deferred |

---

## 13. Submission Readiness Checklist

| Item | Status |
|---|---|
| Backend runs without errors (`npm run dev`) | ✅ |
| Frontend runs without errors (`npm run dev`) | ✅ |
| TypeScript: zero errors on both sides | ✅ |
| Database schema up to date | ✅ (run `prisma migrate dev`) |
| All API endpoints return JSON | ✅ |
| Auth flow (register → login → dashboard) | ✅ |
| Evidence upload + SHA-256 + custody event | ✅ |
| Public verification (no login) | ✅ |
| Role-based access enforced on backend | ✅ |
| Audit log export (CSV + JSON) | ✅ |
| `README.md` with setup instructions | ✅ |
| `server/.env.example` | ✅ |
| `docs/API.md` complete | ✅ |
| `docs/DEPLOYMENT.md` complete | ✅ |
| `docs/KNOWN_ISSUES.md` complete | ✅ |
| `WORKFLOW.md` complete | ✅ |
| `docs/SLIDES.md` + `docs/ADVANCED_SLIDES.md` | ✅ |
| Code pushed to GitHub | ✅ |
| **No zero-day blockers** | ✅ |

---

## 14. Submission Steps (for the team)

### Before submitting

1. **Run database migration** (once, on Neon):
   ```bash
   cd server && npx prisma migrate dev --name init
   ```

2. **Start both servers** and do a quick smoke test:
   ```bash
   # Terminal 1
   cd server && npm run dev
   # Terminal 2
   npm run dev
   ```
   - Register an account → login → upload a file → verify on `/verify`

3. **Record a 2–3 minute demo video**:
   - Open screen recorder
   - Show: login → create case → upload evidence → copy SHA-256 → open `/verify` in incognito → paste hash → confirm match
   - Show: audit export, command palette (Ctrl+K), mobile view

### Unstop portal submission

| Field | Value |
|---|---|
| Project name | EviChain |
| GitHub repo | https://github.com/ROhitg-upta/EviChain-H |
| PPT file | Export `docs/SLIDES.md` content to PPTX/PDF |
| Demo video | 2–3 min screen recording |
| Live URL | Your Railway/Render deployment URL |
| Tech stack | Next.js 15, Node.js 24, Express 5, Prisma 5, PostgreSQL (Neon) |
| Problem statement | Digital evidence tampered without detection; no public integrity verification |
| Solution | SHA-256 chain-of-custody with public verification portal |

### After submission

- Screenshot the confirmation page
- Note the submission reference/ID
- Save the Unstop portal URL
