# EviChain — Comprehensive REST API Reference Matrix

This reference documents every API endpoint across all 13 modules of EviChain, detailing HTTP method, route path, authentication requirement, RBAC role gating, and operation description.

---

## 1. Authentication & Sessions (`/auth`)

| Method | Endpoint | Auth Required | Role Required | Description |
|---|---|---|---|---|
| `POST` | `/auth/register` | None | Open | Self-registers a new operator (ADMINISTRATOR, INVESTIGATOR, AUDITOR, CUSTODIAN). |
| `POST` | `/auth/login` | None | Open | Authenticates credentials, checks `isActive`, issues JWT access token + refresh cookie. |
| `POST` | `/auth/refresh` | Cookie / Body | Open | Rotates refresh token and issues new access token. |
| `POST` | `/auth/logout` | Optional | Open | Revokes refresh cookie and logs `auth.logout` audit record. |
| `GET` | `/auth/me` | Bearer Token | Any active user | Retrieves profile of currently authenticated operator. |

---

## 2. Case Management (`/cases`)

| Method | Endpoint | Auth Required | Role Required | Description |
|---|---|---|---|---|
| `GET` | `/cases` | Bearer Token | Any active user | Lists cases (filtered by search query, status, or lead investigator). |
| `GET` | `/cases/:id` | Bearer Token | Lead, Assigned, Admin, Auditor | Retrieves full case dossier with evidence list and access checks. |
| `POST` | `/cases` | Bearer Token | `ADMINISTRATOR`, `INVESTIGATOR` | Creates a new case ledger; auto-assigns creator as lead investigator. |
| `PATCH` | `/cases/:id` | Bearer Token | Lead Investigator, Admin | Partial update of case title, description, status, priority. |
| `DELETE` | `/cases/:id` | Bearer Token | `ADMINISTRATOR` only | Deletes case with safe cascade unlinking of associated evidence. |
| `GET` | `/cases/:id/mention-candidates` | Bearer Token | Case Authorized | Returns active users authorized on this case for @mention autocomplete. |
| `GET` | `/cases/:id/activity` | Bearer Token | Case Authorized | Chronological timeline merging comments, annotations, custody, uploads, and audit logs. |
| `GET` | `/cases/:id/export/pdf` | Bearer Token | Case Authorized | Generates court-admissible Case Intelligence Summary PDF report. |

---

## 3. Evidence Repository & Integrity (`/evidence`)

| Method | Endpoint | Auth Required | Role Required | Description |
|---|---|---|---|---|
| `GET` | `/evidence` | Bearer Token | Any active user | Lists registered evidence items with case, collector, and latest custody metadata. |
| `GET` | `/evidence/:id` | Bearer Token | Any active user | Retrieves evidence details with 5-minute throttled access logging. |
| `POST` | `/evidence` | Bearer Token | Admin, Investigator, Custodian | Uploads single evidence file, verifies MIME/size, computes SHA-256 hash. |
| `POST` | `/cases/:caseId/evidence` | Bearer Token | Admin, Case Investigator | Ingests evidence directly anchored to an active investigation case. |
| `POST` | `/evidence/bulk-upload` | Bearer Token | Admin, Investigator, Custodian | Ingests up to 20 files in a single atomic batch transaction. |
| `GET` | `/evidence/:id/download` | Bearer Token | Admin, Investigator, Custodian | Secure streaming download of raw evidence binary (Auditor blocked: 403). |
| `GET` | `/evidence/bulk-download` | Bearer Token | Admin, Case Investigator | Streams a compressed zip archive containing selected evidence files. |
| `GET` | `/evidence/:id/certificate` | Bearer Token | Any active user | Generates a certified Section 65B forensic authenticity PDF certificate. |
| `GET` | `/evidence/export/csv` | Bearer Token | Admin, Auditor, Investigator | Exports filtered evidence registry as a formula-sanitized CSV spreadsheet. |

---

## 4. Chain of Custody Management (`/evidence/:id/...`)

| Method | Endpoint | Auth Required | Role Required | Description |
|---|---|---|---|---|
| `GET` | `/evidence/:id/custody` | Bearer Token | Any active user (incl. Auditor) | Returns complete, immutable chronological chain of custody events. |
| `POST` | `/evidence/:id/transfer` | Bearer Token | Current Custodian or Admin | Transfers custody to another investigator/custodian with atomic state transition. |

---

## 5. Collaboration, Comments & Annotations

| Method | Endpoint | Auth Required | Role Required | Description |
|---|---|---|---|---|
| `GET` | `/cases/:id/comments` | Bearer Token | Case Authorized | Retrieves threaded discussion comments with nested replies (soft-deleted filtered). |
| `POST` | `/cases/:id/comments` | Bearer Token | Admin, Assigned Investigator | Posts comment with @mentions and notifications (rate-limited, Auditor blocked: 403). |
| `PATCH` | `/cases/:id/comments/:commentId` | Bearer Token | Author or Admin | Edits comment text with audit tracking (`case.comment.edit` or `moderate`). |
| `DELETE` | `/cases/:id/comments/:commentId` | Bearer Token | Author or Admin | Soft-deletes comment (`deletedAt` set, preserved for audit integrity). |
| `GET` | `/evidence/:id/annotations` | Bearer Token | Case Authorized | Lists normalized (0–1) visual annotations and note overlays. |
| `POST` | `/evidence/:id/annotations` | Bearer Token | Admin, Assigned Investigator | Anchors point/region notes without modifying underlying evidence bytes (Auditor blocked: 403). |
| `PATCH` | `/evidence/:id/annotations/:annId` | Bearer Token | Author or Admin | Updates annotation coordinates or text. |
| `DELETE` | `/evidence/:id/annotations/:annId` | Bearer Token | Author or Admin | Soft-deletes annotation while preserving audit history. |

---

## 6. Public Zero-Knowledge Verification Portal (`/public`)

| Method | Endpoint | Auth Required | Role Required | Description |
|---|---|---|---|---|
| `POST` | `/public/verify` | None (Public) | None | Verifies SHA-256 hash or uploaded file against the registry (rate limited: 60/min). |
| `GET` | `/public/verify/:hash` | None (Public) | None | Direct GET URL verification returning sanitized public authenticity metadata. |

---

## 7. Compliance Intelligence & Audit Export (`/audit`, `/reports`)

| Method | Endpoint | Auth Required | Role Required | Description |
|---|---|---|---|---|
| `GET` | `/audit` | Bearer Token | Admin, Auditor, Investigator | Paginated ledger query (investigators scoped to accessible cases). |
| `GET` | `/audit/:id` | Bearer Token | Admin, Auditor, Investigator | Inspects specific audit event with linked actor details. |
| `GET` | `/audit/export` | Bearer Token | Admin, Auditor, Investigator | Exports audit logs as formula-injection sanitized CSV or structured JSON. |
| `POST` | `/audit/verify` | Bearer Token | Admin, Auditor | Verifies cryptographic timeline sequencing of recorded audit events. |
| `GET` | `/reports/summary` | Bearer Token | Any active user | Aggregates compliance metrics (case, evidence, custody status breakdowns). |
| `GET` | `/reports/export` | Bearer Token | `ADMINISTRATOR`, `AUDITOR` | Exports executive compliance summary spreadsheet with anti-injection escaping. |

---

## 8. Global Discovery & Command Palette (`/search`)

| Method | Endpoint | Auth Required | Role Required | Description |
|---|---|---|---|---|
| `GET` | `/search` | Bearer Token | Any active user | Global multi-entity discovery (cases, evidence, audit) with relevance scoring. |
| `GET` | `/search/presets` | Bearer Token | Any active user | Retrieves saved search filter presets for current operator. |
| `POST` | `/search/presets` | Bearer Token | Any active user | Saves a custom search configuration preset. |
| `DELETE` | `/search/presets/:id` | Bearer Token | Preset Owner | Deletes saved filter preset. |

---

## 9. Notifications & User Preferences (`/notifications`)

| Method | Endpoint | Auth Required | Role Required | Description |
|---|---|---|---|---|
| `GET` | `/notifications` | Bearer Token | Any active user | Lists in-app notifications with unread counts and type filtering. |
| `PATCH` | `/notifications/:id/read` | Bearer Token | Notification Owner | Marks specific notification as read. |
| `PATCH` | `/notifications/read-all` | Bearer Token | Any active user | Marks all unread notifications as read. |
| `GET` | `/notifications/preferences` | Bearer Token | Any active user | Retrieves notification category preferences. |
| `PATCH` | `/notifications/preferences` | Bearer Token | Any active user | Updates notification subscription settings. |

---

## 10. Admin & User Lifecycle Management (`/admin`, `/profile`, `/users`)

| Method | Endpoint | Auth Required | Role Required | Description |
|---|---|---|---|---|
| `GET` | `/admin/users` | Bearer Token | `ADMINISTRATOR` | Paginated listing of system users (passwords stripped). |
| `POST` | `/admin/users` | Bearer Token | `ADMINISTRATOR` | Provisions new operator with designated role. |
| `PATCH` | `/admin/users/:id/role` | Bearer Token | `ADMINISTRATOR` | Updates user role (protected against last-admin demotion). |
| `PATCH` | `/admin/users/:id/status` | Bearer Token | `ADMINISTRATOR` | Activates or deactivates operator (protected against last-admin lockout). |
| `GET` | `/admin/settings` | Bearer Token | `ADMINISTRATOR` | Retrieves system-wide operational parameters. |
| `PATCH` | `/admin/settings` | Bearer Token | `ADMINISTRATOR` | Updates system configuration settings. |
| `GET` | `/profile` | Bearer Token | Any active user | Retrieves self-service profile and session metadata. |
| `PATCH` | `/profile` | Bearer Token | Any active user | Updates display name (ignores unauthorized role elevation). |
| `POST` | `/profile/change-password` | Bearer Token | Any active user | Updates password, re-hashes, and revokes all active sessions. |
| `GET` | `/profile/security` | Bearer Token | Any active user | Returns active login sessions and security overview. |
| `GET` | `/users/operators` | Bearer Token | Any active user | Returns active operators for transfer destination selection. |

---

## 11. Health & Diagnostic Probes

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `GET` | `/health` | None | Basic liveness probe; verifies PostgreSQL connection (200 OK / 503 Service Unavailable). |
| `GET` | `/health/deep` | None | Deep diagnostic probe; verifies database heartbeat + storage adapter reachability without exposing paths. |
