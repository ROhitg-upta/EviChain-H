# EviChain — Complete API Reference

**Base URL (development):** `http://localhost:4000`  
**Base URL (production):** `https://your-backend.railway.app`  
**Protocol:** HTTPS in production, HTTP in development  
**Authentication:** `Authorization: Bearer <accessToken>` header on all protected routes  
**Content-Type:** `application/json` for JSON bodies; `multipart/form-data` for file uploads  
**All error responses:** `{ "error": "human-readable message" }`  
**Rate limiting:** Not yet enforced — add `express-rate-limit` before production

---

## Table of Contents
1. [Authentication](#authentication)
2. [Cases](#cases)
3. [Evidence](#evidence)
4. [Audit Logs](#audit-logs)
5. [Reports](#reports)
6. [Public Verification (no auth)](#public-verification)
7. [Users & Profile](#users--profile)
8. [Search](#search)
9. [Health Check](#health-check)
10. [Error Reference](#error-reference)

---

## Authentication

### POST /auth/register

Register a new operator account.

**Auth required:** No

**Request body:**
```json
{
  "email": "investigator@lab.gov",
  "password": "SecurePass123!",
  "name": "Anjali Sharma",
  "role": "INVESTIGATOR"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| email | string | Yes | Must be valid email format |
| password | string | Yes | Min 8 characters |
| name | string | Yes | Min 2 characters |
| role | string | Yes | One of: `ADMINISTRATOR` `INVESTIGATOR` `AUDITOR` `CUSTODIAN` (case-insensitive) |

**Response 201:**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "investigator@lab.gov",
    "name": "Anjali Sharma",
    "role": "INVESTIGATOR"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiJ9..."
}
```

**Error responses:**
| Code | Message | Cause |
|---|---|---|
| 400 | `{ fieldErrors: { email: [...] } }` | Invalid email format |
| 400 | `{ fieldErrors: { password: [...] } }` | Password too short |
| 409 | `Email already registered` | Duplicate email |
| 500 | `Registration failed` | Database error |

**curl example:**
```bash
curl -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@lab.gov","password":"Admin1234!","name":"Admin User","role":"ADMINISTRATOR"}'
```

---

### POST /auth/login

Login and receive JWT tokens.

**Auth required:** No

**Request body:**
```json
{
  "email": "investigator@lab.gov",
  "password": "SecurePass123!"
}
```

**Response 200:** Same shape as `/auth/register` 201 response.

**Error responses:**
| Code | Message | Cause |
|---|---|---|
| 400 | Zod field errors | Invalid email format or missing password |
| 401 | `Invalid credentials` | Wrong email or wrong password (same message — no user enumeration) |
| 500 | `Login failed` | Database error |

**curl example:**
```bash
TOKEN=$(curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@lab.gov","password":"Admin1234!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
echo $TOKEN
```

---

## Cases

### GET /cases

List all cases with evidence count and lead user.

**Auth required:** Yes (all roles)

**Query params:**
| Param | Type | Description |
|---|---|---|
| status | string | Filter by status (`Active`, `Review`, `Closed`, `Archived`) |

**Response 200:**
```json
[
  {
    "id": "uuid",
    "title": "Operation Midnight",
    "description": "Network intrusion investigation",
    "status": "Active",
    "priority": "High",
    "leadUserId": "uuid",
    "lead": { "id": "uuid", "name": "Anjali Sharma", "role": "INVESTIGATOR" },
    "evidenceCount": 3,
    "createdAt": "2026-08-25T09:00:00.000Z",
    "updatedAt": "2026-08-25T09:00:00.000Z"
  }
]
```

**curl example:**
```bash
curl http://localhost:4000/cases \
  -H "Authorization: Bearer $TOKEN"
```

---

### GET /cases/:id

Get full case detail including all linked evidence.

**Auth required:** Yes (all roles)

**Response 200:**
```json
{
  "id": "uuid",
  "title": "Operation Midnight",
  "lead": { "id": "uuid", "name": "Anjali Sharma", "role": "INVESTIGATOR" },
  "evidence": [
    {
      "id": "uuid",
      "name": "incident-video.mp4",
      "mimeType": "video/mp4",
      "sizeBytes": 298000000,
      "status": "VERIFIED",
      "createdAt": "2026-08-25T09:14:00.000Z",
      "collectedBy": { "id": "uuid", "name": "R. Gupta", "role": "CUSTODIAN" }
    }
  ],
  "evidenceCount": 1
}
```

**Error responses:**
| Code | Message |
|---|---|
| 404 | `Case not found` |

---

### POST /cases

Create a new case.

**Auth required:** Yes — `ADMINISTRATOR`, `INVESTIGATOR` only

**Request body:**
```json
{
  "title": "Operation Midnight",
  "description": "Network intrusion investigation",
  "status": "Active",
  "priority": "High"
}
```

| Field | Type | Required | Default |
|---|---|---|---|
| title | string | Yes | — |
| description | string | No | `""` |
| status | string | No | `"Active"` |
| priority | enum | No | `"Medium"` |
| leadUserId | UUID | No | Calling user's ID |

**Response 201:** Full case object with `evidenceCount: 0`

**Error responses:**
| Code | Message |
|---|---|
| 400 | Zod field errors |
| 403 | `Insufficient permissions` |

**curl example:**
```bash
curl -X POST http://localhost:4000/cases \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Op Midnight","description":"Network intrusion","priority":"High"}'
```

---

### PUT /cases/:id

Update case fields (status, title, description, priority).

**Auth required:** Yes — `ADMINISTRATOR`, `INVESTIGATOR` only

**Request body (all fields optional):**
```json
{ "status": "Closed", "priority": "Critical" }
```

**Response 200:** Updated case with `evidenceCount`

**Note:** `PATCH /cases/:id` is an alias — both methods share the same handler.

---

### POST /cases/:caseId/evidence/:evidenceId

Link an existing evidence record to a case.

**Auth required:** Yes — `ADMINISTRATOR`, `INVESTIGATOR` only

**Response 200:** Updated evidence record

---

### GET /cases/:id/comments

Get threaded comments for a case.

**Auth required:** Yes (all roles)

**Response 200:**
```json
[
  {
    "id": "uuid",
    "content": "Custody confirmed @R.Gupta please verify hash.",
    "createdAt": "2026-08-25T10:00:00.000Z",
    "user": { "id": "uuid", "name": "Anjali Sharma", "email": "anjali@lab.gov" },
    "mentions": [{ "userId": "uuid", "userName": "R.Gupta" }],
    "replies": []
  }
]
```

---

### POST /cases/:id/comments

Add a comment (with optional @mentions and parent threading).

**Auth required:** Yes (all roles)

**Request body:**
```json
{
  "content": "Hash verified ✓ @Anjali.Sharma",
  "mentions": [{ "userId": "unknown", "userName": "Anjali.Sharma" }],
  "parentId": null
}
```

**Response 201:** Created comment

---

## Evidence

### POST /evidence

Upload a new evidence file. SHA-256 is computed server-side.

**Auth required:** Yes — `ADMINISTRATOR`, `INVESTIGATOR`, `CUSTODIAN`

**Request:** `multipart/form-data`

| Field | Type | Required | Notes |
|---|---|---|---|
| file | File | Yes | Max 50 MB; see allowed types below |
| name | string | Yes | Min 2 characters |
| type | string | Yes | e.g., `"MP4"`, `"PDF"` |
| ownerOrg | string | Yes | Min 2 characters |
| caseId | UUID | No | Link to existing case |
| description | string | No | Max 2000 chars |
| tags | string | No | Comma-separated, max 500 chars |

**Allowed MIME types:** `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/tiff`, `video/mp4`, `video/quicktime`, `video/x-msvideo`, `video/x-matroska`, `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/zip`, `application/x-tar`, `application/gzip`, `text/plain`, `text/csv`, `application/octet-stream`

**Response 201:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "name": "incident-video.mp4",
  "type": "MP4",
  "ownerOrg": "Digital Forensics",
  "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "sizeBytes": 298000000,
  "mimeType": "video/mp4",
  "status": "PENDING",
  "createdAt": "2026-08-25T09:14:00.000Z"
}
```

**Error responses:**
| Code | Message | Cause |
|---|---|---|
| 400 | `File is required` | No file in request |
| 400 | `Upload error: File too large` | File exceeds 50 MB |
| 400 | Zod field errors | Invalid text fields |
| 403 | `Insufficient permissions` | Auditor role |
| 415 | `File type not allowed: {mime}` | MIME not in allowlist |
| 500 | `Failed to register evidence` | Database error |

**curl example:**
```bash
curl -X POST http://localhost:4000/evidence \
  -H "Authorization: Bearer $TOKEN" \
  -F "name=incident-video.mp4" \
  -F "type=MP4" \
  -F "ownerOrg=Digital Forensics" \
  -F "file=@/path/to/video.mp4"
```

---

### GET /evidence

List evidence records with filters.

**Auth required:** Yes (all roles)

**Query params:**
| Param | Type | Description |
|---|---|---|
| caseId | UUID | Filter by linked case |
| status | string | `PENDING`, `VERIFIED`, `FLAGGED`, `SEALED` |

**Response 200:** Array of evidence records with `case`, `collectedBy`, and latest `custodyEvent` included.

---

### GET /evidence/:id

Get full evidence detail with complete custody timeline.

**Auth required:** Yes (all roles)

**Side effect:** Creates an `ACCESSED` custody event and `evidence.view` audit log entry.

**Response 200:**
```json
{
  "id": "uuid",
  "name": "incident-video.mp4",
  "sha256": "9f86d081...",
  "status": "PENDING",
  "custodyEvents": [
    {
      "id": "uuid",
      "action": "ACCESSED",
      "note": "Evidence record viewed",
      "timestamp": "2026-08-25T09:32:00.000Z",
      "actor": { "id": "uuid", "name": "A. Sharma", "role": "INVESTIGATOR" }
    },
    {
      "id": "uuid",
      "action": "CREATED",
      "note": "Evidence registered and SHA-256 fingerprint computed",
      "timestamp": "2026-08-25T09:14:00.000Z",
      "actor": { "id": "uuid", "name": "R. Gupta", "role": "CUSTODIAN" }
    }
  ]
}
```

**Error responses:**
| Code | Message |
|---|---|
| 404 | `Evidence not found` |

---

### GET /evidence/:id/download

Log a DOWNLOADED custody event. Returns file metadata (actual file stream requires S3 integration).

**Auth required:** Yes (all roles)

**Side effect:** Creates `DOWNLOADED` custody event and `evidence.download` audit log.

**Response 200:**
```json
{
  "id": "uuid",
  "name": "incident-video.mp4",
  "storageKey": "evidence/1724571240000-incident-video.mp4",
  "sha256": "9f86d081...",
  "sizeBytes": 298000000,
  "mimeType": "video/mp4",
  "note": "File storage not yet configured. Download logged in chain of custody."
}
```

---

### GET /evidence/:id/annotations

Get all canvas annotations for an evidence record.

**Auth required:** Yes (all roles)

**Response 200:** Array of annotation objects with type, points (normalised 0–1 coords), color, text, user name, and timestamp.

---

### POST /evidence/:id/annotations

Save (replace) annotations for an evidence record.

**Auth required:** Yes (all roles)

**Request body:**
```json
{
  "annotations": [
    {
      "type": "arrow",
      "points": [{ "x": 0.3, "y": 0.4 }, { "x": 0.6, "y": 0.7 }],
      "color": "#ef4444",
      "text": null
    }
  ]
}
```

**Response 200:** `{ "count": 1 }`

---

## Audit Logs

### GET /audit

Query audit log entries with filters.

**Auth required:** Yes (all roles)

**Query params:**
| Param | Type | Description |
|---|---|---|
| resourceType | string | `evidence` or `case` |
| resourceId | UUID | Filter by specific resource |
| actorUserId | UUID | Filter by user who performed the action |
| action | string | Partial match, case-insensitive (e.g. `evidence`) |
| from | ISO date | Records at or after this date |
| to | ISO date | Records at or before this date |
| limit | number | Max 500, default 100 |

**Response 200:**
```json
[
  {
    "id": "uuid",
    "action": "evidence.upload",
    "resourceType": "evidence",
    "resourceId": "uuid",
    "detailJson": { "name": "video.mp4", "sha256": "9f86..." },
    "ipAddress": "192.168.1.10",
    "timestamp": "2026-08-25T09:14:00.000Z",
    "actor": { "id": "uuid", "name": "R. Gupta", "role": "CUSTODIAN" }
  }
]
```

**curl example:**
```bash
curl "http://localhost:4000/audit?action=evidence&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

---

### GET /audit/export

Download audit log as JSON attachment.

**Auth required:** Yes — `ADMINISTRATOR`, `AUDITOR` only

**Query params:** Same filters as `GET /audit` (no limit cap)  
**Response:** `Content-Disposition: attachment; filename="audit-export-YYYY-MM-DD.json"`

---

### POST /audit/export

Download audit log as JSON or CSV.

**Auth required:** Yes — `ADMINISTRATOR`, `AUDITOR` only

**Request body:**
```json
{
  "format": "csv",
  "resourceType": "evidence",
  "from": "2026-08-01",
  "to": "2026-08-31"
}
```

| format | Description |
|---|---|
| `json` | Metadata envelope + full log array (default) |
| `csv` | One row per event with headers |

**Response:** File download with `Content-Disposition` header set.

---

### GET /audit/:id

Get a single audit log entry with related resource snapshots.

**Auth required:** Yes (all roles)

**Response 200:**
```json
{
  "id": "uuid",
  "action": "evidence.upload",
  "resourceType": "evidence",
  "resourceId": "uuid",
  "detailJson": { "name": "video.mp4", "sha256": "9f86..." },
  "actor": { "id": "uuid", "name": "R. Gupta", "role": "CUSTODIAN" },
  "relatedCase": null,
  "relatedEvidence": {
    "id": "uuid",
    "name": "video.mp4",
    "type": "MP4",
    "sha256": "9f86...",
    "status": "PENDING"
  }
}
```

---

## Reports

### GET /reports

Get analytics aggregations for a time range.

**Auth required:** Yes (all roles)

**Query params:**
| Param | Type | Default | Max |
|---|---|---|---|
| range | number (days) | 90 | 365 |

**Response 200:**
```json
{
  "totalCases": 12,
  "totalEvidence": 34,
  "avgResolutionDays": 5.2,
  "casesByStatus": [{ "status": "Active", "count": 8 }, { "status": "Closed", "count": 4 }],
  "casesByMonth": [{ "month": "2026-08", "count": 5 }],
  "evidenceByType": [{ "type": "Video", "count": 10 }, { "type": "Image", "count": 12 }],
  "evidenceByMonth": [{ "month": "2026-08", "count": 18 }],
  "topUploaders": [{ "name": "R. Gupta", "count": 15 }]
}
```

---

### GET /reports/export

Download report as CSV.

**Auth required:** Yes — `ADMINISTRATOR`, `AUDITOR` only

**Query params:** `?range=90`  
**Response:** CSV file download

---

## Public Verification

These endpoints require **no authentication**. They are safe to call from any client.

### POST /public/verify

Upload a file; server computes its SHA-256 and checks it against the registry.

**Auth required:** No

**Request:** `multipart/form-data` with field `file` (max 50 MB)

**Response 200:**
```json
{
  "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "matched": true,
  "evidence": {
    "id": "uuid",
    "name": "incident-video-042.mp4",
    "type": "MP4",
    "ownerOrg": "Digital Forensics",
    "status": "VERIFIED",
    "sha256": "9f86d081...",
    "registeredAt": "2026-08-25T09:14:00.000Z"
  }
}
```

If not matched: `"matched": false` and `"evidence": null`.

**curl example:**
```bash
curl -X POST http://localhost:4000/public/verify \
  -F "file=@/path/to/video.mp4"
```

---

### GET /public/verify/:sha256

Look up a known 64-character hex SHA-256 hash.

**Auth required:** No

**URL param:** 64-character lowercase hex string

**Response 200:** Same shape as `POST /public/verify`

**Error responses:**
| Code | Message |
|---|---|
| 400 | `Invalid SHA-256 format — must be exactly 64 hexadecimal characters` |

**curl example:**
```bash
curl http://localhost:4000/public/verify/9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
```

---

## Users & Profile

### GET /users

List all user accounts. **ADMINISTRATOR only.**

**Auth required:** Yes — `ADMINISTRATOR`

**Response 200:** Array of `{ id, email, name, role, createdAt, updatedAt }` — `passwordHash` never returned.

---

### GET /users/me

Get the authenticated user's own profile.

**Auth required:** Yes (all roles)

**Response 200:** `{ id, email, name, role, createdAt, updatedAt }`

---

### PATCH /users/me

Update own display name.

**Auth required:** Yes (all roles)

**Request body:** `{ "name": "New Name" }`

**Response 200:** Updated user object. Creates `user.update_profile` audit log.

---

### PATCH /users/me/password

Change own password (requires current password).

**Auth required:** Yes (all roles)

**Request body:**
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass456!"
}
```

**Error responses:**
| Code | Message |
|---|---|
| 401 | `Current password is incorrect` |
| 400 | Zod field errors (newPassword < 8 chars) |

---

### GET /users/me/notification-preferences

Get notification opt-in preferences.

**Auth required:** Yes (all roles)

**Response 200:**
```json
{
  "evidenceUploads": true,
  "caseUpdates": true,
  "systemAlerts": true,
  "weeklyDigest": false
}
```

Returns defaults if no preference record exists yet.

---

### PUT /users/me/notification-preferences

Update notification preferences.

**Auth required:** Yes (all roles)

**Request body (all fields optional):**
```json
{
  "evidenceUploads": false,
  "weeklyDigest": true
}
```

**Response 200:** Updated preference object.

---

### GET /users/:id

Get any user's profile. **ADMINISTRATOR only.**

---

### PATCH /users/:id

Update any user's name, email, or role. **ADMINISTRATOR only.**

**Request body (all fields optional):**
```json
{ "role": "AUDITOR" }
```

Creates `user.admin_update` audit log.

---

### DELETE /users/:id

Delete a user account. **ADMINISTRATOR only.**

**Constraints:**
- Cannot delete own account (`400`)
- Cannot delete the last administrator (`400 "Cannot delete the last administrator account"`)
- FK constraint: if user has related evidence/cases, deletion may fail — cascade rules TBD

---

## Search

### GET /search

Global search across cases, evidence, and users.

**Auth required:** Yes (all roles)

**Query params:**
| Param | Type | Min | Description |
|---|---|---|---|
| q | string | 2 chars | Search query |

**Response 200:**
```json
{
  "cases":    [{ "id": "uuid", "title": "Op Midnight", "status": "Active" }],
  "evidence": [{ "id": "uuid", "name": "video.mp4", "case": { "title": "Op Midnight" } }],
  "users":    []
}
```

`users` array is only populated for `ADMINISTRATOR` role. Max 5 results per category.

**curl example:**
```bash
curl "http://localhost:4000/search?q=midnight" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Health Check

### GET /health

Check if the server is running.

**Auth required:** No

**Response 200:**
```json
{ "status": "ok", "timestamp": "2026-08-27T12:00:00.000Z" }
```

---

## Error Reference

### Standard error shape
```json
{ "error": "Human-readable message" }
```

### Zod validation error shape
```json
{
  "error": {
    "formErrors": [],
    "fieldErrors": {
      "email": ["Invalid email format"],
      "password": ["String must contain at least 8 character(s)"]
    }
  }
}
```

### HTTP status codes used

| Code | Meaning |
|---|---|
| 200 | Success |
| 201 | Created |
| 400 | Bad request / validation error |
| 401 | Missing or invalid/expired JWT |
| 403 | Authenticated but insufficient role |
| 404 | Resource not found |
| 409 | Conflict (e.g. duplicate email) |
| 415 | Unsupported media type (disallowed MIME) |
| 500 | Internal server error |

### Role permission matrix

| Endpoint group | ADMINISTRATOR | INVESTIGATOR | AUDITOR | CUSTODIAN |
|---|:---:|:---:|:---:|:---:|
| POST /auth/* | ✓ | ✓ | ✓ | ✓ |
| POST /evidence | ✓ | ✓ | — | ✓ |
| GET /evidence/* | ✓ | ✓ | ✓ | ✓ |
| POST /cases | ✓ | ✓ | — | — |
| PUT/PATCH /cases/:id | ✓ | ✓ | — | — |
| GET /cases/* | ✓ | ✓ | ✓ | ✓ |
| GET /audit | ✓ | ✓ | ✓ | ✓ |
| GET/POST /audit/export | ✓ | — | ✓ | — |
| GET /reports | ✓ | ✓ | ✓ | ✓ |
| GET /reports/export | ✓ | — | ✓ | — |
| GET /users | ✓ | — | — | — |
| PATCH/DELETE /users/:id | ✓ | — | — | — |
| GET/POST /public/* | ✓ | ✓ | ✓ | ✓ |
