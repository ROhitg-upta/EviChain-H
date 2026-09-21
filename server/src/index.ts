import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { prisma } from "./db";
import { env } from "./config/env";

import authRoutes from "./routes/auth.routes";
import evidenceRoutes from "./routes/evidence.routes";
import casesRoutes from "./routes/cases.routes";
import auditRoutes from "./routes/audit.routes";
import publicRoutes from "./routes/public.routes";
import reportsRoutes from "./routes/reports.routes";
import searchRoutes from "./routes/search.routes";
import usersRoutes from "./routes/users.routes";
import adminRoutes from "./routes/admin.routes";
import notificationsRoutes from "./routes/notifications.routes";
import profileRoutes from "./routes/profile.routes";
import workspaceRoutes from "./routes/workspace.routes";
import integrityRoutes from "./routes/integrity.routes";

const app = express();

// CORS setup supporting localhost, Vercel deployments, and production origins
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4000",
  "http://127.0.0.1:4000",
  env.CLIENT_URL,
  env.FRONTEND_URL,
  env.CORS_ORIGIN,
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      
      // Match explicit origins
      if (allowedOrigins.includes(origin)) return callback(null, true);

      // Match Vercel preview and production URLs
      if (/^https:\/\/.*\.vercel\.app$/.test(origin) || /^https:\/\/.*\.onrender\.com$/.test(origin)) {
        return callback(null, true);
      }

      // In non-production, permit all origins for seamless development
      if (env.NODE_ENV !== "production") {
        return callback(null, true);
      }

      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
  }),
);

app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Standard Health Check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    ok: true,
    service: "evichain-api",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Deep Health Check with database latency probe
app.get("/health/deep", async (_req, res) => {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;
    res.json({
      status: "ok",
      ok: true,
      service: "evichain-api",
      database: "connected",
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const latencyMs = Date.now() - start;
    res.status(503).json({
      status: "degraded",
      ok: false,
      service: "evichain-api",
      database: "disconnected",
      latencyMs,
      error: error instanceof Error ? error.message : "Database probe failed",
      timestamp: new Date().toISOString(),
    });
  }
});

// ── Route Registrations ───────────────────────────────────────────────
app.use("/auth", authRoutes);
app.use("/evidence", evidenceRoutes);
app.use("/cases", casesRoutes);
app.use("/audit", auditRoutes);
app.use("/public", publicRoutes);
app.use("/reports", reportsRoutes);
app.use("/search", searchRoutes);
app.use("/users", usersRoutes);
app.use("/admin", adminRoutes);
app.use("/notifications", notificationsRoutes);
app.use("/profile", profileRoutes);
app.use("/workspace", workspaceRoutes);

// Integrity engine routes (mounts /evidence/:id/integrity, /cases/:id/integrity, and /integrity/*)
app.use("/integrity", integrityRoutes);
app.use("/", integrityRoutes);

// 404 fallback for unmatched API endpoints
app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "API endpoint not found (404). Please verify that your live backend server exposes this route.",
    },
    message: "Route not found",
  });
});

// Global central error handling middleware
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[EviChain API Error]:", err);
  const message = err instanceof Error ? err.message : "Internal server error";
  const statusCode = (err as { status?: number; statusCode?: number })?.status || (err as { statusCode?: number })?.statusCode || 500;
  
  res.status(statusCode).json({
    success: false,
    error: {
      code: "SERVER_ERROR",
      message,
      status: statusCode,
    },
  });
});

const port = env.PORT || 4000;

// Export Express app for testing suites and serverless handlers
export { app };
export default app;

const isDirectRun =
  Boolean(process.argv[1] && (process.argv[1].endsWith("index.ts") || process.argv[1].endsWith("index.js"))) ||
  (typeof require !== "undefined" && require.main === module);

if (isDirectRun && process.env.NODE_ENV !== "test" && !process.env.TEST_RUNNER) {
  app.listen(port, () => {
    console.log(`EviChain API running on http://localhost:${port}`);
  });
}
