import { pool } from "./pool";

export type UserRole = "faculty" | "student";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

export async function insertUser(input: {
  email: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
}): Promise<UserRow> {
  const result = await pool.query<UserRow>(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, password_hash, full_name, role, created_at, updated_at`,
    [input.email, input.passwordHash, input.fullName, input.role],
  );
  return result.rows[0];
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, email, password_hash, full_name, role, created_at, updated_at
     FROM users
     WHERE lower(email) = lower($1)`,
    [email],
  );
  return result.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, email, password_hash, full_name, role, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function deleteUserByEmail(email: string): Promise<void> {
  await pool.query(`DELETE FROM users WHERE lower(email) = lower($1)`, [email]);
}
