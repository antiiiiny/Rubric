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
  reviewAnswer,
  submitAssessment,
  submitDocumentAssignment,
  type Answer,
  type Assessment,
  type AuthUser,
  type CriterionStatus,
  type Question,
  type SubmissionWithScore,
  type SubmitAnswerInput,
} from "../../../lib/api";

type NewQuestionType = "mcq" | "short_answer" | "document";

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

function ReviewBadge({ review }: { review: Answer["review"] }) {
  if (!review) return null;
  return (
    <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
      <p className="font-medium">
        Faculty reviewed ({review.status === "overridden" ? "score overridden" : "approved"})
        {review.finalScore !== null ? ` — final score: ${review.finalScore}%` : ""}
      </p>
      {review.finalFeedback && <p className="mt-1">{review.finalFeedback}</p>}
      {review.comment && <p className="mt-1 italic">&ldquo;{review.comment}&rdquo;</p>}
    </div>
  );
}

function FacultyReviewForm({
  assessmentId,
  answer,
  onReviewed,
}: {
  assessmentId: string;
  answer: Answer;
  onReviewed: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [finalScore, setFinalScore] = useState(answer.review?.finalScore ?? answer.effectiveScore ?? 0);
  const [finalFeedback, setFinalFeedback] = useState(answer.review?.finalFeedback ?? "");
  const [comment, setComment] = useState(answer.review?.comment ?? "");
  const [criterionStatuses, setCriterionStatuses] = useState<Record<string, CriterionStatus>>(() => {
    const initial: Record<string, CriterionStatus> = {};
    for (const c of answer.evaluation?.criteria ?? []) initial[c.criterionId] = c.status;
    for (const o of answer.review?.criterionOverrides ?? []) initial[o.criterionId] = o.status;
    return initial;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onApprove() {
    setError(null);
    setSubmitting(true);
    try {
      await reviewAnswer(assessmentId, answer.id, { comment: comment || undefined });
      await onReviewed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not approve.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onOverrideScore(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await reviewAnswer(assessmentId, answer.id, {
        finalScore,
        finalFeedback: finalFeedback || undefined,
        comment: comment || undefined,
      });
      await onReviewed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not override score.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onOverrideCriteria() {
    setError(null);
    setSubmitting(true);
    try {
      const criterionOverrides = Object.entries(criterionStatuses).map(([criterionId, status]) => ({
        criterionId,
        status,
      }));
      await reviewAnswer(assessmentId, answer.id, {
        criterionOverrides,
        finalFeedback: finalFeedback || undefined,
        comment: comment || undefined,
      });
      await onReviewed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not override criteria.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!answer.evaluation || answer.evaluation.failed) return null;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="mt-2 text-xs text-slate-600 underline"
      >
        {answer.review ? "Edit review" : "Review this answer"}
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-slate-200 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onApprove}
          disabled={submitting}
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-white disabled:opacity-50"
        >
          Approve AI result
        </button>
        <span className="text-slate-500">or override:</span>
      </div>

      <form onSubmit={onOverrideScore} className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={`final-score-${answer.id}`} className="flex items-center gap-1">
          Final score:
          <input
            id={`final-score-${answer.id}`}
            type="number"
            min={0}
            max={100}
            value={finalScore}
            onChange={(e) => setFinalScore(Number(e.target.value))}
            className="w-16 rounded-md border border-slate-300 px-2 py-1"
          />
          %
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-white disabled:opacity-50"
        >
          Set score
        </button>
      </form>

      {answer.evaluation.criteria.length > 0 && (
        <div className="mt-2">
          <p className="font-medium text-slate-700">Or override per-criterion status:</p>
          {answer.evaluation.criteria.map((c) => (
            <div key={c.criterionId} className="mt-1 flex items-center gap-2">
              <label htmlFor={`criterion-${answer.id}-${c.criterionId}`} className="w-40 truncate">
                {c.name}
              </label>
              <select
                id={`criterion-${answer.id}-${c.criterionId}`}
                value={criterionStatuses[c.criterionId] ?? c.status}
                onChange={(e) =>
                  setCriterionStatuses({
                    ...criterionStatuses,
                    [c.criterionId]: e.target.value as CriterionStatus,
                  })
                }
                className="rounded-md border border-slate-300 px-2 py-1"
              >
                <option value="covered">covered</option>
                <option value="partial">partial</option>
                <option value="missing">missing</option>
              </select>
            </div>
          ))}
          <button
            type="button"
            onClick={onOverrideCriteria}
            disabled={submitting}
            className="mt-2 rounded-md bg-slate-900 px-3 py-1.5 text-white disabled:opacity-50"
          >
            Apply criteria overrides
          </button>
        </div>
      )}

      <label htmlFor={`final-feedback-${answer.id}`} className="sr-only">
        Feedback for student
      </label>
      <textarea
        id={`final-feedback-${answer.id}`}
        placeholder="Feedback for student (optional)"
        value={finalFeedback}
        onChange={(e) => setFinalFeedback(e.target.value)}
        className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1"
      />
      <label htmlFor={`review-comment-${answer.id}`} className="sr-only">
        Internal comment
      </label>
      <textarea
        id={`review-comment-${answer.id}`}
        placeholder="Internal comment (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1"
      />
      {error && <p className="mt-1 text-red-600">{error}</p>}
    </div>
  );
}

function SectionCheckList({ sectionCheck }: { sectionCheck: Answer["section_check"] }) {
  if (!sectionCheck || sectionCheck.length === 0) return null;
  return (
    <div className="mt-2 text-xs">
      <p className="font-medium text-slate-700">Required sections</p>
      <ul className="mt-1 space-y-0.5">
        {sectionCheck.map((s, i) => (
          <li key={i} className={s.found ? "text-emerald-700" : s.required ? "text-red-700" : "text-slate-500"}>
            {s.name}: {s.found ? "found" : "missing"}
            {!s.required && !s.found ? " (optional)" : ""}
          </li>
        ))}
      </ul>
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
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this assessment."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (loading) {
    return <main className="mx-auto max-w-2xl px-6 py-10 text-sm text-slate-500">Loading…</main>;
  }

  if (error || !assessment) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-sm text-red-600">{error ?? "Assessment not found."}</p>
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
  const isAssignment = assessment.type === "assignment";
  const [type, setType] = useState<NewQuestionType>(isAssignment ? "document" : "mcq");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [expectedAnswer, setExpectedAnswer] = useState("");
  const [criteria, setCriteria] = useState([{ name: "", weight: 0 }]);
  const [sections, setSections] = useState([{ name: "", required: true }]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  function resetForm() {
    setPrompt("");
    setOptions(["", ""]);
    setCorrectIndex(0);
    setExpectedAnswer("");
    setCriteria([{ name: "", weight: 0 }]);
    setSections([{ name: "", required: true }]);
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
      } else if (type === "short_answer") {
        await addQuestion(assessment.id, {
          type: "short_answer",
          prompt,
          expectedAnswer,
          criteria: criteria.filter((c) => c.name.trim() !== ""),
        });
      } else {
        await addQuestion(assessment.id, {
          type: "document",
          prompt,
          expectedAnswer,
          criteria: criteria.filter((c) => c.name.trim() !== ""),
          sections: sections.filter((s) => s.name.trim() !== ""),
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
      setFormError(err instanceof ApiError ? err.message : "Could not publish this assessment.");
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
                  {q.type === "document" && q.sections.length > 0 && (
                    <p className="mt-1">
                      Required sections:{" "}
                      {q.sections.map((s) => `${s.name}${s.required ? "" : " (optional)"}`).join(", ")}
                    </p>
                  )}
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
            {publishing ? "Publishing…" : `Publish ${isAssignment ? "assignment" : "quiz"}`}
          </button>
        )}
      </div>

      {assessment.status === "draft" && (
        <form onSubmit={onAddQuestion} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium">Add a question</p>
          <label htmlFor="new-question-type" className="sr-only">
            Question type
          </label>
          <select
            id="new-question-type"
            value={type}
            onChange={(e) => setType(e.target.value as NewQuestionType)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {isAssignment ? (
              <option value="document">Document upload</option>
            ) : (
              <>
                <option value="mcq">Multiple choice</option>
                <option value="short_answer">Short answer</option>
              </>
            )}
          </select>
          <label htmlFor="new-question-prompt" className="sr-only">
            Question prompt
          </label>
          <textarea
            id="new-question-prompt"
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
                    aria-label={`Mark option ${i + 1} as the correct answer`}
                    checked={correctIndex === i}
                    onChange={() => setCorrectIndex(i)}
                  />
                  <label htmlFor={`mcq-option-${i}`} className="sr-only">
                    Option {i + 1}
                  </label>
                  <input
                    id={`mcq-option-${i}`}
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
              <label htmlFor="new-question-expected-answer" className="sr-only">
                Expected answer
              </label>
              <textarea
                id="new-question-expected-answer"
                placeholder="Expected answer (reference for AI evaluation)"
                required
                value={expectedAnswer}
                onChange={(e) => setExpectedAnswer(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="text-xs text-slate-500">Rubric concepts (weights must sum to 100)</p>
              {criteria.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <label htmlFor={`criterion-name-${i}`} className="sr-only">
                    Concept {i + 1} name
                  </label>
                  <input
                    id={`criterion-name-${i}`}
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
                  <label htmlFor={`criterion-weight-${i}`} className="sr-only">
                    Concept {i + 1} weight percent
                  </label>
                  <input
                    id={`criterion-weight-${i}`}
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

              {type === "document" && (
                <>
                  <p className="mt-2 text-xs text-slate-500">Required document sections</p>
                  {sections.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <label htmlFor={`section-name-${i}`} className="sr-only">
                        Section {i + 1} name
                      </label>
                      <input
                        id={`section-name-${i}`}
                        type="text"
                        placeholder="Section name (e.g. Introduction)"
                        value={s.name}
                        onChange={(e) => {
                          const next = [...sections];
                          next[i] = { ...next[i], name: e.target.value };
                          setSections(next);
                        }}
                        className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                      <label className="flex items-center gap-1 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={s.required}
                          onChange={(e) => {
                            const next = [...sections];
                            next[i] = { ...next[i], required: e.target.checked };
                            setSections(next);
                          }}
                        />
                        Required
                      </label>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSections([...sections, { name: "", required: true }])}
                    className="self-start text-xs text-slate-600 underline"
                  >
                    Add section
                  </button>
                </>
              )}
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
                {s.answers.map((a) => (
                  <div key={a.id}>
                    {a.original_filename && (
                      <p className="mt-1 text-xs text-slate-500">File: {a.original_filename}</p>
                    )}
                    <SectionCheckList sectionCheck={a.section_check} />
                    {a.evaluation && <EvaluationBreakdown evaluation={a.evaluation} />}
                    <ReviewBadge review={a.review} />
                    <FacultyReviewForm assessmentId={assessment.id} answer={a} onReviewed={onChange} />
                  </div>
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
    return <p className="text-sm text-slate-500">This assessment has not been published yet.</p>;
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
                      {q.type === "document" ? `File: ${answer?.original_filename ?? "—"}` : `Your answer: ${answer?.text_answer}`}{" "}
                      — score:{" "}
                      {answer?.effectiveScore === null || answer?.effectiveScore === undefined
                        ? "pending AI evaluation"
                        : `${answer.effectiveScore}%`}
                    </p>
                    <SectionCheckList sectionCheck={answer?.section_check ?? null} />
                    <ReviewBadge review={answer?.review} />
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

  if (assessment.type === "assignment") {
    const documentQuestion = questions.find((q) => q.type === "document");
    if (!documentQuestion) {
      return <p className="text-sm text-slate-500">This assignment has no document question yet.</p>;
    }
    return <DocumentUploadForm assessment={assessment} question={documentQuestion} onSubmitted={onSubmitted} />;
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
              <>
                <label htmlFor={`answer-${q.id}`} className="sr-only">
                  Your answer to: {q.prompt}
                </label>
                <textarea
                  id={`answer-${q.id}`}
                  required
                  placeholder="Your answer"
                  value={textAnswers[q.id] ?? ""}
                  onChange={(e) => setTextAnswers({ ...textAnswers, [q.id]: e.target.value })}
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </>
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

function DocumentUploadForm({
  assessment,
  question,
  onSubmitted,
}: {
  assessment: Assessment;
  question: Question;
  onSubmitted: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setSubmitting(true);
    try {
      await submitDocumentAssignment(assessment.id, question.id, file);
      await onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit assignment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="font-medium">{question.prompt}</p>
        {question.sections.length > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            Required sections: {question.sections.map((s) => s.name).join(", ")}
          </p>
        )}
        <label htmlFor="assignment-file" className="sr-only">
          Assignment file (PDF or DOCX)
        </label>
        <input
          id="assignment-file"
          type="file"
          accept=".pdf,.docx"
          required
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-3 block text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={submitting || !file}
        className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {submitting ? "Uploading…" : "Submit assignment"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
