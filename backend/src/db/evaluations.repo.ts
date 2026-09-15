import { pool } from "./pool";

export interface EvaluationRow {
  id: string;
  answer_id: string;
  model: string;
  overall_confidence: string;
  needs_faculty_review: boolean;
  failed: boolean;
  conflict_occurred: boolean;
  feedback: unknown;
  created_at: Date;
}

export interface EvaluationRunRow {
  id: string;
  evaluation_id: string;
  conflict_occurred: boolean;
  created_at: Date;
}

export interface AgentResultRow {
  id: string;
  run_id: string;
  agent_name: string;
  status: "ok" | "error";
  confidence: string | null;
  summary: string;
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
  conflictOccurred?: boolean;
  feedback?: unknown;
}): Promise<EvaluationRow> {
  const result = await pool.query<EvaluationRow>(
    `INSERT INTO evaluations
       (answer_id, model, overall_confidence, needs_faculty_review, failed, conflict_occurred, feedback)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.answerId,
      input.model,
      input.overallConfidence,
      input.needsFacultyReview,
      input.failed,
      input.conflictOccurred ?? false,
      input.feedback ? JSON.stringify(input.feedback) : null,
    ],
  );
  return result.rows[0];
}

export async function insertEvaluationRun(input: {
  evaluationId: string;
  conflictOccurred: boolean;
}): Promise<EvaluationRunRow> {
  const result = await pool.query<EvaluationRunRow>(
    `INSERT INTO evaluation_runs (evaluation_id, conflict_occurred) VALUES ($1, $2) RETURNING *`,
    [input.evaluationId, input.conflictOccurred],
  );
  return result.rows[0];
}

export async function insertAgentResults(
  runId: string,
  results: { agentName: string; status: "ok" | "error"; confidence: number | null; summary: string }[],
): Promise<AgentResultRow[]> {
  const rows: AgentResultRow[] = [];
  for (const r of results) {
    const result = await pool.query<AgentResultRow>(
      `INSERT INTO agent_results (run_id, agent_name, status, confidence, summary)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [runId, r.agentName, r.status, r.confidence, r.summary],
    );
    rows.push(result.rows[0]);
  }
  return rows;
}

export async function listAgentResultsForEvaluations(evaluationIds: string[]): Promise<
  (AgentResultRow & { evaluation_id: string })[]
> {
  if (evaluationIds.length === 0) return [];
  const result = await pool.query<AgentResultRow & { evaluation_id: string }>(
    `SELECT ar.*, er.evaluation_id
     FROM agent_results ar
     JOIN evaluation_runs er ON er.id = ar.run_id
     WHERE er.evaluation_id = ANY($1)
     ORDER BY ar.created_at ASC`,
    [evaluationIds],
  );
  return result.rows;
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
