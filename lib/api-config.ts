/**
 * Centralized API Configuration & Diagnostics for EviChain
 * Single source of truth for frontend API base URLs, health checks, and error classification.
 */

// ─── Base URL Resolution ──────────────────────────────────────────────────────

/**
 * Returns the sanitized base URL for all API requests.
 * Evaluates NEXT_PUBLIC_API_URL -> Window location -> Local development fallback.
 */
export function getApiBaseUrl(): string {
  // 1. Explicit environment variable (Build-time or Runtime)
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, "");
  }

  // 2. Client-side browser context resolution
  if (typeof window !== "undefined") {
    const { hostname, protocol, port } = window.location;

    // Local development: Frontend on :3000 (or custom dev port), Backend on :4000
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local")) {
      return `${protocol}//${hostname}:4000`;
    }

    // Production deployment with co-located API or Next.js rewrites:
    // If NEXT_PUBLIC_API_URL was not injected during build, default to current origin
    return window.location.origin.replace(/\/+$/, "");
  }

  // 3. Server-side / SSR fallback
  const internalUrl = process.env.INTERNAL_API_URL;
  if (internalUrl && typeof internalUrl === "string" && internalUrl.trim().length > 0) {
    return internalUrl.trim().replace(/\/+$/, "");
  }

  return "http://localhost:4000";
}

/**
 * Build a fully qualified API URL for a given relative endpoint path.
 */
export function getApiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

/**
 * Check if the active API URL is pointing to a local development instance.
 */
export function isLocalApi(): boolean {
  const base = getApiBaseUrl().toLowerCase();
  return base.includes("localhost") || base.includes("127.0.0.1") || base.includes("0.0.0.0");
}

// ─── Error Classification & User Messages ─────────────────────────────────────

export type ApiErrorKind =
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "CORS_OR_BLOCKED"
  | "SERVER_UNAVAILABLE"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "CLIENT_ERROR"
  | "UNKNOWN";

export interface ClassifiedApiError {
  kind: ApiErrorKind;
  message: string;
  statusCode?: number;
  originalError?: unknown;
}

/**
 * Classifies an API error and generates an actionable, environment-appropriate message.
 * Never outputs raw "port 4000" guidance in remote production environments.
 */
export function classifyApiError(err: unknown, statusCode?: number): ClassifiedApiError {
  const base = getApiBaseUrl();
  const local = isLocalApi();

  // If HTTP status code is provided:
  if (typeof statusCode === "number") {
    if (statusCode === 401) {
      return {
        kind: "UNAUTHORIZED",
        message: "Authentication required or session expired. Please sign in again.",
        statusCode,
        originalError: err,
      };
    }
    if (statusCode === 403) {
      return {
        kind: "FORBIDDEN",
        message: "Access restricted: You do not have permission for this forensic action.",
        statusCode,
        originalError: err,
      };
    }
    if (statusCode === 404) {
      return {
        kind: "NOT_FOUND",
        message: local
          ? `API endpoint not found (404) at ${base}. Please ensure the backend is running with 'npm run dev' on port 4000.`
          : `API endpoint not found (404). If accessing a deployed frontend, please ensure NEXT_PUBLIC_API_URL is configured to point to your live backend server.`,
        statusCode,
        originalError: err,
      };
    }
    if (statusCode === 429) {
      return {
        kind: "RATE_LIMITED",
        message: "Too many requests. Please wait a moment before trying again.",
        statusCode,
        originalError: err,
      };
    }
    if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
      return {
        kind: "SERVER_UNAVAILABLE",
        message: local
          ? `EviChain API backend is starting up or unreachable at ${base} (HTTP ${statusCode}).`
          : `EviChain service is temporarily degraded or undergoing maintenance (HTTP ${statusCode}). Please try again shortly.`,
        statusCode,
        originalError: err,
      };
    }
    if (statusCode >= 500) {
      return {
        kind: "SERVER_UNAVAILABLE",
        message: "Internal server error encountered while processing forensic operation.",
        statusCode,
        originalError: err,
      };
    }
  }

  // Network / Fetch Exceptions:
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();

    // Timeout / Abort
    if (err.name === "AbortError" || msg.includes("abort") || msg.includes("timeout")) {
      return {
        kind: "TIMEOUT",
        message: "The connection to the EviChain API timed out. Please check your connection and retry.",
        originalError: err,
      };
    }

    // Typical browser fetch failure (net::ERR_CONNECTION_REFUSED, Failed to fetch, etc.)
    if (err instanceof TypeError || msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("fetch failed")) {
      if (local) {
        return {
          kind: "NETWORK_ERROR",
          message: `Unable to connect to the EviChain backend API at ${base}. Please ensure the backend server is running (e.g., 'npm run dev' or 'npm run dev:server').`,
          originalError: err,
        };
      }
      return {
        kind: "NETWORK_ERROR",
        message: `Unable to connect to the EviChain API. Please check your internet connectivity or verify server status.`,
        originalError: err,
      };
    }
  }

  return {
    kind: "UNKNOWN",
    message: err instanceof Error ? err.message : "An unexpected error occurred while communicating with the API.",
    originalError: err,
  };
}

/**
 * Convenience helper to return just the formatted message.
 */
export function formatApiErrorMessage(err: unknown, statusCode?: number): string {
  return classifyApiError(err, statusCode).message;
}

// ─── Health Check Probing ─────────────────────────────────────────────────────

export interface ApiHealthStatus {
  ok: boolean;
  status: "ok" | "degraded" | "unreachable";
  service?: string;
  environment?: string;
  database?: string;
  timestamp?: string;
  latencyMs: number;
  apiUrl: string;
  error?: string;
}

/**
 * Performs a fast, non-blocking health check against the configured backend /health endpoint.
 * Uses AbortController with a 5-second timeout.
 */
export async function checkApiHealth(timeoutMs = 5000): Promise<ApiHealthStatus> {
  const apiUrl = getApiBaseUrl();
  const healthUrl = `${apiUrl}/health`;
  const startTime = Date.now();

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetch(healthUrl, {
      method: "GET",
      signal: controller?.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    const latencyMs = Date.now() - startTime;
    if (timeoutId) clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        ok: false,
        status: "degraded",
        latencyMs,
        apiUrl,
        error: `Health check responded with HTTP ${res.status}`,
      };
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const isOk = data.ok === true || data.status === "ok";

    return {
      ok: isOk,
      status: isOk ? "ok" : "degraded",
      service: typeof data.service === "string" ? data.service : "evichain-api",
      environment: typeof data.environment === "string" ? data.environment : undefined,
      database: typeof data.database === "string" ? data.database : undefined,
      timestamp: typeof data.timestamp === "string" ? data.timestamp : new Date().toISOString(),
      latencyMs,
      apiUrl,
    };
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    const classified = classifyApiError(err);

    // Development diagnostic log
    if (process.env.NODE_ENV !== "production" && typeof console !== "undefined") {
      console.warn(`[EviChain Health Check] Probe to ${healthUrl} failed (${latencyMs}ms):`, classified.message);
    }

    return {
      ok: false,
      status: "unreachable",
      latencyMs,
      apiUrl,
      error: classified.message,
    };
  }
}
