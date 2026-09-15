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

export type AssessmentStatus = "draft" | "published";
export type AssessmentType = "quiz" | "assignment";
export type QuestionType = "mcq" | "short_answer" | "document";

export interface Assessment {
  id: string;
  course_id: string;
  title: string;
  type: AssessmentType;
  status: AssessmentStatus;
  created_at: string;
  updated_at: string;
}

export interface RubricCriterion {
  id: string;
  question_id: string;
  name: string;
  weight: number;
  order_index: number;
}

export interface AssignmentSection {
  id: string;
  question_id: string;
  name: string;
  required: boolean;
  order_index: number;
}

export interface Question {
  id: string;
  assessment_id: string;
  type: QuestionType;
  prompt: string;
  order_index: number;
  mcq_options: string[] | null;
  mcq_correct_index?: number | null;
  expected_answer?: string | null;
  criteria: RubricCriterion[];
  sections: AssignmentSection[];
}

export interface Submission {
  id: string;
  assessment_id: string;
  student_id: string;
  submitted_at: string;
}

export type CriterionStatus = "covered" | "partial" | "missing";

export interface CriterionResult {
  criterionId: string;
  name: string;
  weight: number;
  status: CriterionStatus;
  evidence: string | null;
  confidence: number;
  reasoning: string;
  embeddingSimilarity: number;
}

export interface AgentTraceEntry {
  agentName: string;
  status: "ok" | "error";
  confidence: number | null;
  summary: string;
}

export interface EvaluationFeedback {
  strengths: string[];
  gaps: string[];
  inaccuracies: string[];
  suggestions: string[];
  summary: string;
}

export interface AnswerEvaluation {
  overallConfidence: number;
  needsFacultyReview: boolean;
  failed: boolean;
  conflictOccurred: boolean;
  agentTrace: AgentTraceEntry[];
  feedback: EvaluationFeedback | null;
  criteria: CriterionResult[];
}

export interface SectionCheckResult {
  name: string;
  required: boolean;
  found: boolean;
}

export interface FacultyReview {
  status: "approved" | "overridden";
  finalScore: number | null;
  finalFeedback: string | null;
  comment: string | null;
  criterionOverrides: { criterionId: string; status: CriterionStatus }[];
  reviewerId: string;
  updatedAt: string;
}

export interface Answer {
  id: string;
  submission_id: string;
  question_id: string;
  mcq_selected_index: number | null;
  text_answer: string | null;
  score: string | null;
  original_filename: string | null;
  section_check: SectionCheckResult[] | null;
  evaluation?: AnswerEvaluation | null;
  review?: FacultyReview | null;
  effectiveScore?: number | null;
}

export function createAssessment(
  courseId: string,
  title: string,
  type: AssessmentType = "quiz",
): Promise<{ assessment: Assessment }> {
  return apiFetch(`/courses/${courseId}/assessments`, {
    method: "POST",
    body: JSON.stringify({ title, type }),
  });
}

export function listAssessments(courseId: string): Promise<{ assessments: Assessment[] }> {
  return apiFetch(`/courses/${courseId}/assessments`);
}

export function getAssessment(
  assessmentId: string,
): Promise<{ assessment: Assessment; questions: Question[] }> {
  return apiFetch(`/assessments/${assessmentId}`);
}

export type CreateQuestionInput =
  | { type: "mcq"; prompt: string; options: string[]; correctIndex: number }
  | {
      type: "short_answer";
      prompt: string;
      expectedAnswer: string;
      criteria: { name: string; weight: number }[];
    }
  | {
      type: "document";
      prompt: string;
      expectedAnswer: string;
      criteria: { name: string; weight: number }[];
      sections: { name: string; required: boolean }[];
    };

export function addQuestion(
  assessmentId: string,
  input: CreateQuestionInput,
): Promise<{ question: Question }> {
  return apiFetch(`/assessments/${assessmentId}/questions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function publishAssessment(assessmentId: string): Promise<{ status: string }> {
  return apiFetch(`/assessments/${assessmentId}/publish`, { method: "POST" });
}

export type SubmitAnswerInput =
  | { questionId: string; type: "mcq"; selectedIndex: number }
  | { questionId: string; type: "short_answer"; textAnswer: string };

export function submitAssessment(
  assessmentId: string,
  answers: SubmitAnswerInput[],
): Promise<{ submission: Submission; answers: Answer[] }> {
  return apiFetch(`/assessments/${assessmentId}/submissions`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
}

export async function submitDocumentAssignment(
  assessmentId: string,
  questionId: string,
  file: File,
): Promise<{ submission: Submission; answers: Answer[] }> {
  const formData = new FormData();
  formData.append("questionId", questionId);
  formData.append("file", file);

  // Raw fetch (not apiFetch) — multipart requests must let the browser set
  // the Content-Type header itself (with the multipart boundary).
  const res = await fetch(`${API_URL}/assessments/${assessmentId}/submissions/document`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  const body = await res.json();
  if (!res.ok) {
    throw new ApiError(res.status, body as ApiErrorBody);
  }
  return body;
}

export function getMySubmission(
  assessmentId: string,
): Promise<{ submission: Submission | null; answers?: Answer[]; totalScore?: number | null }> {
  return apiFetch(`/assessments/${assessmentId}/submissions/me`);
}

export interface SubmissionWithScore extends Submission {
  totalScore: number | null;
  answers: Answer[];
  student: { id: string; email: string; fullName: string } | null;
}

export function listSubmissions(assessmentId: string): Promise<{ submissions: SubmissionWithScore[] }> {
  return apiFetch(`/assessments/${assessmentId}/submissions`);
}

export interface ReviewAnswerInput {
  finalScore?: number;
  criterionOverrides?: { criterionId: string; status: CriterionStatus }[];
  finalFeedback?: string;
  comment?: string;
}

export function reviewAnswer(
  assessmentId: string,
  answerId: string,
  input: ReviewAnswerInput,
): Promise<{ review: FacultyReview }> {
  return apiFetch(`/assessments/${assessmentId}/answers/${answerId}/review`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
