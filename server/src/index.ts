import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes     from "./routes/auth.routes";
import evidenceRoutes from "./routes/evidence.routes";
import casesRoutes    from "./routes/cases.routes";
import auditRoutes    from "./routes/audit.routes";
import publicRoutes   from "./routes/public.routes";
import reportsRoutes  from "./routes/reports.routes";
import searchRoutes   from "./routes/search.routes";
import usersRoutes    from "./routes/users.routes";
import notificationsRoutes from "./routes/notifications.routes";

const app = express();


const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.CORS_ORIGIN,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].filter(Boolean) as string[];


app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server) or matched origins
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());


// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/auth",     authRoutes);
app.use("/evidence", evidenceRoutes);
app.use("/cases",    casesRoutes);
app.use("/audit",    auditRoutes);
app.use("/public",   publicRoutes);
app.use("/reports",       reportsRoutes);
app.use("/search",        searchRoutes);
app.use("/users",         usersRoutes);
app.use("/notifications", notificationsRoutes);


// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ error: message });
});

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`EviChain API running on http://localhost:${port}`);
});
