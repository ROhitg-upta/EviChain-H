import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "./auth";

export interface AuthedRequest extends Request {
  userId?: string;
  userRole?: string;
}

export function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization token" });
  }

  try {
    const payload = verifyAccessToken(header.replace("Bearer ", ""));
    req.userId = payload.sub;
    req.userRole = payload.role;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

/** Security headers middleware */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

/** In-memory rate limiting middleware */
export function createRateLimiter(options: { windowMs: number; max: number; message?: string }) {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || (req.headers["x-forwarded-for"] as string) || "unknown";
    const now = Date.now();
    const record = requests.get(ip);

    if (!record || now > record.resetTime) {
      requests.set(ip, { count: 1, resetTime: now + options.windowMs });
      return next();
    }

    record.count++;
    if (record.count > options.max) {
      const retrySec = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader("Retry-After", String(retrySec));
      return res.status(429).json({
        error: options.message || "Too many requests. Please try again later.",
      });
    }

    next();
  };
}