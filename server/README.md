# EviChain — Backend API

Chain-of-custody backend for digital evidence. Every file upload is SHA-256 fingerprinted server-side, every action is immutably audit-logged, and a public verification portal lets anyone confirm evidence integrity without authentication.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 15)                 │
│           localhost:3000  /  evichain.vercel.app         │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP (fetch + Bearer token)
                        ▼
┌─────────────────────────────────────────────────────────┐
│                  BACKEND (Express 5 / Node 24)           │
│                      localhost:4000                      │
│                                                          │
│  /auth      → auth.routes.ts   (register, login)        │
│  /evidence  → evidence.routes  (upload, list, get)       │
│  /cases     → cases.routes     (CRUD, link evidence)     │
│  /audit     → audit.routes     (query, export)           │
│  /public    → public.routes    (unauthenticated verify)  │
└───────────────────────┬─────────────────────────────────┘
                        │ Prisma ORM (connection pooling)
                        ▼
┌─────────────────────────────────────────────────────────┐
│              PostgreSQL — Neon serverless                │
│   Tables: User, Case, Evidence, CustodyEvent, AuditLog   │
└─────────────────────────────────────────────────────────┘
                        │ (future)
                        ▼
┌─────────────────────────────────────────────────────────┐
│              Object Storage (AWS S3 / compatible)        │
│              evidence/{timestamp}-{filename}             │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Package | Version | Purpose |
|---|---|---|
| Node.js | v24.14.0 | Runtime |
| TypeScript | ^7 | Type safety |
| tsx | ^4.19 | Dev runner (Node v24 compatible) |
| Express | ^5.2 | HTTP framework |
| Prisma | ^5.22 | ORM + migrations |
| @prisma/client | ^5.22 | Generated DB client |
| PostgreSQL | (Neon) | Database |
| bcryptjs | ^3 | Password hashing |
| jsonwebtoken | ^9 | JWT access + refresh tokens |
| multer | ^2.2 | Multipart file uploads |
| zod | ^4 | Request validation |
| cors | ^2.8 | CORS headers |
| dotenv | ^17 | Env var loading |

---

## Prerequisites

- **Node.js** v18 or higher (tested on v24.14.0)
- **npm** v9+
- **PostgreSQL** database — [Neon](https://neon.tech) free tier works fine
- `npx` available (bundled with npm)

---

## Local Setup

### 1. Install dependencies

```bash
cd server
npm install
```

### 2. Configure environment variables

Copy the template and fill in your values:

```bash
cp .env.example .env   # or edit .env directly
```

**`server/.env`**
```env
DATABASE_URL="postgresql://user:password@ep-xxx.region.aws.neon.tech/evichain?sslmode=require"
JWT_SECRET="at-least-32-random-chars-here"
JWT_EXPIRES_IN="15m"
REFRESH_SECRET="another-32-random-chars-here"
REFRESH_EXPIRES_IN="7d"
PORT=4000
```

> For Neon, copy the connection string from your Neon dashboard. The `?sslmode=require` suffix is mandatory.

### 3. Run Prisma migrations

```bash
npx prisma generate        # generates the type-safe client
npx prisma migrate dev --name init   # creates tables in your DB
```

### 4. Start the dev server

```bash
npm run dev
# EviChain API running on http://localhost:4000
```

### 5. Verify it's running

```bash
curl http://localhost:4000/health
# {"status":"ok","timestamp":"2026-08-27T..."}
```

---

## Database Schema

### User
```
id           UUID  PK
email        String  UNIQUE
passwordHash String
name         String
role         UserRole  (ADMINISTRATOR | INVESTIGATOR | AUDITOR | CUSTODIAN)
createdAt    DateTime
updatedAt    DateTime
```

### Case
```
id          UUID  PK
title       String
description String
status      String  default "Active"
priority    String  default "Medium"
leadUserId  UUID  FK→User
createdAt   DateTime
updatedAt   DateTime
```

### Evidence
```
id            UUID  PK
caseId        UUID?  FK→Case
name          String
type          String
ownerOrg      String
status        EvidenceStatus  (PENDING | VERIFIED | FLAGGED | SEALED)
sizeBytes     Int
mimeType      String
sha256        String  INDEXED
storageKey    String
collectedById UUID  FK→User
createdAt     DateTime
updatedAt     DateTime
```

### CustodyEvent
```
id           UUID  PK
evidenceId   UUID  FK→Evidence
action       String
actorUserId  UUID  FK→User
fromLocation String?
toLocation   String?
note         String
timestamp    DateTime  INDEXED
```

### AuditLog
```
id           UUID  PK
actorUserId  UUID?  FK→User
action       String
resourceType String
resourceId   String
detailJson   Json
ipAddress    String?
userAgent    String?
timestamp    DateTime  INDEXED
```

---

## API Documentation

All authenticated endpoints require:
```
Authorization: Bearer <accessToken>
```

---

### Authentication

#### POST /auth/register

Register a new operator account.

**Request**
```json
{
  "email": "investigator@lab.gov",
  "password": "SecurePass123",
  "name": "A. Sharma",
  "role": "INVESTIGATOR"
}
```
Roles: `ADMINISTRATOR` · `INVESTIGATOR` · `AUDITOR` · `CUSTODIAN`

**Response 201**
```json
{
  "user": { "id": "uuid", "email": "...", "name": "A. Sharma", "role": "INVESTIGATOR" },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

**Errors**
```json
409  { "error": "Email already registered" }
400  { "error": { "fieldErrors": { "email": ["Invalid email"] } } }
```

---

#### POST /auth/login

**Request**
```json
{
  "email": "investigator@lab.gov",
  "password": "SecurePass123"
}
```

**Response 200**
```json
{
  "user": { "id": "uuid", "email": "...", "name": "A. Sharma", "role": "INVESTIGATOR" },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

**Errors**
```json
401  { "error": "Invalid credentials" }
```

---

### Evidence

#### POST /evidence

Upload a file. SHA-256 is computed server-side.

**Auth required** · Roles: ADMINISTRATOR, INVESTIGATOR, CUSTODIAN

**Request** — `multipart/form-data`

| Field | Type | Required |
|---|---|---|
| `file` | File (≤50 MB) | ✓ |
| `name` | string (min 2) | ✓ |
| `type` | string (min 2) | ✓ |
| `ownerOrg` | string (min 2) | ✓ |
| `caseId` | UUID | — |

**Response 201**
```json
{
  "id": "uuid",
  "name": "incident-video.mp4",
  "type": "MP4",
  "sha256": "9f86d081...",
  "sizeBytes": 298000000,
  "status": "PENDING",
  "createdAt": "2026-08-27T09:14:00.000Z"
}
```

Also creates a `CustodyEvent` (action: "Registered") and an `AuditLog` entry automatically.

---

#### GET /evidence

**Auth required** · All roles

Query params: `?caseId=<uuid>` · `?status=PENDING|VERIFIED|FLAGGED|SEALED`

**Response 200** — array of evidence records with case, collector, and latest custody event included.

---

#### GET /evidence/:id

**Auth required** · All roles

**Response 200** — full evidence record with complete custody chain.

```json
{
  "id": "uuid",
  "name": "incident-video.mp4",
  "sha256": "9f86d081...",
  "status": "VERIFIED",
  "custodyEvents": [
    { "action": "Verified", "actor": {...}, "timestamp": "..." },
    { "action": "Registered", "actor": {...}, "timestamp": "..." }
  ]
}
```

**Errors**
```json
404  { "error": "Evidence not found" }
```

---

### Cases

#### GET /cases

**Auth required** · All roles · Query: `?status=Active`

**Response 200** — array of cases with lead user and evidence count.

---

#### GET /cases/:id

**Auth required** · All roles

**Response 200** — case with all linked evidence and their latest custody events.

---

#### POST /cases

**Auth required** · Roles: ADMINISTRATOR, INVESTIGATOR

**Request**
```json
{
  "title": "Operation Midnight",
  "description": "Network intrusion investigation",
  "priority": "High",
  "leadUserId": "uuid-of-investigator"
}
```
Priority values: `Low` · `Medium` · `High` · `Critical`

**Response 201** — created case record.

---

#### PATCH /cases/:id

**Auth required** · Roles: ADMINISTRATOR, INVESTIGATOR

**Request** (all fields optional)
```json
{
  "title": "Updated title",
  "status": "Closed",
  "priority": "Critical"
}
```

---

#### POST /cases/:caseId/evidence/:evidenceId

Link an existing evidence record to a case.

**Auth required** · Roles: ADMINISTRATOR, INVESTIGATOR

**Response 200** — updated evidence record.

---

### Audit

#### GET /audit

**Auth required** · All roles

Query params:
- `?resourceType=evidence|case`
- `?resourceId=<uuid>`
- `?action=<partial string>`
- `?limit=<number>` (max 200, default 50)

**Response 200**
```json
[
  {
    "id": "uuid",
    "action": "Evidence registered",
    "resourceType": "evidence",
    "resourceId": "uuid",
    "detailJson": { "name": "video.mp4", "sha256": "9f86..." },
    "actor": { "id": "uuid", "name": "A. Sharma", "role": "INVESTIGATOR" },
    "ipAddress": "192.168.1.1",
    "timestamp": "2026-08-27T09:14:00.000Z"
  }
]
```

---

#### GET /audit/export

Download complete audit log as a JSON file.

**Auth required** · Roles: ADMINISTRATOR, AUDITOR

Query params: `?resourceType=` · `?resourceId=`

Response sets `Content-Disposition: attachment; filename="audit-export-<ts>.json"`

---

### Public Verification (no auth)

#### POST /public/verify

Upload any file. Returns its SHA-256 and whether it matches a registered record.

**Request** — `multipart/form-data`

| Field | Type |
|---|---|
| `file` | File (≤50 MB) |

**Response 200**
```json
{
  "sha256": "9f86d081...",
  "matched": true,
  "evidence": {
    "id": "uuid",
    "name": "incident-video.mp4",
    "status": "VERIFIED",
    "createdAt": "2026-08-27T09:14:00.000Z"
  }
}
```

If not found, `matched` is `false` and `evidence` is `null`.

---

#### GET /public/verify/:sha256

Look up a known 64-character hex hash.

```bash
GET /public/verify/9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
```

**Response 200** — same shape as POST /public/verify.

**Errors**
```json
400  { "error": "Invalid SHA-256 hash format" }
```

---

## Authentication Flow

```
1. POST /auth/register or /auth/login
   → server returns { accessToken (15m), refreshToken (7d) }

2. Client stores tokens (localStorage / httpOnly cookie)

3. Every protected request:
   → Header: Authorization: Bearer <accessToken>

4. middleware.ts verifies JWT signature + expiry
   → attaches req.userId, req.userRole

5. requireRole() guards check userRole against allowed list

6. On 401, client uses refreshToken to request a new accessToken
   (refresh endpoint to be added in v2)
```

---

## Evidence Flow

```
1. Client selects file + fills metadata form
2. POST /evidence  (multipart/form-data)
3. Server receives file buffer via Multer (memoryStorage)
4. Node crypto.createHash('sha256').update(buffer).digest('hex')
5. prisma.evidence.create(...)   ← permanent record
6. prisma.custodyEvent.create(action: "Registered")
7. prisma.auditLog.create(action: "Evidence registered")
8. Response: { id, name, sha256, status: "PENDING", ... }
9. Status transitions: PENDING → VERIFIED | FLAGGED → SEALED
   (via custody events created by investigators/administrators)
```

---

## Audit System

Every mutation automatically writes an `AuditLog` row:

| Trigger | action value |
|---|---|
| Register account | (implicit via auth) |
| Upload evidence | `"Evidence registered"` |
| Create case | `"Case created"` |
| Update case | `"Case updated"` |
| Link evidence to case | `"Evidence linked to case"` |

Each log captures: `actorUserId`, `action`, `resourceType`, `resourceId`, `detailJson`, `ipAddress`, `userAgent`, `timestamp`.

Query with `GET /audit?resourceType=evidence&resourceId=<id>` to get full history for a single item. Export everything with `GET /audit/export`.

---

## Public Verification

Anyone — lawyers, auditors, courts — can verify a file without an account:

1. **File upload** — `POST /public/verify` with the file
2. Server computes SHA-256 of the uploaded bytes
3. Looks up `Evidence` table by `sha256`
4. Returns match status + registered metadata

This proves the file is identical to what was registered, without exposing any authentication details.

---

## Security

| Control | Implementation |
|---|---|
| Password hashing | bcryptjs, 12 salt rounds |
| JWT signing | HS256, secret from env |
| Token expiry | Access 15 min, refresh 7 days |
| Role enforcement | `requireRole()` middleware on every mutation |
| Input validation | Zod schemas on all request bodies |
| File size limit | 50 MB enforced by Multer |
| CORS | `cors()` middleware (configure origins for production) |
| SQL injection | Prisma parameterized queries (no raw SQL) |
| SSL | `?sslmode=require` on Neon DATABASE_URL |

**Production hardening to add:**
- Rate limiting (`express-rate-limit`)
- Helmet.js security headers
- CORS origin whitelist
- Refresh token rotation
- S3 upload + presigned URLs (replace `storageKey` placeholder)

---

## Deployment

### Render (recommended — free tier)

1. Push `server/` to a GitHub repo
2. New Web Service → connect repo
3. Build command: `npm install && npx prisma generate && npm run build`
4. Start command: `npm start`
5. Add all env vars from `.env` in the Render dashboard

### Fly.io

```bash
cd server
fly launch
fly secrets set DATABASE_URL="..." JWT_SECRET="..." REFRESH_SECRET="..."
fly deploy
```

### Docker

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npx prisma generate && npm run build
EXPOSE 4000
CMD ["npm", "start"]
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✓ | PostgreSQL connection string (Neon: include `?sslmode=require`) |
| `JWT_SECRET` | ✓ | HMAC secret for access tokens — min 32 chars |
| `JWT_EXPIRES_IN` | ✓ | Access token TTL e.g. `15m`, `1h` |
| `REFRESH_SECRET` | ✓ | HMAC secret for refresh tokens — min 32 chars |
| `REFRESH_EXPIRES_IN` | ✓ | Refresh token TTL e.g. `7d` |
| `PORT` | — | HTTP port (default `4000`) |

---

## Development Commands

```bash
# Start dev server (tsx watch, auto-restarts on save)
npm run dev

# Type-check without emitting
npx tsc --noEmit

# Compile to dist/
npm run build

# Run compiled output
npm start

# Generate Prisma client after schema changes
npx prisma generate

# Create + apply a new migration
npx prisma migrate dev --name <description>

# Apply migrations in production (no interactive prompt)
npx prisma migrate deploy

# Open Prisma Studio (visual DB browser)
npx prisma studio

# Reset DB and re-apply all migrations (dev only — destructive)
npx prisma migrate reset
```

---

## Testing — curl Examples

```bash
BASE=http://localhost:4000

# Health check
curl $BASE/health

# Register
curl -X POST $BASE/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@lab.gov","password":"Pass1234!","name":"Admin","role":"ADMINISTRATOR"}'

# Login — save token
TOKEN=$(curl -s -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@lab.gov","password":"Pass1234!"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# Upload evidence
curl -X POST $BASE/evidence \
  -H "Authorization: Bearer $TOKEN" \
  -F "name=incident-video.mp4" \
  -F "type=MP4" \
  -F "ownerOrg=Digital Forensics" \
  -F "file=@/path/to/video.mp4"

# List evidence
curl $BASE/evidence \
  -H "Authorization: Bearer $TOKEN"

# Create case
curl -X POST $BASE/cases \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Op Midnight","description":"Network intrusion","priority":"High","leadUserId":"<user-uuid>"}'

# Get audit logs
curl "$BASE/audit?limit=20" \
  -H "Authorization: Bearer $TOKEN"

# Public verify by file
curl -X POST $BASE/public/verify \
  -F "file=@/path/to/video.mp4"

# Public verify by hash
curl $BASE/public/verify/9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
```

---

## Troubleshooting

### `ts-node-dev` fails on Node v24
**Symptom:** `Error: Cannot find module 'v8'` or ESM loader errors  
**Fix:** Already resolved — `npm run dev` now uses `tsx watch` which is fully compatible with Node v18+.

### `Cannot find module '@prisma/client'`
**Fix:**
```bash
cd server && npx prisma generate
```

### `PrismaClientInitializationError: Can't reach database server`
**Fix:** Check `DATABASE_URL` in `.env`. For Neon, ensure `?sslmode=require` is appended.

### `JWT_SECRET is undefined`
**Fix:** Make sure `.env` exists in `server/` (not the root). `dotenv/config` is imported at the top of `index.ts`.

### Multer `File is required` on POST /evidence
**Fix:** The request must be `multipart/form-data`, not `application/json`. Use `-F` flags in curl or `FormData` in the browser.

### `prisma migrate dev` fails on Neon with SSL error
**Fix:** Add `?sslmode=require&connect_timeout=10` to the DATABASE_URL.

### Port 4000 already in use
```bash
# Windows PowerShell
netstat -ano | findstr :4000
taskkill /PID <pid> /F
```
