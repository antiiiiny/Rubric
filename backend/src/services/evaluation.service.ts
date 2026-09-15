import { updateAnswerScore } from "../db/assessments.repo";
import {
  insertAgentResults,
  insertCriterionResults,
  insertEvaluation,
  insertEvaluationRun,
} from "../db/evaluations.repo";
import { evaluateAnswer } from "./aiService.client";
import { logger } from "../utils/logger";
import type { RubricCriterionRow } from "../db/assessments.repo";

const STATUS_SCORE: Record<"covered" | "partial" | "missing", number> = {
  covered: 100,
  partial: 50,
  missing: 0,
};

// Deterministic score aggregation from AI-assessed criterion status and
// faculty-defined weights (never an LLM-asserted total) — per CLAUDE.md's
// non-negotiable AI/deterministic split.
export function computeWeightedScore(
  criteria: RubricCriterionRow[],
  statusByCriterion: Map<string, "covered" | "partial" | "missing">,
): number {
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0) || 1;
  const weightedSum = criteria.reduce((sum, c) => {
    const status = statusByCriterion.get(c.id) ?? "missing";
    return sum + c.weight * STATUS_SCORE[status];
  }, 0);
  return Math.round(weightedSum / totalWeight);
}

export async function evaluateShortAnswer(input: {
  answerId: string;
  questionPrompt: string;
  expectedAnswer: string;
  studentAnswer: string;
  criteria: RubricCriterionRow[];
}): Promise<void> {
  try {
    const result = await evaluateAnswer({
      questionPrompt: input.questionPrompt,
      expectedAnswer: input.expectedAnswer,
      studentAnswer: input.studentAnswer,
      criteria: input.criteria.map((c) => ({ id: c.id, name: c.name, weight: c.weight })),
    });

    const statusByCriterion = new Map(result.criteria.map((c) => [c.criterion_id, c.status]));
    const score = computeWeightedScore(input.criteria, statusByCriterion);

    const evaluation = await insertEvaluation({
      answerId: input.answerId,
      model: "langgraph-multi-agent",
      overallConfidence: result.overall_confidence,
      needsFacultyReview: result.needs_faculty_review,
      failed: false,
      conflictOccurred: result.conflict_occurred,
      feedback: result.feedback ?? null,
    });

    await insertCriterionResults(
      evaluation.id,
      result.criteria.map((c) => ({
        criterionId: c.criterion_id,
        status: c.status,
        evidence: c.evidence ?? null,
        confidence: c.confidence,
        reasoning: c.reasoning,
        embeddingSimilarity: c.embedding_similarity,
      })),
    );

    const agentTrace = result.agent_trace ?? [];
    if (agentTrace.length > 0) {
      const run = await insertEvaluationRun({
        evaluationId: evaluation.id,
        conflictOccurred: result.conflict_occurred,
      });
      await insertAgentResults(
        run.id,
        agentTrace.map((a) => ({
          agentName: a.agent_name,
          status: a.status,
          confidence: a.confidence ?? null,
          summary: a.summary,
        })),
      );
    }

    await updateAnswerScore(input.answerId, score);
  } catch (err) {
    // Best-effort: a submission must never fail because the AI service is
    // down or returned unusable output. Leave the answer ungraded and flag
    // it for faculty review rather than silently trusting bad output or
    // asserting a score of 0.
    logger.error({ err, answerId: input.answerId }, "AI evaluation failed for short-answer submission");
    await insertEvaluation({
      answerId: input.answerId,
      model: "langgraph-multi-agent",
      overallConfidence: 0,
      needsFacultyReview: true,
      failed: true,
    });
  }
}
