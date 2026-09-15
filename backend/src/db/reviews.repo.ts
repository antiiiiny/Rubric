import { pool } from "./pool";
import type { CriterionStatus } from "./evaluations.repo";

export interface CriterionOverride {
  criterionId: string;
  status: CriterionStatus;
}

export interface FacultyReviewRow {
  id: string;
  answer_id: string;
  reviewer_id: string;
  status: "approved" | "overridden";
  final_score: string | null;
  final_feedback: string | null;
  comment: string | null;
  criterion_overrides: CriterionOverride[] | null;
  created_at: Date;
  updated_at: Date;
}

export async function upsertReview(input: {
  answerId: string;
  reviewerId: string;
  status: "approved" | "overridden";
  finalScore: number | null;
  finalFeedback: string | null;
  comment: string | null;
  criterionOverrides: CriterionOverride[] | null;
}): Promise<FacultyReviewRow> {
  const result = await pool.query<FacultyReviewRow>(
    `INSERT INTO faculty_reviews
       (answer_id, reviewer_id, status, final_score, final_feedback, comment, criterion_overrides)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (answer_id) DO UPDATE SET
       reviewer_id = EXCLUDED.reviewer_id,
       status = EXCLUDED.status,
       final_score = EXCLUDED.final_score,
       final_feedback = EXCLUDED.final_feedback,
       comment = EXCLUDED.comment,
       criterion_overrides = EXCLUDED.criterion_overrides,
       updated_at = now()
     RETURNING *`,
    [
      input.answerId,
      input.reviewerId,
      input.status,
      input.finalScore,
      input.finalFeedback,
      input.comment,
      input.criterionOverrides ? JSON.stringify(input.criterionOverrides) : null,
    ],
  );
  return result.rows[0];
}

export async function findReviewByAnswerId(answerId: string): Promise<FacultyReviewRow | null> {
  const result = await pool.query<FacultyReviewRow>(
    `SELECT * FROM faculty_reviews WHERE answer_id = $1`,
    [answerId],
  );
  return result.rows[0] ?? null;
}

export async function listReviewsForAnswers(answerIds: string[]): Promise<FacultyReviewRow[]> {
  if (answerIds.length === 0) return [];
  const result = await pool.query<FacultyReviewRow>(
    `SELECT * FROM faculty_reviews WHERE answer_id = ANY($1)`,
    [answerIds],
  );
  return result.rows;
}
