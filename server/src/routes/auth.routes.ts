import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  verifyAccessToken,
} from "../auth";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  role: z
    .string()
    .transform((r) => r.toUpperCase())
    .pipe(z.enum(["ADMINISTRATOR", "INVESTIGATOR", "AUDITOR", "CUSTODIAN"])),
});

router.post("/register", async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { email, password, name, role } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: { email, passwordHash, name, role },
    });

    const accessToken  = signAccessToken(user.id, user.role);
    const refreshToken = signRefreshToken(user.id);

    setRefreshCookie(res, refreshToken);

    await prisma.auditLog.create({
      data: {
        actorUserId:  user.id,
        action:       "auth.register",
        resourceType: "user",
        resourceId:   user.id,
        detailJson:   { email: user.email, role: user.role },
        ipAddress:    req.ip,
        userAgent:    req.headers["user-agent"],
      },
    });

    return res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ error: "Registration failed" });
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await verifyPassword(password, user.passwordHash);

    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const accessToken  = signAccessToken(user.id, user.role);
    const refreshToken = signRefreshToken(user.id);

    setRefreshCookie(res, refreshToken);

    await prisma.auditLog.create({
      data: {
        actorUserId:  user.id,
        action:       "auth.login",
        resourceType: "user",
        resourceId:   user.id,
        detailJson:   { email: user.email },
        ipAddress:    req.ip,
        userAgent:    req.headers["user-agent"],
      },
    });

    return res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Login failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /auth/refresh  — Silent refresh token rotation
// ═══════════════════════════════════════════════════════════════════
router.post("/refresh", async (req, res) => {
  try {
    const incomingToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!incomingToken) {
      return res.status(401).json({ error: "Missing refresh token" });
    }

    let payload: { sub: string };
    try {
      payload = verifyRefreshToken(incomingToken);
    } catch {
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!user) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: "User no longer exists" });
    }

    // Token rotation: Issue NEW access token and NEW refresh token
    const newAccessToken  = signAccessToken(user.id, user.role);
    const newRefreshToken = signRefreshToken(user.id);

    setRefreshCookie(res, newRefreshToken);

    await prisma.auditLog.create({
      data: {
        actorUserId:  user.id,
        action:       "auth.refresh",
        resourceType: "user",
        resourceId:   user.id,
        detailJson:   { email: user.email },
        ipAddress:    req.ip,
        userAgent:    req.headers["user-agent"],
      },
    });

    return res.json({
      user,
      accessToken:  newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    clearRefreshCookie(res);
    return res.status(500).json({ error: "Token refresh failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /auth/logout  — Clear refresh token cookie & session
// ═══════════════════════════════════════════════════════════════════
router.post("/logout", async (req, res) => {
  try {
    let actorUserId: string | null = null;

    // Attempt to extract user id from auth header if available for auditing
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const payload = verifyAccessToken(authHeader.replace("Bearer ", ""));
        actorUserId = payload.sub;
      } catch {
        // Ignore expired or invalid token on logout
      }
    }

    clearRefreshCookie(res);

    if (actorUserId) {
      await prisma.auditLog.create({
        data: {
          actorUserId,
          action:       "auth.logout",
          resourceType: "user",
          resourceId:   actorUserId,
          detailJson:   {},
          ipAddress:    req.ip,
          userAgent:    req.headers["user-agent"],
        },
      });
    }

    return res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    clearRefreshCookie(res);
    return res.json({ message: "Logged out" });
  }
});

export default router;