import { z } from "zod";

export const reviewAnswerSchema = z.object({
  finalScore: z.number().int().min(0).max(100).optional(),
  criterionOverrides: z
    .array(
      z.object({
        criterionId: z.string(),
        status: z.enum(["covered", "partial", "missing"]),
      }),
    )
    .optional(),
  finalFeedback: z.string().max(2000).optional(),
  comment: z.string().max(1000).optional(),
});
export type ReviewAnswerInput = z.infer<typeof reviewAnswerSchema>;
