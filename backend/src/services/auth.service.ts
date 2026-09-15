import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { findUserByEmail, insertUser, type UserRole, type UserRow } from "../db/users.repo";
import { AppError } from "../errors/AppError";
import type { LoginInput, SignupInput } from "../schemas/auth.schema";

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = "7d";

export interface AuthTokenPayload {
  sub: string;
  role: UserRole;
}

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

function toPublicUser(user: UserRow): PublicUser {
  return { id: user.id, email: user.email, fullName: user.full_name, role: user.role };
}

export function signToken(user: PublicUser): string {
  const payload: AuthTokenPayload = { sub: user.id, role: user.role };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
}

export async function signup(input: SignupInput): Promise<PublicUser> {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw AppError.badRequest("An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await insertUser({
    email: input.email,
    passwordHash,
    fullName: input.fullName,
    role: input.role,
  });

  return toPublicUser(user);
}

export async function login(input: LoginInput): Promise<PublicUser> {
  const user = await findUserByEmail(input.email);
  if (!user) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const passwordMatches = await bcrypt.compare(input.password, user.password_hash);
  if (!passwordMatches) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  return toPublicUser(user);
}

export { toPublicUser };
