"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ApiError,
  createAssessment,
  enrollStudent,
  getCourse,
  getMe,
  listAssessments,
  listCourseMembers,
  type Assessment,
  type AssessmentType,
  type AuthUser,
  type Course,
  type CourseMember,
} from "../../../lib/api";

export default function CourseDetailPage() {
  const params = useParams<{ id: string }>();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [members, setMembers] = useState<CourseMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollEmail, setEnrollEmail] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [newQuizTitle, setNewQuizTitle] = useState("");
  const [newQuizType, setNewQuizType] = useState<AssessmentType>("quiz");
  const [creatingQuiz, setCreatingQuiz] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  async function refreshMembers(courseId: string, role: string) {
    if (role === "faculty") {
      const { members } = await listCourseMembers(courseId);
      setMembers(members);
    }
  }

  async function refreshAssessments(courseId: string) {
    const { assessments } = await listAssessments(courseId);
    setAssessments(assessments);
  }

  useEffect(() => {
    async function load() {
      const [{ user }, { course }] = await Promise.all([getMe(), getCourse(params.id)]);
      setUser(user);
      setCourse(course);
      await Promise.all([refreshMembers(params.id, user.role), refreshAssessments(params.id)]);
    }
    load()
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Could not load this course."),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function onEnroll(e: React.FormEvent) {
    e.preventDefault();
    setEnrollError(null);
    setEnrolling(true);
    try {
      await enrollStudent(params.id, enrollEmail);
      setEnrollEmail("");
      if (user) await refreshMembers(params.id, user.role);
    } catch (err) {
      setEnrollError(err instanceof ApiError ? err.message : "Could not enroll student.");
    } finally {
      setEnrolling(false);
    }
  }

  async function onCreateQuiz(e: React.FormEvent) {
    e.preventDefault();
    setQuizError(null);
    setCreatingQuiz(true);
    try {
      await createAssessment(params.id, newQuizTitle, newQuizType);
      setNewQuizTitle("");
      await refreshAssessments(params.id);
    } catch (err) {
      setQuizError(err instanceof ApiError ? err.message : "Could not create quiz.");
    } finally {
      setCreatingQuiz(false);
    }
  }

  if (loading) {
    return <main className="mx-auto max-w-2xl px-6 py-10 text-sm text-slate-500">Loading…</main>;
  }

  if (error || !course) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-sm text-red-600">{error ?? "Course not found."}</p>
        <Link href="/courses" className="mt-4 inline-block text-sm underline">
          Back to courses
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <Link href="/courses" className="text-sm text-slate-600 underline">
        Back to courses
      </Link>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{course.title}</h1>
          {course.description && <p className="mt-1 text-slate-600">{course.description}</p>}
        </div>
        {user?.role === "faculty" && (
          <Link href={`/courses/${course.id}/analytics`} className="whitespace-nowrap text-sm underline">
            View analytics
          </Link>
        )}
      </div>

      {user?.role === "faculty" && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium">Students ({members?.length ?? 0})</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {members?.map((m) => (
              <li key={m.user_id}>
                {m.full_name} — {m.email}
              </li>
            ))}
            {members?.length === 0 && <li className="text-slate-500">No students enrolled yet.</li>}
          </ul>

          <form onSubmit={onEnroll} className="mt-4 flex flex-wrap gap-2">
            <label htmlFor="enroll-email" className="sr-only">
              Student email
            </label>
            <input
              id="enroll-email"
              type="email"
              placeholder="student@example.com"
              required
              value={enrollEmail}
              onChange={(e) => setEnrollEmail(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={enrolling}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {enrolling ? "Enrolling…" : "Enroll"}
            </button>
          </form>
          {enrollError && <p className="mt-2 text-sm text-red-600">{enrollError}</p>}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium">Quizzes &amp; Assignments</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {assessments.map((a) => (
            <li key={a.id}>
              <Link href={`/assessments/${a.id}`} className="underline">
                {a.title}
              </Link>{" "}
              <span className="text-xs text-slate-500">
                ({a.type}, {a.status})
              </span>
            </li>
          ))}
          {assessments.length === 0 && <li className="text-slate-500">Nothing here yet.</li>}
        </ul>

        {user?.role === "faculty" && (
          <form onSubmit={onCreateQuiz} className="mt-4 flex flex-wrap gap-2">
            <label htmlFor="new-assessment-type" className="sr-only">
              Assessment type
            </label>
            <select
              id="new-assessment-type"
              value={newQuizType}
              onChange={(e) => setNewQuizType(e.target.value as AssessmentType)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="quiz">Quiz</option>
              <option value="assignment">Assignment</option>
            </select>
            <label htmlFor="new-assessment-title" className="sr-only">
              Title
            </label>
            <input
              id="new-assessment-title"
              type="text"
              placeholder="Title"
              required
              value={newQuizTitle}
              onChange={(e) => setNewQuizTitle(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={creatingQuiz}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {creatingQuiz ? "Creating…" : "Create"}
            </button>
          </form>
        )}
        {quizError && <p className="mt-2 text-sm text-red-600">{quizError}</p>}
      </div>
    </main>
  );
}
