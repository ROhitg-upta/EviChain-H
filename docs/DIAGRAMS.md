# EviChain — Architecture & Flow Diagrams

All diagrams use Mermaid syntax. Render in GitHub, VSCode (Mermaid Preview extension), or https://mermaid.live

---

## Diagram 1 — System Architecture

```mermaid
graph TB
    subgraph CLIENT["Browser / Mobile PWA"]
        FE["Next.js 15\nApp Router"]
        SW["Service Worker\n(next-pwa)"]
        LS["localStorage\nSession + JWT"]
    end

    subgraph BACKEND["Express API — Node.js 24"]
        MW["Middleware\nrequireAuth · requireRole"]
        AR["Auth Routes\n/auth/register · /auth/login"]
        ER["Evidence Routes\n/evidence/*"]
        CR["Cases Routes\n/cases/*"]
        AUR["Audit Routes\n/audit/*"]
        PUB["Public Routes\n/public/verify"]
        SR["Search Routes\n/search"]
        UR["Users Routes\n/users/*"]
        RR["Reports Routes\n/reports/*"]
        CRYPTO["Node crypto\nSHA-256"]
        MULTER["Multer\n50MB limit"]
    end

    subgraph DATA["Data Layer"]
        PRISMA["Prisma ORM"]
        PG[("PostgreSQL\nNeon serverless")]
    end

    subgraph STORAGE["File Storage"]
        S3["AWS S3\n(planned)"]
        MEM["Memory Buffer\n(current)"]
    end

    FE -->|"HTTPS Bearer JWT"| MW
    SW -->|"Cache-first"| FE
    LS -->|"rehydrate"| FE
    MW --> AR
    MW --> ER
    MW --> CR
    MW --> AUR
    MW --> PUB
    MW --> SR
    MW --> UR
    MW --> RR
    ER --> CRYPTO
    ER --> MULTER
    MULTER --> MEM
    MEM -.->|"future"| S3
    AR --> PRISMA
    ER --> PRISMA
    CR --> PRISMA
    AUR --> PRISMA
    PUB --> PRISMA
    SR --> PRISMA
    UR --> PRISMA
    RR --> PRISMA
    PRISMA --> PG
```

---

## Diagram 2 — Authentication Flow

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Frontend /login
    participant API as POST /auth/login
    participant DB as PostgreSQL

    U->>FE: Enter email + password
    FE->>FE: Client validation (email format, min 8 chars)
    FE->>API: POST {email, password}
    API->>API: Zod schema validation
    API->>DB: SELECT user WHERE email = ?
    DB-->>API: User record (or null)
    
    alt User not found
        API-->>FE: 401 "Invalid credentials"
        FE-->>U: Error message shown
    else User found
        API->>API: bcrypt.compare(password, hash)
        alt Password mismatch
            API-->>FE: 401 "Invalid credentials"
            FE-->>U: Error message shown
        else Password correct
            API->>API: signAccessToken(userId, role) ← 15 min
            API->>API: signRefreshToken(userId) ← 7 days
            API->>DB: INSERT AuditLog {action:"auth.login"}
            API-->>FE: 200 {user, accessToken, refreshToken}
            FE->>FE: normaliseRole(role) → title-case
            FE->>FE: localStorage.setItem(session, token, refresh)
            FE-->>U: Redirect to dashboard
        end
    end
```

---

## Diagram 3 — Evidence Upload & Fingerprinting Flow

```mermaid
sequenceDiagram
    actor U as User (Investigator/Custodian)
    participant FE as Frontend /evidence/new
    participant XHR as XMLHttpRequest
    participant API as POST /evidence
    participant FS as File Storage
    participant DB as PostgreSQL

    U->>FE: Drag-drop or select file
    FE->>FE: Client check: size ≤ 50MB, allowed extension
    U->>FE: Fill name, ownerOrg, optional caseId
    FE->>XHR: multipart/form-data {file, name, type, ownerOrg}
    
    loop upload progress
        XHR-->>FE: onprogress event (0→100%)
        FE-->>U: Progress bar updates
    end
    
    XHR->>API: POST /evidence (Bearer token)
    API->>API: requireAuth — verify JWT
    API->>API: requireRole(ADMIN, INVESTIGATOR, CUSTODIAN)
    API->>API: Multer: fileFilter checks MIME allowlist
    API->>API: Multer: size limit 50MB enforced
    API->>API: Zod validates text fields
    API->>API: crypto.createHash("sha256").update(buffer)
    API->>FS: storageKey = "evidence/{ts}-{name}" (placeholder)
    API->>DB: INSERT Evidence {sha256, storageKey, status:PENDING...}
    API->>DB: INSERT CustodyEvent {action:"CREATED"}
    API->>DB: INSERT AuditLog {action:"evidence.upload"}
    DB-->>API: Created records
    API-->>XHR: 201 {id, name, sha256, status:"PENDING"}
    XHR-->>FE: Upload complete
    FE-->>U: Success screen with SHA-256 hash + evidence ID
```

---

## Diagram 4 — Chain of Custody Lifecycle

```mermaid
stateDiagram-v2
    [*] --> PENDING : File uploaded\nCREATED custody event

    PENDING --> VERIFIED : Hash verified\nby investigator
    PENDING --> FLAGGED : Hash mismatch\ndetected
    PENDING --> PENDING : ACCESSED event\n(view detail page)
    PENDING --> PENDING : DOWNLOADED event\n(download clicked)

    VERIFIED --> FLAGGED : Re-verification\nfails
    VERIFIED --> SEALED : Evidence sealed\nfor court submission
    VERIFIED --> VERIFIED : ACCESSED / DOWNLOADED\nevents continue

    FLAGGED --> PENDING : Under review\nreset to pending
    FLAGGED --> SEALED : Flagged but sealed\nwith note

    SEALED --> [*] : Case closed

    note right of PENDING
        Every state transition
        creates a CustodyEvent
        and an AuditLog row
    end note
```

---

## Diagram 5 — Public Verification Flow

```mermaid
flowchart TD
    A([Anyone — no login required]) --> B{Choose method}
    
    B -->|Upload file| C[POST /public/verify\nmultipart/form-data]
    B -->|Enter hash string| D[GET /public/verify/:sha256]
    
    C --> E[Server: crypto.createHash SHA-256\nfrom uploaded bytes]
    D --> F{Validate format:\n64 hex chars?}
    F -->|Invalid| G[400 Invalid SHA-256 format]
    F -->|Valid| H[Lowercase hash]
    
    E --> I[SELECT evidence WHERE sha256 = ?]
    H --> I
    
    I --> J{Found?}
    J -->|Yes| K[Return safe evidence shape:\nid, name, type, ownerOrg,\nstatus, sha256, registeredAt]
    J -->|No| L[Return matched:false, evidence:null]
    
    K --> M[User sees: ✓ Integrity Confirmed\nEvidence details shown]
    L --> N[User sees: ✗ No matching record]
    
    style M fill:#d4edda,stroke:#28a745
    style N fill:#f8d7da,stroke:#dc3545
    style G fill:#f8d7da,stroke:#dc3545
```

---

## Diagram 6 — Database Schema (Entity Relationship)

```mermaid
erDiagram
    User {
        uuid id PK
        string email UK
        string passwordHash
        string name
        enum role
        datetime createdAt
        datetime updatedAt
    }

    Case {
        uuid id PK
        string title
        string description
        string status
        string priority
        uuid leadUserId FK
        datetime createdAt
        datetime updatedAt
    }

    Evidence {
        uuid id PK
        uuid caseId FK
        string name
        string type
        string ownerOrg
        enum status
        int sizeBytes
        string mimeType
        string sha256
        string storageKey
        uuid collectedById FK
        datetime createdAt
        datetime updatedAt
    }

    CustodyEvent {
        uuid id PK
        uuid evidenceId FK
        string action
        uuid actorUserId FK
        string fromLocation
        string toLocation
        string note
        datetime timestamp
    }

    AuditLog {
        uuid id PK
        uuid actorUserId FK
        string action
        string resourceType
        string resourceId
        json detailJson
        string ipAddress
        string userAgent
        datetime timestamp
    }

    CaseComment {
        uuid id PK
        uuid caseId FK
        uuid userId FK
        string content
        uuid parentId FK
        datetime createdAt
        datetime updatedAt
    }

    CommentMention {
        uuid id PK
        uuid commentId FK
        uuid userId FK
    }

    EvidenceAnnotation {
        uuid id PK
        uuid evidenceId FK
        uuid userId FK
        string type
        json points
        string text
        string color
        datetime createdAt
    }

    NotificationPreference {
        uuid id PK
        uuid userId FK
        bool evidenceUploads
        bool caseUpdates
        bool systemAlerts
        bool weeklyDigest
    }

    User ||--o{ Case : "leads (CaseLead)"
    User ||--o{ Evidence : "collects (EvidenceCollector)"
    User ||--o{ CustodyEvent : "actor"
    User ||--o{ AuditLog : "actor"
    User ||--o{ CaseComment : "author"
    User ||--o{ CommentMention : "mentioned"
    User ||--o{ EvidenceAnnotation : "AnnotationUser"
    User ||--o| NotificationPreference : "has"

    Case ||--o{ Evidence : "contains"
    Case ||--o{ CaseComment : "has"

    Evidence ||--o{ CustodyEvent : "has"
    Evidence ||--o{ EvidenceAnnotation : "has"

    CaseComment ||--o{ CommentMention : "has"
    CaseComment ||--o{ CaseComment : "replies (CommentReplies)"
```

---

## Diagram 7 — Investigator User Journey

```mermaid
journey
    title Investigator Workflow
    section Authentication
      Register account: 5: Investigator
      Login with credentials: 5: Investigator
    section Case Setup
      Create new investigation case: 4: Investigator
      Set case priority and description: 4: Investigator
    section Evidence Collection
      Navigate to Upload Evidence: 5: Investigator
      Select file from device/camera: 4: Investigator
      View SHA-256 hash confirmation: 5: Investigator
      Link evidence to case: 4: Investigator
    section Verification
      Open evidence detail page: 5: Investigator
      Run integrity check (hash verify): 5: Investigator
      View custody timeline: 4: Investigator
    section Reporting
      Export audit log as CSV: 4: Investigator
      Share verification link with court: 5: Investigator
```

---

## Diagram 8 — Administrator Workflow

```mermaid
flowchart LR
    A([Admin Login]) --> B[View Dashboard\nStats + recent activity]
    B --> C{What task?}

    C -->|User management| D[/admin/users]
    D --> D1[View all users]
    D1 --> D2{Action}
    D2 -->|Edit role| D3[PATCH /users/:id]
    D2 -->|Delete| D4{Last admin?}
    D4 -->|Yes| D5[Blocked - 400]
    D4 -->|No| D6[User deleted + audit log]

    C -->|Evidence oversight| E[/evidence\nAll evidence across all cases]
    E --> E1[Filter by status/case]
    E1 --> E2[View detail + custody chain]

    C -->|Audit review| F[/audit]
    F --> F1[Filter by user/date/action]
    F1 --> F2[Export as CSV or JSON]

    C -->|Reports| G[/reports]
    G --> G1[View charts + aggregations]
    G1 --> G2[Export report CSV]

    C -->|Case management| H[/cases]
    H --> H1[Create/update/close cases]

    style D5 fill:#f8d7da,stroke:#dc3545
```

---

## Diagram 9 — Audit Log Generation Map

```mermaid
mindmap
  root((AuditLog))
    Authentication
      auth.register
      auth.login
    Evidence
      evidence.upload
      evidence.view
      evidence.download
      evidence.annotate
    Cases
      case.create
      case.update
      case.link_evidence
      case.comment
    Users
      user.update_profile
      user.change_password
      user.admin_update
      user.delete
```

---

## Diagram 10 — Notification Flow

```mermaid
sequenceDiagram
    participant Timer as 30s Poll Timer
    participant CTX as NotificationContext
    participant API as GET /audit?limit=20
    participant Bell as NotificationBell
    participant User

    loop Every 30 seconds
        Timer->>CTX: interval fires
        CTX->>API: GET /audit?limit=20 (Bearer token)
        API-->>CTX: Latest 20 AuditLog entries
        CTX->>CTX: Map logs → Notification objects
        CTX->>CTX: Check readIdsRef for each ID
        CTX->>CTX: Preserve read=true for known IDs
        CTX->>Bell: unreadCount updated
        Bell-->>User: Badge shows new count
    end

    User->>Bell: Click bell icon
    Bell->>User: Dropdown shows latest 8
    User->>Bell: Click "Mark all read"
    Bell->>CTX: markAllAsRead()
    CTX->>CTX: Add all IDs to readIdsRef Set
    CTX->>CTX: dispatch MARK_ALL_READ
    Bell-->>User: Badge clears
    Note over CTX: Next poll will check readIdsRef\nand preserve read=true
```
