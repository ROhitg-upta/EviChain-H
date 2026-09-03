import "dotenv/config";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Response, CookieOptions } from "express";

function getJwtSecret(): string {
  return process.env.JWT_SECRET || "default-secret-key-min-32-chars-evichain-dev";
}

function getRefreshSecret(): string {
  return process.env.REFRESH_SECRET || "default-refresh-secret-min-32-chars-evichain-dev";
}

function getJwtExpiresIn(): import("ms").StringValue {
  return (process.env.JWT_EXPIRES_IN || "15m") as import("ms").StringValue;
}

function getRefreshExpiresIn(): import("ms").StringValue {
  return (process.env.REFRESH_EXPIRES_IN || "7d") as import("ms").StringValue;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(userId: string, role: string) {
  return jwt.sign({ sub: userId, role }, getJwtSecret(), {
    expiresIn: getJwtExpiresIn(),
  });
}

export function signRefreshToken(userId: string) {
  return jwt.sign({ sub: userId }, getRefreshSecret(), {
    expiresIn: getRefreshExpiresIn(),
  });
}

export const REFRESH_COOKIE_NAME = "refreshToken";

export const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
  path: "/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

export function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE_NAME, token, REFRESH_COOKIE_OPTIONS);
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    path: "/auth",
  });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, getJwtSecret()) as { sub: string; role: string };
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, getRefreshSecret()) as { sub: string };
}