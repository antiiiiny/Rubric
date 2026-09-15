export type UserRole = "faculty" | "student";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.code = body.error.code;
    this.status = status;
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, body as ApiErrorBody);
  }

  return body as T;
}

export function signup(input: {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
}): Promise<{ user: AuthUser }> {
  return apiFetch("/auth/signup", { method: "POST", body: JSON.stringify(input) });
}

export function login(input: { email: string; password: string }): Promise<{ user: AuthUser }> {
  return apiFetch("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

export function logout(): Promise<void> {
  return apiFetch("/auth/logout", { method: "POST" });
}

export function getMe(): Promise<{ user: AuthUser }> {
  return apiFetch("/auth/me");
}

export interface Course {
  id: string;
  title: string;
  description: string | null;
  faculty_id: string;
  created_at: string;
  updated_at: string;
}

export interface CourseMember {
  user_id: string;
  email: string;
  full_name: string;
  joined_at: string;
}

export function createCourse(input: { title: string; description?: string }): Promise<{ course: Course }> {
  return apiFetch("/courses", { method: "POST", body: JSON.stringify(input) });
}

export function listCourses(): Promise<{ courses: Course[] }> {
  return apiFetch("/courses");
}

export function getCourse(id: string): Promise<{ course: Course }> {
  return apiFetch(`/courses/${id}`);
}

export function listCourseMembers(id: string): Promise<{ members: CourseMember[] }> {
  return apiFetch(`/courses/${id}/members`);
}

export function enrollStudent(id: string, email: string): Promise<{ enrolled: unknown }> {
  return apiFetch(`/courses/${id}/members`, { method: "POST", body: JSON.stringify({ email }) });
}
