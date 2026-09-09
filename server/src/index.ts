import "dotenv/config";
import "./config/env";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { prisma } from "./db";
import { getStorageAdapter } from "./storage";

import authRoutes from "./routes/auth.routes";
import evidenceRoutes from "./routes/evidence.routes";
import casesRoutes from "./routes/cases.routes";
import auditRoutes from "./routes/audit.routes";
import publicRoutes from "./routes/public.routes";
import reportsRoutes from "./routes/reports.routes";
import searchRoutes from "./routes/search.routes";
import usersRoutes from "./routes/users.routes";
import notificationsRoutes from "./routes/notifications.routes";
import adminRoutes from "./routes/admin.routes";
import profileRoutes from "./routes/profile.routes";
import integrityRoutes from "./routes/integrity.routes";
import workspaceRoutes from "./routes/workspace.routes";
import { securityHeaders, createRateLimiter } from "./middleware";

// ═══════════════════════════════════════════════════════════════════
// Global Process Safety Nets — Prevent Silent Process Crashes
// ═══════════════════════════════════════════════════════════════════
process.on("uncaughtException", (err: Error) => {
  console.error("[FATAL] Uncaught Exception intercepted:", err.message || err);
  if (err.stack) {
    console.error(err.stack);
  }
});

process.on("unhandledRejection", (reason: unknown) => {
  console.error("[FATAL] Unhandled Rejection intercepted:", reason instanceof Error ? reason.message : reason);
  if (reason instanceof Error && reason.stack) {
    console.error(reason.stack);
  }
});

const app = express();

const authLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  message: "Too many authentication attempts. Please try again in one minute.",
});

// Parse configured frontend origins from environment variables
const rawOrigins = [
  process.env.CLIENT_URL,
  process.env.CORS_ORIGIN,
  process.env.FRONTEND_URL,
  process.env.ALLOWED_ORIGIN,
  "https://evi-chain-h.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
];

const allowedOrigins = new Set<string>();
for (const item of rawOrigins) {
  if (!item) continue;
  for (const part of item.split(",")) {
    const trimmed = part.trim().replace(/\/+$/, "");
    if (trimmed) {
      allowedOrigins.add(trimmed);
    }
  }
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server, health checks)
      if (!origin) {
        return callback(null, true);
      }
      const normalized = origin.replace(/\/+$/, "");
      if (
        allowedOrigins.has(normalized) ||
        process.env.NODE_ENV !== "production" ||
        normalized.startsWith("http://localhost:") ||
        normalized.startsWith("http://127.0.0.1:") ||
        normalized.endsWith(".vercel.app")
      ) {
        return callback(null, true);
      }
      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Idempotency-Key",
      "Accept",
      "Origin",
    ],
  }),
);

app.use(securityHeaders);
app.use(cookieParser());
app.use(express.json());

// ═══════════════════════════════════════════════════════════════════
// GET /health & /api/health — Health Check & Database Diagnostic Endpoint
// ═══════════════════════════════════════════════════════════════════
const handleHealthCheck = async (_req: Request, res: Response) => {
  let dbStatus = "connected";
  try {
    // Quick bounded heartbeat query
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Database heartbeat timeout")), 4000)),
    ]);
  } catch {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = "connected";
    } catch {
      dbStatus = "disconnected";
    }
  }

  const isHealthy = dbStatus === "connected";
  const statusCode = isHealthy ? 200 : 503;

  return res.status(statusCode).json({
    status: isHealthy ? "ok" : "degraded",
    ok: isHealthy,
    service: "evichain-api",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
    database: dbStatus,
    ...(isHealthy ? {} : { message: "Database connection unavailable" }),
  });
};

app.get("/health", handleHealthCheck);
app.get("/api/health", handleHealthCheck);

// ═══════════════════════════════════════════════════════════════════
// GET /health/deep & /api/health/deep — Deep Diagnostic Health Check (DB + Storage)
// ═══════════════════════════════════════════════════════════════════
const handleDeepHealthCheck = async (_req: Request, res: Response) => {
  let dbStatus = "connected";
  let storageStatus = "accessible";

  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Database heartbeat timeout")), 4000)),
    ]);
  } catch {
    dbStatus = "disconnected";
  }

  try {
    const storage = getStorageAdapter();
    await storage.exists("__probe__");
  } catch {
    storageStatus = "unreachable";
  }

  const isHealthy = dbStatus === "connected" && storageStatus === "accessible";
  const statusCode = isHealthy ? 200 : 503;

  return res.status(statusCode).json({
    status: isHealthy ? "ok" : "degraded",
    ok: isHealthy,
    service: "evichain-api",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
    database: dbStatus,
    storage: storageStatus,
    ...(isHealthy ? {} : { message: "One or more core services are degraded" }),
  });
};

app.get("/health/deep", handleDeepHealthCheck);
app.get("/api/health/deep", handleDeepHealthCheck);

// ═══════════════════════════════════════════════════════════════════
// Route Manifest (Mounted at root and /api for full reverse-proxy tolerance)
// ═══════════════════════════════════════════════════════════════════
app.use("/auth",          authLimiter, authRoutes);
app.use("/api/auth",      authLimiter, authRoutes);

app.use("/evidence",      evidenceRoutes);
app.use("/api/evidence",  evidenceRoutes);

app.use("/cases",         casesRoutes);
app.use("/api/cases",     casesRoutes);

app.use("/audit",         auditRoutes);
app.use("/api/audit",     auditRoutes);

app.use("/public",        publicRoutes);
app.use("/api/public",    publicRoutes);

app.use("/reports",       reportsRoutes);
app.use("/api/reports",   reportsRoutes);

app.use("/search",        searchRoutes);
app.use("/api/search",    searchRoutes);

app.use("/users",         usersRoutes);
app.use("/api/users",     usersRoutes);

app.use("/notifications", notificationsRoutes);
app.use("/api/notifications", notificationsRoutes);

app.use("/admin",         adminRoutes);
app.use("/api/admin",     adminRoutes);

app.use("/profile",       profileRoutes);
app.use("/api/profile",   profileRoutes);

app.use("/workspace",     workspaceRoutes);
app.use("/api/workspace", workspaceRoutes);

app.use("/",              integrityRoutes);
app.use("/api",           integrityRoutes);

// Structured 404 fallback for unmatched API routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "API route not found",
      status: 404,
    },
  });
});

// Centralized structured error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[EviChain Server] Unhandled error:", err);
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message,
      status: 500,
    },
  });
});

const port = Number(process.env.PORT) || 4000;

let server: import("http").Server | undefined;
let keepAliveTimer: NodeJS.Timeout | undefined;

const isRunningTest =
  process.env.NODE_ENV === "test" ||
  process.argv.some((arg) => arg.includes("test"));

if (!isRunningTest) {
  // Start server listening
  server = app.listen(port, () => {
    console.log("==================================================");
    console.log("EviChain API Booted Successfully");
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`Port: ${port}`);
    console.log(`Health Check: http://localhost:${port}/health`);
    console.log("Routes: /auth, /cases, /evidence, /audit, /public, /reports, /search, /users, /notifications, /admin, /profile");
    console.log("==================================================");
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[FATAL] Port ${port} is already in use by another process. Please terminate stale processes.`);
    } else {
      console.error("[FATAL] HTTP server error:", err);
    }
  });

  // ═════════════════════════════════════════════════════════════════
  // Neon PostgreSQL Keep-Alive Pulse (Every 3.5 minutes)
  // Prevents idle cold-start disconnects during active dev sessions
  // ═════════════════════════════════════════════════════════════════
  keepAliveTimer = setInterval(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      try {
        await prisma.$connect();
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        // Silently log; do not crash
      }
    }
  }, 210000);

  const shutdown = async (signal: string) => {
    console.log(`\n[EviChain Server] Received ${signal}. Shutting down gracefully...`);
    if (keepAliveTimer) clearInterval(keepAliveTimer);

    if (server) {
      server.close(async () => {
        try {
          await prisma.$disconnect();
          console.log("[EviChain Server] Database disconnected. Process exit clean.");
          process.exit(0);
        } catch (err) {
          console.error("[EviChain Server] Error during database disconnection:", err);
          process.exit(1);
        }
      });
    } else {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

export { app, server };
