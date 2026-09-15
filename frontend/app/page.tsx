"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, getMe, logout, type AuthUser } from "../lib/api";

interface HealthResponse {
  status: string;
  service: string;
  aiService: "ok" | "unreachable";
  timestamp: string;
}

export default function HomePage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    fetch(`${apiUrl}/health`)
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setHealthError("Could not reach backend"));

    getMe()
      .then(({ user }) => setUser(user))
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) {
          setHealthError("Could not reach backend");
        }
      })
      .finally(() => setCheckingSession(false));
  }, []);

  async function onLogout() {
    await logout();
    setUser(null);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Rubric</h1>
      <p className="text-slate-600">
        Faculty defines what matters. Rubric understands what students know.
      </p>

      <div className="w-full rounded-lg border border-slate-200 bg-white p-4 text-sm">
        {checkingSession && <p className="text-slate-500">Checking session…</p>}
        {!checkingSession && user && (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                Signed in as {user.fullName} ({user.role})
              </p>
              <p className="text-slate-600">{user.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/courses"
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                My Courses
              </Link>
              <button
                onClick={onLogout}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
              >
                Log out
              </button>
            </div>
          </div>
        )}
        {!checkingSession && !user && (
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Log in
            </Link>
            <Link href="/signup" className="text-sm font-medium text-slate-900 underline">
              Sign up
            </Link>
          </div>
        )}
      </div>

      <div className="w-full rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <p className="font-medium">System status</p>
        {healthError && <p className="text-red-600">{healthError}</p>}
        {!healthError && !health && <p className="text-slate-500">Checking backend…</p>}
        {health && (
          <ul className="mt-2 space-y-1 text-slate-700">
            <li>backend: {health.status}</li>
            <li>ai-service: {health.aiService}</li>
          </ul>
        )}
      </div>
    </main>
  );
}
