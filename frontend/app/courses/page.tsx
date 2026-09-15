"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, createCourse, getMe, listCourses, type AuthUser, type Course } from "../../lib/api";

export default function CoursesPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    const [{ user }, { courses }] = await Promise.all([getMe(), listCourses()]);
    setUser(user);
    setCourses(courses);
  }

  useEffect(() => {
    refresh()
      .catch(() => setError("Please log in to view courses."))
      .finally(() => setLoading(false));
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await createCourse({ title, description: description || undefined });
      setTitle("");
      setDescription("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create course.");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <main className="mx-auto max-w-2xl px-6 py-10 text-sm text-slate-500">Loading…</main>;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">My Courses</h1>
        <Link href="/" className="text-sm text-slate-600 underline">
          Home
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {user?.role === "faculty" && (
        <form onSubmit={onCreate} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium">Create a course</p>
          <input
            type="text"
            placeholder="Course title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={creating}
            className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create course"}
          </button>
        </form>
      )}

      <div className="flex flex-col gap-2">
        {courses.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            {user?.role === "faculty"
              ? "You haven't created any courses yet."
              : "You're not enrolled in any courses yet."}
          </p>
        )}
        {courses.map((course) => (
          <Link
            key={course.id}
            href={`/courses/${course.id}`}
            className="rounded-lg border border-slate-200 bg-white p-4 text-sm hover:border-slate-400"
          >
            <p className="font-medium">{course.title}</p>
            {course.description && <p className="mt-1 text-slate-600">{course.description}</p>}
          </Link>
        ))}
      </div>
    </main>
  );
}
