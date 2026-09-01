import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Response, CookieOptions } from "express";

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN as string;
const REFRESH_SECRET = process.env.REFRESH_SECRET as string;
const REFRESH_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN as string;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(userId: string, role: string) {
  return jwt.sign({ sub: userId, role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as import("ms").StringValue,
  });
}

export function signRefreshToken(userId: string) {
  return jwt.sign({ sub: userId }, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES_IN as import("ms").StringValue,
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
  return jwt.verify(token, JWT_SECRET) as { sub: string; role: string };
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, REFRESH_SECRET) as { sub: string };
}