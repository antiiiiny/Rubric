import { pool } from "./pool";

export interface EvaluationRow {
  id: string;
  answer_id: string;
  model: string;
  overall_confidence: string;
  needs_faculty_review: boolean;
  failed: boolean;
  created_at: Date;
}

export type CriterionStatus = "covered" | "partial" | "missing";

export interface CriterionResultRow {
  id: string;
  evaluation_id: string;
  criterion_id: string;
  status: CriterionStatus;
  evidence: string | null;
  confidence: string;
  reasoning: string;
  embedding_similarity: string;
}

export async function insertEvaluation(input: {
  answerId: string;
  model: string;
  overallConfidence: number;
  needsFacultyReview: boolean;
  failed: boolean;
}): Promise<EvaluationRow> {
  const result = await pool.query<EvaluationRow>(
    `INSERT INTO evaluations (answer_id, model, overall_confidence, needs_faculty_review, failed)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.answerId, input.model, input.overallConfidence, input.needsFacultyReview, input.failed],
  );
  return result.rows[0];
}

export async function insertCriterionResults(
  evaluationId: string,
  results: {
    criterionId: string;
    status: CriterionStatus;
    evidence: string | null;
    confidence: number;
    reasoning: string;
    embeddingSimilarity: number;
  }[],
): Promise<CriterionResultRow[]> {
  const rows: CriterionResultRow[] = [];
  for (const r of results) {
    const result = await pool.query<CriterionResultRow>(
      `INSERT INTO criterion_results
         (evaluation_id, criterion_id, status, evidence, confidence, reasoning, embedding_similarity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [evaluationId, r.criterionId, r.status, r.evidence, r.confidence, r.reasoning, r.embeddingSimilarity],
    );
    rows.push(result.rows[0]);
  }
  return rows;
}

export async function findEvaluationByAnswerId(answerId: string): Promise<EvaluationRow | null> {
  const result = await pool.query<EvaluationRow>(`SELECT * FROM evaluations WHERE answer_id = $1`, [
    answerId,
  ]);
  return result.rows[0] ?? null;
}

export async function listEvaluationsForAnswers(answerIds: string[]): Promise<EvaluationRow[]> {
  if (answerIds.length === 0) return [];
  const result = await pool.query<EvaluationRow>(`SELECT * FROM evaluations WHERE answer_id = ANY($1)`, [
    answerIds,
  ]);
  return result.rows;
}

export async function listCriterionResultsForEvaluations(
  evaluationIds: string[],
): Promise<CriterionResultRow[]> {
  if (evaluationIds.length === 0) return [];
  const result = await pool.query<CriterionResultRow>(
    `SELECT * FROM criterion_results WHERE evaluation_id = ANY($1)`,
    [evaluationIds],
  );
  return result.rows;
}
