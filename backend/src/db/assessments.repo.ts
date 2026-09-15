import { pool } from "./pool";

export type AssessmentStatus = "draft" | "published";
export type QuestionType = "mcq" | "short_answer";

export interface AssessmentRow {
  id: string;
  course_id: string;
  title: string;
  type: "quiz";
  status: AssessmentStatus;
  created_at: Date;
  updated_at: Date;
}

export interface QuestionRow {
  id: string;
  assessment_id: string;
  type: QuestionType;
  prompt: string;
  order_index: number;
  mcq_options: string[] | null;
  mcq_correct_index: number | null;
  expected_answer: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface RubricCriterionRow {
  id: string;
  question_id: string;
  name: string;
  weight: number;
  order_index: number;
}

export interface SubmissionRow {
  id: string;
  assessment_id: string;
  student_id: string;
  submitted_at: Date;
}

export interface AnswerRow {
  id: string;
  submission_id: string;
  question_id: string;
  mcq_selected_index: number | null;
  text_answer: string | null;
  score: string | null;
  created_at: Date;
}

export async function insertAssessment(courseId: string, title: string): Promise<AssessmentRow> {
  const result = await pool.query<AssessmentRow>(
    `INSERT INTO assessments (course_id, title) VALUES ($1, $2) RETURNING *`,
    [courseId, title],
  );
  return result.rows[0];
}

export async function findAssessmentById(id: string): Promise<AssessmentRow | null> {
  const result = await pool.query<AssessmentRow>(`SELECT * FROM assessments WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function listAssessmentsForCourse(
  courseId: string,
  opts: { publishedOnly: boolean },
): Promise<AssessmentRow[]> {
  const result = await pool.query<AssessmentRow>(
    opts.publishedOnly
      ? `SELECT * FROM assessments WHERE course_id = $1 AND status = 'published' ORDER BY created_at DESC`
      : `SELECT * FROM assessments WHERE course_id = $1 ORDER BY created_at DESC`,
    [courseId],
  );
  return result.rows;
}

export async function publishAssessment(id: string): Promise<void> {
  await pool.query(`UPDATE assessments SET status = 'published', updated_at = now() WHERE id = $1`, [id]);
}

export async function insertQuestion(input: {
  assessmentId: string;
  type: QuestionType;
  prompt: string;
  orderIndex: number;
  mcqOptions?: string[];
  mcqCorrectIndex?: number;
  expectedAnswer?: string;
}): Promise<QuestionRow> {
  const result = await pool.query<QuestionRow>(
    `INSERT INTO questions (assessment_id, type, prompt, order_index, mcq_options, mcq_correct_index, expected_answer)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.assessmentId,
      input.type,
      input.prompt,
      input.orderIndex,
      input.mcqOptions ? JSON.stringify(input.mcqOptions) : null,
      input.mcqCorrectIndex ?? null,
      input.expectedAnswer ?? null,
    ],
  );
  return result.rows[0];
}

export async function insertRubricCriteria(
  questionId: string,
  criteria: { name: string; weight: number }[],
): Promise<RubricCriterionRow[]> {
  const rows: RubricCriterionRow[] = [];
  for (let i = 0; i < criteria.length; i++) {
    const result = await pool.query<RubricCriterionRow>(
      `INSERT INTO rubric_criteria (question_id, name, weight, order_index) VALUES ($1, $2, $3, $4) RETURNING *`,
      [questionId, criteria[i].name, criteria[i].weight, i],
    );
    rows.push(result.rows[0]);
  }
  return rows;
}

export async function listQuestionsForAssessment(assessmentId: string): Promise<QuestionRow[]> {
  const result = await pool.query<QuestionRow>(
    `SELECT * FROM questions WHERE assessment_id = $1 ORDER BY order_index ASC`,
    [assessmentId],
  );
  return result.rows;
}

export async function listCriteriaForQuestions(questionIds: string[]): Promise<RubricCriterionRow[]> {
  if (questionIds.length === 0) return [];
  const result = await pool.query<RubricCriterionRow>(
    `SELECT * FROM rubric_criteria WHERE question_id = ANY($1) ORDER BY order_index ASC`,
    [questionIds],
  );
  return result.rows;
}

export async function findSubmission(
  assessmentId: string,
  studentId: string,
): Promise<SubmissionRow | null> {
  const result = await pool.query<SubmissionRow>(
    `SELECT * FROM submissions WHERE assessment_id = $1 AND student_id = $2`,
    [assessmentId, studentId],
  );
  return result.rows[0] ?? null;
}

export async function insertSubmission(assessmentId: string, studentId: string): Promise<SubmissionRow> {
  const result = await pool.query<SubmissionRow>(
    `INSERT INTO submissions (assessment_id, student_id) VALUES ($1, $2) RETURNING *`,
    [assessmentId, studentId],
  );
  return result.rows[0];
}

export async function insertAnswer(input: {
  submissionId: string;
  questionId: string;
  mcqSelectedIndex?: number;
  textAnswer?: string;
  score?: number;
}): Promise<AnswerRow> {
  const result = await pool.query<AnswerRow>(
    `INSERT INTO answers (submission_id, question_id, mcq_selected_index, text_answer, score)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.submissionId,
      input.questionId,
      input.mcqSelectedIndex ?? null,
      input.textAnswer ?? null,
      input.score ?? null,
    ],
  );
  return result.rows[0];
}

export async function listAnswersForSubmission(submissionId: string): Promise<AnswerRow[]> {
  const result = await pool.query<AnswerRow>(`SELECT * FROM answers WHERE submission_id = $1`, [
    submissionId,
  ]);
  return result.rows;
}

export async function listSubmissionsForAssessment(assessmentId: string): Promise<SubmissionRow[]> {
  const result = await pool.query<SubmissionRow>(
    `SELECT * FROM submissions WHERE assessment_id = $1 ORDER BY submitted_at ASC`,
    [assessmentId],
  );
  return result.rows;
}
