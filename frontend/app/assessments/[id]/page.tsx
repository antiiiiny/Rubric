"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ApiError,
  addQuestion,
  getAssessment,
  getMe,
  getMySubmission,
  listSubmissions,
  publishAssessment,
  submitAssessment,
  type Answer,
  type Assessment,
  type AuthUser,
  type Question,
  type SubmissionWithScore,
  type SubmitAnswerInput,
} from "../../../lib/api";

type NewQuestionType = "mcq" | "short_answer";

const STATUS_STYLES: Record<string, string> = {
  covered: "text-emerald-700",
  partial: "text-amber-700",
  missing: "text-red-700",
};

function EvaluationBreakdown({ evaluation }: { evaluation: Answer["evaluation"] }) {
  if (!evaluation) return null;

  if (evaluation.failed) {
    return (
      <p className="mt-2 text-xs text-amber-700">
        AI evaluation could not be completed — flagged for faculty review.
      </p>
    );
  }

  return (
    <div className="mt-2 rounded-md bg-slate-50 p-3 text-xs">
      {evaluation.needsFacultyReview && (
        <p className="mb-2 font-medium text-amber-700">
          Flagged for faculty review{evaluation.conflictOccurred ? " (evaluators disagreed)" : " (low confidence)"}
        </p>
      )}
      <ul className="space-y-1">
        {evaluation.criteria.map((c) => (
          <li key={c.criterionId}>
            <span className={`font-medium ${STATUS_STYLES[c.status] ?? ""}`}>
              {c.name} ({c.weight}%): {c.status}
            </span>
            <span className="text-slate-500"> — {c.reasoning}</span>
            {c.evidence && <span className="block text-slate-500 italic">&ldquo;{c.evidence}&rdquo;</span>}
          </li>
        ))}
      </ul>

      {evaluation.feedback && (
        <div className="mt-3 border-t border-slate-200 pt-2">
          <p className="font-medium text-slate-700">Feedback</p>
          <p className="mt-1 text-slate-600">{evaluation.feedback.summary}</p>
          {evaluation.feedback.suggestions.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-slate-600">
              {evaluation.feedback.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {evaluation.agentTrace.length > 0 && (
        <details className="mt-3 border-t border-slate-200 pt-2">
          <summary className="cursor-pointer font-medium text-slate-700">
            Evaluator trace ({evaluation.agentTrace.length} steps
            {evaluation.conflictOccurred ? ", conflict resolved" : ""})
          </summary>
          <ul className="mt-1 space-y-0.5 text-slate-600">
            {evaluation.agentTrace.map((a, i) => (
              <li key={i}>
                <span className={a.status === "error" ? "text-red-700" : ""}>{a.agentName}</span>: {a.summary}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export default function AssessmentDetailPage() {
  const params = useParams<{ id: string }>();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [mySubmission, setMySubmission] = useState<{
    submission: unknown;
    answers?: Answer[];
    totalScore?: number | null;
  } | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionWithScore[] | null>(null);

  async function load() {
    const [{ user }, { assessment, questions }] = await Promise.all([
      getMe(),
      getAssessment(params.id),
    ]);
    setUser(user);
    setAssessment(assessment);
    setQuestions(questions);

    const owner = user.role === "faculty";
    setIsOwner(owner);

    if (user.role === "student" && assessment.status === "published") {
      const sub = await getMySubmission(params.id);
      setMySubmission(sub);
    }
    if (owner && assessment.status === "published") {
      const { submissions } = await listSubmissions(params.id);
      setSubmissions(submissions);
    }
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this quiz."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (loading) {
    return <main className="mx-auto max-w-2xl px-6 py-10 text-sm text-slate-500">Loading…</main>;
  }

  if (error || !assessment) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-sm text-red-600">{error ?? "Quiz not found."}</p>
        <Link href="/courses" className="mt-4 inline-block text-sm underline">
          Back to courses
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <Link href={`/courses/${assessment.course_id}`} className="text-sm text-slate-600 underline">
        Back to course
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{assessment.title}</h1>
        <p className="mt-1 text-sm text-slate-500">Status: {assessment.status}</p>
      </div>

      {isOwner ? (
        <FacultyView
          assessment={assessment}
          questions={questions}
          submissions={submissions}
          onChange={load}
        />
      ) : (
        <StudentView
          assessment={assessment}
          questions={questions}
          mySubmission={mySubmission}
          onSubmitted={load}
        />
      )}
    </main>
  );
}

function FacultyView({
  assessment,
  questions,
  submissions,
  onChange,
}: {
  assessment: Assessment;
  questions: Question[];
  submissions: SubmissionWithScore[] | null;
  onChange: () => Promise<void>;
}) {
  const [type, setType] = useState<NewQuestionType>("mcq");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [expectedAnswer, setExpectedAnswer] = useState("");
  const [criteria, setCriteria] = useState([{ name: "", weight: 0 }]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  function resetForm() {
    setPrompt("");
    setOptions(["", ""]);
    setCorrectIndex(0);
    setExpectedAnswer("");
    setCriteria([{ name: "", weight: 0 }]);
  }

  async function onAddQuestion(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      if (type === "mcq") {
        await addQuestion(assessment.id, {
          type: "mcq",
          prompt,
          options: options.filter((o) => o.trim() !== ""),
          correctIndex,
        });
      } else {
        await addQuestion(assessment.id, {
          type: "short_answer",
          prompt,
          expectedAnswer,
          criteria: criteria.filter((c) => c.name.trim() !== ""),
        });
      }
      resetForm();
      await onChange();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not add question.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onPublish() {
    setFormError(null);
    setPublishing(true);
    try {
      await publishAssessment(assessment.id);
      await onChange();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not publish quiz.");
    } finally {
      setPublishing(false);
    }
  }

  const weightSum = criteria.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium">Questions ({questions.length})</p>
        <ol className="mt-2 list-decimal space-y-3 pl-5 text-sm text-slate-700">
          {questions.map((q) => (
            <li key={q.id}>
              <p className="font-medium">{q.prompt}</p>
              {q.type === "mcq" ? (
                <ul className="mt-1 list-disc pl-5 text-slate-600">
                  {q.mcq_options?.map((opt, i) => (
                    <li key={i} className={i === q.mcq_correct_index ? "font-semibold text-emerald-700" : ""}>
                      {opt}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-1 text-slate-600">
                  <p>Expected: {q.expected_answer}</p>
                  <ul className="list-disc pl-5">
                    {q.criteria.map((c) => (
                      <li key={c.id}>
                        {c.name} ({c.weight}%)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ol>

        {assessment.status === "draft" && (
          <button
            onClick={onPublish}
            disabled={publishing || questions.length === 0}
            className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {publishing ? "Publishing…" : "Publish quiz"}
          </button>
        )}
      </div>

      {assessment.status === "draft" && (
        <form onSubmit={onAddQuestion} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium">Add a question</p>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as NewQuestionType)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="mcq">Multiple choice</option>
            <option value="short_answer">Short answer</option>
          </select>
          <textarea
            placeholder="Question prompt"
            required
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />

          {type === "mcq" ? (
            <div className="flex flex-col gap-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correctIndex"
                    checked={correctIndex === i}
                    onChange={() => setCorrectIndex(i)}
                  />
                  <input
                    type="text"
                    placeholder={`Option ${i + 1}`}
                    required
                    value={opt}
                    onChange={(e) => {
                      const next = [...options];
                      next[i] = e.target.value;
                      setOptions(next);
                    }}
                    className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setOptions([...options, ""])}
                className="self-start text-xs text-slate-600 underline"
              >
                Add option
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <textarea
                placeholder="Expected answer (reference for AI evaluation)"
                required
                value={expectedAnswer}
                onChange={(e) => setExpectedAnswer(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="text-xs text-slate-500">Rubric concepts (weights must sum to 100)</p>
              {criteria.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Concept name"
                    value={c.name}
                    onChange={(e) => {
                      const next = [...criteria];
                      next[i] = { ...next[i], name: e.target.value };
                      setCriteria(next);
                    }}
                    className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Weight %"
                    value={c.weight}
                    onChange={(e) => {
                      const next = [...criteria];
                      next[i] = { ...next[i], weight: Number(e.target.value) };
                      setCriteria(next);
                    }}
                    className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              ))}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCriteria([...criteria, { name: "", weight: 0 }])}
                  className="text-xs text-slate-600 underline"
                >
                  Add concept
                </button>
                <span className={`text-xs ${weightSum === 100 ? "text-emerald-700" : "text-red-600"}`}>
                  Total weight: {weightSum}%
                </span>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Adding…" : "Add question"}
          </button>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
        </form>
      )}

      {submissions && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium">Submissions ({submissions.length})</p>
          <ul className="mt-3 space-y-4 text-sm text-slate-700">
            {submissions.map((s) => (
              <li key={s.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <p className="font-medium">
                  {s.student?.fullName ?? s.student?.email} — score:{" "}
                  {s.totalScore === null ? "pending AI evaluation" : `${s.totalScore}%`}
                </p>
                {s.answers
                  .filter((a) => a.evaluation)
                  .map((a) => (
                    <EvaluationBreakdown key={a.id} evaluation={a.evaluation} />
                  ))}
              </li>
            ))}
            {submissions.length === 0 && <li className="text-slate-500">No submissions yet.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function StudentView({
  assessment,
  questions,
  mySubmission,
  onSubmitted,
}: {
  assessment: Assessment;
  questions: Question[];
  mySubmission: { submission: unknown; answers?: Answer[]; totalScore?: number | null } | null;
  onSubmitted: () => Promise<void>;
}) {
  const [mcqAnswers, setMcqAnswers] = useState<Record<string, number>>({});
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (assessment.status !== "published") {
    return <p className="text-sm text-slate-500">This quiz has not been published yet.</p>;
  }

  if (mySubmission?.submission) {
    const answersByQuestion = new Map((mySubmission.answers ?? []).map((a) => [a.question_id, a]));
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium">Your results</p>
        <p className="mt-1 text-sm text-slate-600">
          Overall score:{" "}
          {mySubmission.totalScore === null || mySubmission.totalScore === undefined
            ? "pending AI evaluation"
            : `${mySubmission.totalScore}%`}
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          {questions.map((q) => {
            const answer = answersByQuestion.get(q.id);
            return (
              <li key={q.id}>
                <p className="font-medium">{q.prompt}</p>
                {q.type === "mcq" ? (
                  <p className="text-slate-600">
                    Your answer: {q.mcq_options?.[answer?.mcq_selected_index ?? -1] ?? "—"} — score:{" "}
                    {answer?.score ?? "—"}%
                  </p>
                ) : (
                  <>
                    <p className="text-slate-600">
                      Your answer: {answer?.text_answer} — score:{" "}
                      {answer?.score === null || answer?.score === undefined
                        ? "pending AI evaluation"
                        : `${answer.score}%`}
                    </p>
                    <EvaluationBreakdown evaluation={answer?.evaluation} />
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const answers: SubmitAnswerInput[] = questions.map((q) =>
        q.type === "mcq"
          ? { questionId: q.id, type: "mcq", selectedIndex: mcqAnswers[q.id] ?? -1 }
          : { questionId: q.id, type: "short_answer", textAnswer: textAnswers[q.id] ?? "" },
      );
      await submitAssessment(assessment.id, answers);
      await onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit quiz.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <ol className="list-decimal space-y-4 pl-5 text-sm">
        {questions.map((q) => (
          <li key={q.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="font-medium">{q.prompt}</p>
            {q.type === "mcq" ? (
              <div className="mt-2 flex flex-col gap-1">
                {q.mcq_options?.map((opt, i) => (
                  <label key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={q.id}
                      required
                      checked={mcqAnswers[q.id] === i}
                      onChange={() => setMcqAnswers({ ...mcqAnswers, [q.id]: i })}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                required
                placeholder="Your answer"
                value={textAnswers[q.id] ?? ""}
                onChange={(e) => setTextAnswers({ ...textAnswers, [q.id]: e.target.value })}
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            )}
          </li>
        ))}
      </ol>
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit quiz"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
