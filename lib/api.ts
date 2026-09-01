const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// â”€â”€â”€ Shared types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type AuthResponse = {
  user: { id: string; email: string; name: string; role: string };
  accessToken: string;
  refreshToken: string;
};

export type CaseRecord = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  leadUserId: string;
  lead?: { id: string; name: string; role: string } | null;
  evidenceCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type CustodyEvent = {
  id: string;
  evidenceId: string;
  action: string;
  actorUserId: string;
  actor?: { id: string; name: string; role: string } | null;
  fromLocation?: string | null;
  toLocation?: string | null;
  note: string;
  timestamp: string;
};

export type EvidenceRecord = {
  id: string;
  name: string;
  type: string;
  ownerOrg: string;
  status: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  storageKey: string;
  caseId?: string | null;
  case?: { id: string; title: string; status: string } | null;
  collectedById: string;
  collectedBy?: { id: string; name: string; role: string } | null;
  custodyEvents?: CustodyEvent[];
  createdAt: string;
  updatedAt: string;
};

export type CaseDetail = CaseRecord & {
  evidence: EvidenceRecord[];
};

export type PublicVerifyResult = {
  sha256: string;
  matched: boolean;
  evidence: {
    id: string;
    name: string;
    type: string;
    ownerOrg: string;
    status: string;
    sha256: string;
    registeredAt: string;
  } | null;
};

export type UploadEvidenceResult = {
  id: string;
  name: string;
  type: string;
  ownerOrg: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  status: string;
  createdAt: string;
};

// ─── Safe JSON parser ─────────────────────────────────────────────────────────

/**
 * Safely parse a Response as JSON.
 * If the server returns HTML (e.g. a Next.js 404 page or an unhandled Express
 * error) we read the text first and surface a human-readable message instead
 * of throwing "Unexpected token '<'".
 */
async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const ct = res.headers.get("content-type") ?? "";

  if (!ct.includes("application/json")) {
    // Trim long HTML blobs down to something useful
    const preview = text.slice(0, 120).replace(/\s+/g, " ").trim();
    throw new Error(
      `Server returned ${res.status} (non-JSON)${preview ? `: ${preview}` : ""}. ` +
        "Is the backend running on port 4000?",
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Server returned ${res.status} but the JSON was malformed.`);
  }
}

/** Extract a human-readable message from any error shape the backend sends. */
function extractError(data: { error?: unknown }, fallback: string): string {
  const e = data.error;
  if (!e) return fallback;
  if (typeof e === "string") return e;
  // Zod flatten() shape: { formErrors: string[], fieldErrors: Record<string, string[]> }
  if (typeof e === "object") {
    const ze = e as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
    const fields = ze.fieldErrors
      ? Object.entries(ze.fieldErrors)
          .map(([k, v]) => `${k}: ${v.join(", ")}`)
          .join(" · ")
      : "";
    const forms = ze.formErrors?.join(" · ") ?? "";
    const msg = [forms, fields].filter(Boolean).join(" · ");
    return msg || fallback;
  }
  return fallback;
}

let refreshPromise: Promise<string | null> | null = null;

/**
 * Silently refreshes the access token using the httpOnly refreshToken cookie.
 * Prevents multiple simultaneous refresh requests using a singleton promise.
 */
export async function refreshToken(): Promise<AuthResponse | null> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as AuthResponse;
    if (typeof window !== "undefined" && data.accessToken) {
      localStorage.setItem("evichain-token-v1", data.accessToken);
      if (data.refreshToken) {
        localStorage.setItem("evichain-refresh-v1", data.refreshToken);
      }
      localStorage.setItem(
        "evichain-session-v1",
        JSON.stringify({
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
          initials: data.user.name
            .split(" ")
            .map((part) => part.charAt(0))
            .join("")
            .slice(0, 2)
            .toUpperCase(),
        }),
      );
    }
    return data;
  } catch {
    return null;
  }
}

async function performSilentRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const data = await refreshToken();
      return data?.accessToken ?? null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

/** Shared fetch wrapper: throws on network error with a friendly message.
 *  Includes credentials by default and automatically retries with a refreshed token on 401. */
async function apiFetch(
  url: string,
  init?: RequestInit,
  isRetry = false,
): Promise<Response> {
  const mergedInit: RequestInit = {
    ...init,
    credentials: init?.credentials ?? "include",
  };

  let res: Response;
  try {
    res = await fetch(url, mergedInit);
  } catch {
    throw new Error(
      "Cannot reach the server — is the backend running on port 4000?",
    );
  }

  // Handle 401 Unauthorized with token refresh retry
  if (res.status === 401 && !isRetry && !url.includes("/auth/")) {
    const newAccessToken = await performSilentRefresh();

    if (newAccessToken) {
      // Clone headers and retry request with updated Authorization header
      const headers = new Headers(mergedInit.headers);
      headers.set("Authorization", `Bearer ${newAccessToken}`);

      return apiFetch(url, { ...mergedInit, headers }, true);
    }

    // Refresh failed or returned null — clear local session and redirect
    if (typeof window !== "undefined") {
      localStorage.removeItem("evichain-session-v1");
      localStorage.removeItem("evichain-token-v1");
      localStorage.removeItem("evichain-refresh-v1");
      window.location.replace("/login");
      throw new Error("Session expired. Please sign in again.");
    }
  }

  return res;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string) {
  const res = await apiFetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const data = await safeJson<{ error: unknown }>(res);
    throw new Error(extractError(data, "Login failed"));
  }

  return safeJson<AuthResponse>(res);
}

export async function register(
  email: string,
  password: string,
  name: string,
  role: string,
) {
  const res = await apiFetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, role }),
  });

  if (!res.ok) {
    const data = await safeJson<{ error: unknown }>(res);
    throw new Error(extractError(data, "Registration failed"));
  }

  return safeJson<AuthResponse>(res);
}

export async function logout(token?: string | null): Promise<void> {
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } catch (err) {
    console.error("Logout request error:", err);
  }
}


// â”€â”€â”€ Cases â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getCases(token: string): Promise<CaseRecord[]> {
  const res = await apiFetch(`${API_URL}/cases`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const data = await safeJson<{ error: string }>(res);
    throw new Error(data.error || "Failed to fetch cases");
  }

  return safeJson<CaseRecord[]>(res);
}

export async function getCaseById(token: string, id: string): Promise<CaseDetail> {
  const res = await apiFetch(`${API_URL}/cases/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const data = await safeJson<{ error: string }>(res);
    throw new Error(data.error || "Failed to fetch case");
  }

  return safeJson<CaseDetail>(res);
}

export async function createCase(
  token: string,
  data: { title: string; description?: string; status?: string; priority?: string },
) {
  const res = await apiFetch(`${API_URL}/cases`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await safeJson<{ error: string }>(res);
    throw new Error(err.error || "Failed to create case");
  }

  return safeJson<CaseRecord>(res);
}

export async function updateCase(
  token: string,
  id: string,
  data: { title?: string; description?: string; status?: string; priority?: string },
) {
  const res = await apiFetch(`${API_URL}/cases/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await safeJson<{ error: string }>(res);
    throw new Error(err.error || "Failed to update case");
  }

  return safeJson<CaseRecord>(res);
}

export async function linkEvidenceToCase(
  token: string,
  caseId: string,
  evidenceId: string,
) {
  const res = await apiFetch(
    `${API_URL}/cases/${caseId}/evidence/${evidenceId}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    const err = await safeJson<{ error: string }>(res);
    throw new Error(err.error || "Failed to link evidence");
  }

  return safeJson<EvidenceRecord>(res);
}

// â”€â”€â”€ Evidence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getEvidence(token: string): Promise<EvidenceRecord[]> {
  const res = await apiFetch(`${API_URL}/evidence`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const data = await safeJson<{ error: string }>(res);
    throw new Error(data.error || "Failed to fetch evidence");
  }

  return safeJson<EvidenceRecord[]>(res);
}

export async function getEvidenceById(
  token: string,
  id: string,
): Promise<EvidenceRecord> {
  const res = await apiFetch(`${API_URL}/evidence/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const data = await safeJson<{ error: string }>(res);
    throw new Error(data.error || "Failed to fetch evidence");
  }

  return safeJson<EvidenceRecord>(res);
}

/**
 * Upload evidence with real XHR progress.
 * `onProgress` receives a 0-100 percentage value.
 */
export function uploadEvidence(
  token: string,
  formData: FormData,
  onProgress?: (pct: number) => void,
): Promise<UploadEvidenceResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("POST", `${API_URL}/evidence`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      const ct = xhr.getResponseHeader("content-type") ?? "";
      if (!ct.includes("application/json")) {
        reject(
          new Error(
            `Server returned ${xhr.status} (non-JSON). Is the backend running?`,
          ),
        );
        return;
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        reject(new Error("Server returned malformed JSON"));
        return;
      }

      if (xhr.status >= 400) {
        reject(new Error((data.error as string) || "Upload failed"));
        return;
      }

      resolve(data as unknown as UploadEvidenceResult);
    };

    xhr.onerror = () =>
      reject(
        new Error("Cannot reach the server â€” is the backend running on port 4000?"),
      );

    xhr.send(formData);
  });
}

/** Alias kept for backward compatibility with existing pages. */
export async function createEvidence(token: string, formData: FormData) {
  return uploadEvidence(token, formData);
}

/** Download evidence â€” logs DOWNLOADED custody event server-side. */
export async function downloadEvidence(token: string, id: string) {
  const res = await apiFetch(`${API_URL}/evidence/${id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const data = await safeJson<{ error: string }>(res);
    throw new Error(data.error || "Download failed");
  }

  return safeJson<{
    id: string;
    name: string;
    storageKey: string;
    sha256: string;
    sizeBytes: number;
    mimeType: string;
    note: string;
  }>(res);
}

// â”€â”€â”€ Public verification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Upload a file; server computes SHA-256 and checks registry. No auth. */
export async function verifyFile(file: File): Promise<PublicVerifyResult> {
  const fd = new FormData();
  fd.append("file", file);

  const res = await apiFetch(`${API_URL}/public/verify`, {
    method: "POST",
    body: fd,
  });

  if (!res.ok) {
    const data = await safeJson<{ error: string }>(res);
    throw new Error(data.error || "Verification failed");
  }

  return safeJson<PublicVerifyResult>(res);
}

/** Check a known SHA-256 hash against the registry. No auth. */
export async function verifyByHash(sha256: string): Promise<PublicVerifyResult> {
  const res = await apiFetch(`${API_URL}/public/verify/${sha256}`);

  if (!res.ok) {
    const data = await safeJson<{ error: string }>(res);
    throw new Error(data.error || "Lookup failed");
  }

  return safeJson<PublicVerifyResult>(res);
}

// â”€â”€â”€ Legacy aliases â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const publicVerifyFile = verifyFile;
export const publicVerifyHash = verifyByHash;

// â”€â”€â”€ Audit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type AuditLog = {
  id: string;
  actorUserId: string | null;
  actor?: { id: string; name: string; role: string } | null;
  action: string;
  resourceType: string;
  resourceId: string;
  detailJson: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: string;
  // Present only on GET /audit/:id
  relatedCase?: { id: string; title: string; status: string } | null;
  relatedEvidence?: { id: string; name: string; type: string; sha256: string; status: string } | null;
};

export type AuditFilterParams = {
  resourceType?: string;
  resourceId?: string;
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
};

export async function getAuditLogs(
  token: string,
  params?: AuditFilterParams,
): Promise<AuditLog[]> {
  const q = new URLSearchParams();
  if (params?.resourceType) q.set("resourceType", params.resourceType);
  if (params?.resourceId)   q.set("resourceId",   params.resourceId);
  if (params?.actorUserId)  q.set("actorUserId",  params.actorUserId);
  if (params?.action)       q.set("action",       params.action);
  if (params?.from)         q.set("from",         params.from);
  if (params?.to)           q.set("to",           params.to);
  if (params?.limit)        q.set("limit",        String(params.limit));

  const res = await apiFetch(`${API_URL}/audit?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const data = await safeJson<{ error: string }>(res);
    throw new Error(data.error || "Failed to fetch audit logs");
  }

  return safeJson<AuditLog[]>(res);
}

export async function getAuditLogById(token: string, id: string): Promise<AuditLog> {
  const res = await apiFetch(`${API_URL}/audit/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const data = await safeJson<{ error: string }>(res);
    throw new Error(data.error || "Failed to fetch audit log");
  }

  return safeJson<AuditLog>(res);
}

export type ExportAuditParams = AuditFilterParams & {
  format?: "json" | "csv";
};

/**
 * POST /audit/export â€” returns a Blob for browser download.
 * Triggers the download automatically and returns the filename used.
 */
export async function exportAuditLogs(
  token: string,
  params?: ExportAuditParams,
): Promise<string> {
  const format = params?.format ?? "json";
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `audit-export-${dateStamp}.${format}`;

  const body: Record<string, string> = { format };
  if (params?.resourceType) body.resourceType = params.resourceType;
  if (params?.resourceId)   body.resourceId   = params.resourceId;
  if (params?.actorUserId)  body.actorUserId  = params.actorUserId;
  if (params?.action)       body.action       = params.action;
  if (params?.from)         body.from         = params.from;
  if (params?.to)           body.to           = params.to;

  const res = await apiFetch(`${API_URL}/audit/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await safeJson<{ error: string }>(res);
    throw new Error(data.error || "Failed to export audit logs");
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);

  return filename;
}

// â”€â”€â”€ Reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type ReportData = {
  totalCases: number;
  totalEvidence: number;
  avgResolutionDays: number;
  casesByStatus: { status: string; count: number }[];
  casesByMonth: { month: string; count: number }[];
  evidenceByType: { type: string; count: number }[];
  evidenceByMonth: { month: string; count: number }[];
  topUploaders: { name: string; count: number }[];
};

export async function getReportsData(
  token: string,
  rangeDays: string,
): Promise<ReportData> {
  const res = await apiFetch(`${API_URL}/reports?range=${rangeDays}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const data = await safeJson<{ error: string }>(res);
    throw new Error(data.error || "Failed to load report data");
  }

  return safeJson<ReportData>(res);
}

export async function exportReportPdf(
  token: string,
  rangeDays: string,
): Promise<Blob> {
  // Backend returns CSV (no PDF renderer on server); filename uses .csv
  const res = await apiFetch(
    `${API_URL}/reports/export?range=${rangeDays}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    const data = await safeJson<{ error: string }>(res);
    throw new Error(data.error || "Export failed");
  }

  return res.blob();
}



// â”€â”€â”€ Global search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type GlobalSearchResult = {
  cases:    { id: string; title: string; status: string }[];
  evidence: { id: string; name: string; case?: { title: string } | null }[];
  users:    { id: string; name: string; email: string }[];
};

export async function globalSearch(
  token: string,
  query: string,
): Promise<GlobalSearchResult> {
  const res = await apiFetch(
    `${API_URL}/search?q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    const data = await safeJson<{ error: string }>(res);
    throw new Error(data.error || "Search failed");
  }

  return safeJson<GlobalSearchResult>(res);
}

// â”€â”€â”€ User profile & preferences â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getMyActivity(token: string): Promise<AuditLog[]> {
  const res = await apiFetch(`${API_URL}/audit?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await safeJson<{ error: string }>(res);
    throw new Error(data.error || "Failed to fetch activity");
  }
  return safeJson<AuditLog[]>(res);
}

export async function updateMyProfile(
  token: string,
  data: { name: string },
): Promise<{ id: string; name: string; email: string; role: string }> {
  const res = await apiFetch(`${API_URL}/users/me`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await safeJson<{ error: string }>(res);
    throw new Error(err.error || "Failed to update profile");
  }
  return safeJson(res);
}

export async function changePassword(
  token: string,
  data: { currentPassword: string; newPassword: string },
): Promise<{ message: string }> {
  const res = await apiFetch(`${API_URL}/users/me/password`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await safeJson<{ error: string }>(res);
    throw new Error(err.error || "Failed to change password");
  }
  return safeJson(res);
}

export async function getNotificationPreferences(
  token: string,
): Promise<Record<string, boolean>> {
  const res = await apiFetch(`${API_URL}/users/me/notification-preferences`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    // Endpoint may not exist yet â€” return defaults silently
    return {};
  }
  return safeJson(res);
}

export async function updateNotificationPreferences(
  token: string,
  prefs: Record<string, boolean>,
): Promise<Record<string, boolean>> {
  const res = await apiFetch(`${API_URL}/users/me/notification-preferences`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) {
    const err = await safeJson<{ error: string }>(res);
    throw new Error(err.error || "Failed to save preferences");
  }
  return safeJson(res);
}

// ─── Case comments ────────────────────────────────────────────────────────────

export type CaseComment = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string | null;
  user: { id: string; name: string; email: string };
  mentions: { userId: string; userName: string }[];
  replies: CaseComment[];
};

export async function getCaseComments(token: string, caseId: string): Promise<CaseComment[]> {
  const res = await apiFetch(`${API_URL}/cases/${caseId}/comments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) { const e = await safeJson<{ error: string }>(res); throw new Error(e.error || "Failed"); }
  return safeJson<CaseComment[]>(res);
}

export async function createCaseComment(
  token: string,
  caseId: string,
  data: { content: string; mentions: { userId: string; userName: string }[]; parentId: string | null },
): Promise<CaseComment> {
  const res = await apiFetch(`${API_URL}/cases/${caseId}/comments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await safeJson<{ error: string }>(res); throw new Error(e.error || "Failed"); }
  return safeJson<CaseComment>(res);
}

// ─── Evidence Annotations ─────────────────────────────────────────────────────

export type EvidenceAnnotation = {
  id: string;
  type: string;
  points: { x: number; y: number }[];
  text?: string | null;
  color: string;
  createdAt: string;
  user: { name: string };
};

export async function getEvidenceAnnotations(
  token: string,
  evidenceId: string,
): Promise<EvidenceAnnotation[]> {
  const res = await apiFetch(`${API_URL}/evidence/${evidenceId}/annotations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) { const e = await safeJson<{ error: string }>(res); throw new Error(e.error || "Failed"); }
  return safeJson<EvidenceAnnotation[]>(res);
}

export async function saveEvidenceAnnotations(
  token: string,
  evidenceId: string,
  annotations: Array<{ type: string; points: { x: number; y: number }[]; text?: string; color: string }>,
): Promise<{ count: number }> {
  const res = await apiFetch(`${API_URL}/evidence/${evidenceId}/annotations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ annotations }),
  });
  if (!res.ok) { const e = await safeJson<{ error: string }>(res); throw new Error(e.error || "Failed"); }
  return safeJson(res);
}
