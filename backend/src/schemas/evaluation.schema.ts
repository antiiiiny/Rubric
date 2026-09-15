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

export const agentTraceEntrySchema = z.object({
  agent_name: z.string(),
  status: z.enum(["ok", "error"]),
  confidence: z.number().min(0).max(1).nullable().optional(),
  summary: z.string().max(300),
});

export const feedbackSchema = z.object({
  strengths: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  inaccuracies: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
  summary: z.string().default(""),
});

export const evaluationResultSchema = z.object({
  criteria: z.array(criterionEvaluationSchema).min(1),
  overall_confidence: z.number().min(0).max(1),
  needs_faculty_review: z.boolean(),
  conflict_occurred: z.boolean().default(false),
  agent_trace: z.array(agentTraceEntrySchema).default([]),
  feedback: feedbackSchema.nullable().optional(),
});
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
