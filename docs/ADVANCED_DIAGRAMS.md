# EviChain — Advanced Feature Diagrams

All diagrams use Mermaid syntax. Render at https://mermaid.live or with the VSCode Mermaid Preview extension.

---

## Diagram 1 — Notification Flow (Complete)

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Frontend
    participant CTX as NotificationContext
    participant API as GET /audit
    participant Bell as NotificationBell
    participant DB as PostgreSQL

    Note over CTX: On login → poll starts

    loop Every 30 seconds
        CTX->>API: GET /audit?limit=20 (Bearer token)
        API->>DB: SELECT AuditLog ORDER BY timestamp DESC LIMIT 20
        DB-->>API: Latest 20 rows with actor joins
        API-->>CTX: AuditLog[]
        CTX->>CTX: Map each log → Notification object
        CTX->>CTX: Check readIdsRef.current.has(log.id)
        Note over CTX: read=true if in Set, false otherwise
        CTX->>CTX: dispatch SET_NOTIFICATIONS
        CTX-->>Bell: state.unreadCount updated
        Bell-->>U: Badge re-renders with count
    end

    U->>Bell: Click bell icon
    Bell-->>U: Dropdown opens (latest 8)

    alt User clicks a notification
        U->>Bell: Click notification item
        Bell->>CTX: markAsRead(id)
        CTX->>CTX: readIdsRef.current.add(id)
        CTX->>CTX: dispatch MARK_READ
        Bell-->>U: Navigate to linked resource
    end

    alt User clicks Mark all read
        U->>Bell: Click "Mark all read"
        Bell->>CTX: markAllAsRead()
        CTX->>CTX: Add ALL current IDs to readIdsRef
        CTX->>CTX: dispatch MARK_ALL_READ
        Bell-->>U: Badge clears to 0
        Note over CTX: Next poll checks readIdsRef → stays read
    end

    alt User dismisses a notification
        U->>Bell: Click dismiss (×)
        Bell->>CTX: dismiss(id)
        CTX->>CTX: readIdsRef.current.delete(id)
        CTX->>CTX: dispatch REMOVE_NOTIFICATION
        Bell-->>U: Item removed from list
    end
```

---

## Diagram 2 — Annotation Save / Load Pipeline

```mermaid
sequenceDiagram
    actor U as Investigator
    participant FE as /evidence/:id/annotate
    participant CVS as HTML5 Canvas
    participant API as POST /evidence/:id/annotations
    participant DB as PostgreSQL

    U->>FE: Navigate to annotation page
    FE->>API: GET /evidence/:id/annotations (Bearer)
    API->>DB: SELECT EvidenceAnnotation WHERE evidenceId = ?
    DB-->>API: Annotation rows with user.name
    API-->>FE: Annotation[]

    FE->>CVS: Load image from /api/evidence/:id/file
    CVS-->>FE: img.onload fires
    FE->>CVS: ctx.drawImage(img, 0, 0, W, H)
    FE->>CVS: drawAnnotation() for each existing annotation
    FE-->>U: Canvas rendered with history

    loop User draws
        U->>CVS: mousedown → start drawing
        CVS->>FE: onMouseMove events → accumulate points
        U->>CVS: mouseup → complete stroke
        FE->>FE: Add new Annotation to local state
        FE->>CVS: Redraw canvas (image + all annotations)
    end

    U->>FE: Click Save
    FE->>API: POST /evidence/:id/annotations { annotations: [...] }
    Note over API: DELETE existing annotations for this user
    API->>DB: evidenceAnnotation.deleteMany WHERE evidenceId + userId
    API->>DB: evidenceAnnotation.createMany (new set)
    API->>DB: AuditLog { action: "evidence.annotate" }
    DB-->>API: { count: N }
    API-->>FE: 200 { count: N }
    FE-->>U: Toast "Annotations saved"
```

---

## Diagram 3 — Global Search Architecture

```mermaid
flowchart TD
    A([User presses Ctrl+K]) --> B[CommandPalette modal opens]
    B --> C[Input auto-focused]
    C --> D{User typing?}

    D -->|No / empty| E[Show static action shortcuts]
    D -->|Yes — char count ≥ 1| F[250ms debounce timer starts]

    F --> G{Timer fires?}
    G -->|User still typing| F
    G -->|250ms elapsed| H[GET /search?q=encodeURIComponent query]

    H --> I[requireAuth middleware]
    I --> J[Parallel Prisma queries]

    J --> K["Case.findMany\n(title ILIKE, description ILIKE)\ntake: 5"]
    J --> L["Evidence.findMany\n(name ILIKE)\ntake: 5"]
    J --> M{User role?}
    M -->|ADMINISTRATOR| N["User.findMany\n(name/email ILIKE)\ntake: 5"]
    M -->|Other roles| O[users: empty array]

    K --> P[Merge results]
    L --> P
    N --> P
    O --> P

    P --> Q[Filter static actions by query]
    Q --> R[Return combined results to frontend]

    R --> S[Results rendered as listbox]
    S --> T{User action}
    T -->|Arrow keys| U[setActiveIndex]
    T -->|Enter| V[router.push result.href]
    T -->|Click item| V
    T -->|Escape| W[closePalette — clear query + results]
    V --> X[Modal closes, navigate to page]
```

---

## Diagram 4 — Audit Export Pipeline

```mermaid
flowchart TD
    A([User clicks Download]) --> B{Format selected?}

    B -->|JSON| C[POST /audit/export\nbody: format=json + filters]
    B -->|CSV| D[POST /audit/export\nbody: format=csv + filters]

    C --> E[requireRole ADMINISTRATOR, AUDITOR]
    D --> E

    E -->|403| F[Return Insufficient permissions]
    E -->|Pass| G[buildWhere from filters\nresourceType, resourceId,\nactorUserId, action, from, to]

    G --> H[prisma.auditLog.findMany\nno limit cap on export\ninclude: actor]

    H --> I{Format?}

    I -->|JSON| J[Wrap in metadata envelope\n{ product, exportedAt,\nexportedBy, totalRecords, logs }]
    I -->|CSV| K[toCsv helper\nEscape values, build rows\none row per log entry]

    J --> L[Set Content-Type: application/json\nContent-Disposition: attachment\nfilename: audit-export-DATE.json]
    K --> M[Set Content-Type: text/csv\nContent-Disposition: attachment\nfilename: audit-export-DATE.csv]

    L --> N[res.json payload]
    M --> O[res.send csv string]

    N --> P[Browser receives blob]
    O --> P

    P --> Q[window.URL.createObjectURL blob]
    Q --> R[anchor.click — file downloads]
    R --> S[window.URL.revokeObjectURL]
    S --> T[Toast: Download started: filename]
```

---

## Diagram 5 — Case Comment + @Mention Flow

```mermaid
sequenceDiagram
    actor U as User
    participant FE as /cases/:id
    participant API as POST /cases/:id/comments
    participant DB as PostgreSQL

    U->>FE: Types: "Check this @Anjali.Sharma"
    FE->>FE: Parse @mentions with regex /@([\w\s.-]+)/g
    FE->>FE: mentions = [{userId:"unknown", userName:"Anjali.Sharma"}]
    U->>FE: Click "Post comment"

    FE->>API: POST /cases/:id/comments\n{ content, mentions, parentId: null }
    API->>API: requireAuth middleware

    API->>DB: INSERT CaseComment\n{ caseId, userId, content, parentId }
    DB-->>API: Created comment

    loop For each mention
        API->>DB: SELECT User WHERE name ILIKE %Anjali.Sharma%
        DB-->>API: Matching user (or null)
        alt User found
            API->>DB: INSERT CommentMention\n{ commentId, userId: mentionedUser.id }
        end
    end

    API->>DB: INSERT AuditLog\n{ action:"case.comment", detailJson:{ preview } }

    API-->>FE: 201 { comment + mentions:[] + replies:[] }
    FE->>FE: setComments([...prev, newComment])
    FE-->>U: Comment appears in Discussion\n@Anjali.Sharma rendered in brand green
```

---

## Diagram 6 — Mobile Camera Capture → Upload

```mermaid
sequenceDiagram
    actor U as Field Investigator (Mobile)
    participant APP as /mobile/evidence/camera
    participant CAM as Browser Camera API
    participant CVS as HTML5 Canvas
    participant API as POST /evidence

    U->>APP: Navigate to camera page
    APP->>APP: Check streaming state

    alt Camera not started
        APP-->>U: "Enable camera" prompt shown
        U->>APP: Tap "Enable camera"
        APP->>CAM: navigator.mediaDevices.getUserMedia\n{ facingMode: "environment" }
        CAM-->>U: Permission dialog
        alt Permission denied
            CAM-->>APP: Error thrown
            APP-->>U: Error toast: "Camera access denied"
        else Permission granted
            CAM-->>APP: MediaStream
            APP->>APP: videoRef.current.srcObject = stream
            APP-->>U: Video stream fills screen
        end
    end

    U->>APP: Tap capture button (white circle)
    APP->>CVS: canvas.width = video.videoWidth
    APP->>CVS: canvas.height = video.videoHeight
    APP->>CVS: ctx.drawImage(video, 0, 0)
    CVS-->>APP: Frame captured

    APP->>APP: canvas.toBlob(callback, "image/jpeg", 0.9)
    APP->>APP: new File([blob], "capture-{Date.now()}.jpg")

    APP->>APP: Build FormData\n{ file, name, type:"JPG", ownerOrg:"Mobile Capture" }
    APP->>API: POST /evidence (Bearer token)
    API->>API: SHA-256 computed from file.buffer
    API->>API: CustodyEvent CREATED
    API->>API: AuditLog evidence.upload
    API-->>APP: 201 { id, sha256, status:"PENDING" }
    APP-->>U: Toast "Photo uploaded — evidence registered"
```

---

## Diagram 7 — Reports Data Aggregation Pipeline

```mermaid
flowchart LR
    A([GET /reports?range=90]) --> B[requireAuth]
    B --> C["since = now() - 90 days"]

    C --> D1[Case.findMany\nWHERE createdAt >= since\nSELECT status, createdAt, updatedAt]
    C --> D2[Evidence.findMany\nWHERE createdAt >= since\nSELECT type, mimeType, createdAt,\ncollectedBy.name]

    D1 --> E1[casesByStatus\ngroup by status → count]
    D1 --> E2[casesByMonth\ngroup by YYYY-MM → count]
    D1 --> E3[avgResolutionDays\nmean of updatedAt-createdAt\nfor Closed/Archived cases]

    D2 --> F1[evidenceByType\nmap mimeType → category\ngroup → count]
    D2 --> F2[evidenceByMonth\ngroup by YYYY-MM → count]
    D2 --> F3[topUploaders\ngroup by collectedBy.name\nsort desc, take 5]
    D2 --> F4[totalEvidence = D2.length]
    D1 --> F5[totalCases = D1.length]

    E1 & E2 & E3 & F1 & F2 & F3 & F4 & F5 --> G[ReportData object]
    G --> H[res.json — all computed in process\nno raw SQL aggregations]

    style G fill:#edfaf3,stroke:#0f845a
```

---

## Diagram 8 — Search Ranking & Result Grouping

```mermaid
flowchart TD
    A[Search query: q = 'midnight'] --> B[Backend: parallel queries]

    B --> C[Cases: title ILIKE '%midnight%'\nOR description ILIKE '%midnight%'\ntake: 5]
    B --> D[Evidence: name ILIKE '%midnight%'\ntake: 5]
    B --> E{Role = ADMINISTRATOR?}
    E -->|Yes| F[Users: name ILIKE '%midnight%'\nOR email ILIKE '%midnight%'\ntake: 5]
    E -->|No| G[users: empty array]

    C --> H[Map to SearchResult:\n{ id, type:'case', title, subtitle:status, href }]
    D --> I[Map to SearchResult:\n{ id, type:'evidence', title:name,\nsubtitle:case.title, href }]
    F --> J[Map to SearchResult:\n{ id, type:'user', title:name,\nsubtitle:email, href }]

    H & I & J --> K[Merge DB results]
    K --> L[Filter static STATIC_ACTIONS\nby query.toLowerCase includes]
    L --> M[Combine: DB results + matching actions]

    M --> N[Frontend renders:\n● Cases first\n● Evidence second\n● Users third\n● Actions last]

    style N fill:#eff6ff,stroke:#2563eb
```

---

## Diagram 9 — PWA Offline Strategy

```mermaid
flowchart TD
    A([User requests resource]) --> B{Online?}

    B -->|Yes| C[Fetch from network]
    B -->|No| D{In cache?}

    C --> E{Request type?}
    E -->|Static assets JS/CSS| F[CacheFirst\nServe from cache\nUpdate in background]
    E -->|API /api/* routes| G[NetworkFirst\nTry network first\nFall back to cache if offline\nCache expires 24h]
    E -->|Images| H[CacheFirst\nServe from cache\nExpires 7 days]

    D -->|Yes| I[Serve from cache\nShow stale indicator]
    D -->|No| J[Show offline error\nLink to try again]

    F & G & H --> K[Response delivered to page]
    I --> K

    subgraph "What WORKS offline"
        L[Previously viewed pages]
        M[Cached API responses < 24h old]
        N[Evidence images < 7 days old]
        O[Static JS/CSS bundle]
    end

    subgraph "What FAILS offline"
        P[New file uploads]
        Q[Creating cases/evidence]
        R[Notification polling]
        S[Password change]
    end
```

---

## Diagram 10 — Evidence Lifecycle with Advanced Features

```mermaid
stateDiagram-v2
    [*] --> Uploaded : POST /evidence\n+ SHA-256 computed\n+ CREATED custody event

    Uploaded --> Annotated : Investigator opens\n/evidence/:id/annotate\nDraws + saves canvas annotations

    Annotated --> Verified : Local hash check ✓\nor GET /public/verify/:sha256 ✓

    Uploaded --> Accessed : Any user views\n/evidence/:id\n→ ACCESSED custody event

    Accessed --> Downloaded : User clicks Download\n→ DOWNLOADED custody event

    Verified --> Sealed : Admin seals evidence\nfor court submission

    Uploaded --> Flagged : Hash mismatch on verify\nor flagged manually

    Flagged --> UnderReview : Investigator reviews\nadds case comment @mention

    UnderReview --> Verified : Re-verification passes
    UnderReview --> Sealed : Sealed with flag noted

    Sealed --> [*] : Case closed\nFull audit trail exportable\nas CSV/JSON for court

    note right of Annotated
        Annotations stored in
        EvidenceAnnotation table
        as normalised JSON points
    end note

    note right of Sealed
        GET /audit/export provides
        immutable court-ready
        chain of custody record
    end note
```
