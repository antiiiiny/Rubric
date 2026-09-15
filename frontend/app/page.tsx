"use client";

import { useEffect, useState } from "react";

interface HealthResponse {
  status: string;
  service: string;
  aiService: "ok" | "unreachable";
  timestamp: string;
}

export default function HomePage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    fetch(`${apiUrl}/health`)
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setError("Could not reach backend"));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Rubric</h1>
      <p className="text-slate-600">
        Faculty defines what matters. Rubric understands what students know.
      </p>
      <div className="w-full rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <p className="font-medium">System status</p>
        {error && <p className="text-red-600">{error}</p>}
        {!error && !health && <p className="text-slate-500">Checking backend…</p>}
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
