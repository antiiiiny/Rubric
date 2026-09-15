"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, getConceptMastery, getCourse, type ConceptMastery, type Course } from "../../../../lib/api";

function masteryColor(percent: number): string {
  if (percent >= 75) return "text-emerald-700";
  if (percent >= 50) return "text-amber-700";
  return "text-red-700";
}

export default function CourseAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [concepts, setConcepts] = useState<ConceptMastery[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ course }, { concepts }] = await Promise.all([
        getCourse(params.id),
        getConceptMastery(params.id),
      ]);
      setCourse(course);
      setConcepts(concepts);
    }
    load()
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Could not load analytics for this course."),
      )
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return <main className="mx-auto max-w-3xl px-6 py-10 text-sm text-slate-500">Loading…</main>;
  }

  if (error || !course) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-red-600">{error ?? "Could not load analytics."}</p>
        <Link href="/courses" className="mt-4 inline-block text-sm underline">
          Back to courses
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <Link href={`/courses/${course.id}`} className="text-sm text-slate-600 underline">
        Back to course
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{course.title} — Concept Mastery</h1>
        <p className="mt-1 text-sm text-slate-500">
          Aggregated from every AI-evaluated short-answer and assignment submission in this course.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Concept</th>
              <th className="px-4 py-2">Responses</th>
              <th className="px-4 py-2">Covered</th>
              <th className="px-4 py-2">Partial</th>
              <th className="px-4 py-2">Missing</th>
              <th className="px-4 py-2">Mastery</th>
              <th className="px-4 py-2">Flag</th>
            </tr>
          </thead>
          <tbody>
            {concepts.map((c) => (
              <tr key={c.concept} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-800">{c.concept}</td>
                <td className="px-4 py-2 text-slate-600">{c.totalResponses}</td>
                <td className="px-4 py-2 text-slate-600">{c.coveredCount}</td>
                <td className="px-4 py-2 text-slate-600">{c.partialCount}</td>
                <td className="px-4 py-2 text-slate-600">{c.missingCount}</td>
                <td className={`px-4 py-2 font-medium ${masteryColor(c.masteryPercent)}`}>
                  {c.masteryPercent}%
                </td>
                <td className="px-4 py-2">
                  {c.commonMisconception && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Common misconception
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {concepts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  No AI-evaluated submissions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
