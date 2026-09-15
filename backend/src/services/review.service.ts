import { findAnswerWithinAssessment, findQuestionById, listCriteriaForQuestions } from "../db/assessments.repo";
import { findEvaluationByAnswerId, listCriterionResultsForEvaluations } from "../db/evaluations.repo";
import { upsertReview, type CriterionOverride, type FacultyReviewRow } from "../db/reviews.repo";
import { computeWeightedScore } from "./evaluation.service";
import { AppError } from "../errors/AppError";
import type { ReviewAnswerInput } from "../schemas/review.schema";
import type { CriterionStatus } from "../db/evaluations.repo";

export async function reviewAnswer(
  assessmentId: string,
  answerId: string,
  reviewerId: string,
  input: ReviewAnswerInput,
): Promise<FacultyReviewRow> {
  const answer = await findAnswerWithinAssessment(assessmentId, answerId);
  if (!answer) {
    throw AppError.notFound("Answer not found");
  }

  const question = await findQuestionById(answer.question_id);
  if (!question || question.type === "mcq") {
    throw AppError.badRequest("Only AI-evaluated answers can be reviewed");
  }

  const criteria = await listCriteriaForQuestions([question.id]);
  const evaluation = await findEvaluationByAnswerId(answerId);

  let finalScore: number | null;
  let status: "approved" | "overridden";
  let criterionOverrides: CriterionOverride[] | null = null;

  if (input.finalScore !== undefined) {
    finalScore = input.finalScore;
    status = "overridden";
    if (input.criterionOverrides && input.criterionOverrides.length > 0) {
      criterionOverrides = input.criterionOverrides;
    }
  } else if (input.criterionOverrides && input.criterionOverrides.length > 0) {
    const originalResults = evaluation
      ? await listCriterionResultsForEvaluations([evaluation.id])
      : [];
    const statusByCriterion = new Map<string, CriterionStatus>(
      originalResults.map((r) => [r.criterion_id, r.status]),
    );
    for (const override of input.criterionOverrides) {
      statusByCriterion.set(override.criterionId, override.status);
    }
    finalScore = computeWeightedScore(criteria, statusByCriterion);
    status = "overridden";
    criterionOverrides = input.criterionOverrides;
  } else {
    finalScore = answer.score === null ? null : Number(answer.score);
    status = "approved";
  }

  return upsertReview({
    answerId,
    reviewerId,
    status,
    finalScore,
    finalFeedback: input.finalFeedback ?? null,
    comment: input.comment ?? null,
    criterionOverrides,
  });
}
