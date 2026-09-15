import type { CookieOptions, Request, Response } from "express";
import { env } from "../config/env";
import { AUTH_COOKIE_NAME } from "../middleware/auth";
import type { LoginInput, SignupInput } from "../schemas/auth.schema";
import { findUserById } from "../db/users.repo";
import { login, signToken, signup, toPublicUser } from "../services/auth.service";
import { AppError } from "../errors/AppError";

const AUTH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export async function postSignup(req: Request, res: Response) {
  const body = req.body as SignupInput;
  const user = await signup(body);
  const token = signToken(user);
  res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
  res.status(201).json({ user });
}

export async function postLogin(req: Request, res: Response) {
  const body = req.body as LoginInput;
  const user = await login(body);
  const token = signToken(user);
  res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
  res.status(200).json({ user });
}

export function postLogout(_req: Request, res: Response) {
  res.clearCookie(AUTH_COOKIE_NAME, { httpOnly: true, secure: env.isProduction, sameSite: "lax" });
  res.status(204).send();
}

export async function getMe(req: Request, res: Response) {
  const userId = req.auth?.sub;
  if (!userId) {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
  }
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError(401, "UNAUTHENTICATED", "Account no longer exists");
  }
  res.status(200).json({ user: toPublicUser(user) });
}
