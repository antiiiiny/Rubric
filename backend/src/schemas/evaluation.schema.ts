import { z } from "zod";

// Mirrors ai-service's Pydantic EvaluationResult — validated again on the Node
// side since a cross-service HTTP boundary is still an untrusted-input boundary.
export const criterionEvaluationSchema = z.object({
  criterion_id: z.string(),
  status: z.enum(["covered", "partial", "missing"]),
  evidence: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(500),
  embedding_similarity: z.number().min(0).max(1),
});

export const evaluationResultSchema = z.object({
  criteria: z.array(criterionEvaluationSchema).min(1),
  overall_confidence: z.number().min(0).max(1),
  needs_faculty_review: z.boolean(),
});
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
