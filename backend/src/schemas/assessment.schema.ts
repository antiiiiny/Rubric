import { z } from "zod";

export const createAssessmentSchema = z.object({
  title: z.string().min(1).max(200),
});
export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;

const rubricCriterionSchema = z.object({
  name: z.string().min(1).max(200),
  weight: z.number().int().min(1).max(100),
});

export const createQuestionSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("mcq"),
      prompt: z.string().min(1),
      options: z.array(z.string().min(1)).min(2).max(8),
      correctIndex: z.number().int().min(0),
    }),
    z.object({
      type: z.literal("short_answer"),
      prompt: z.string().min(1),
      expectedAnswer: z.string().min(1),
      criteria: z.array(rubricCriterionSchema).min(1),
    }),
  ])
  .refine(
    (data) => data.type !== "mcq" || data.correctIndex < data.options.length,
    { message: "correctIndex must be a valid index into options" },
  )
  .refine(
    (data) => data.type !== "short_answer" || data.criteria.reduce((sum, c) => sum + c.weight, 0) === 100,
    { message: "rubric criteria weights must sum to 100" },
  );
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

const answerInputSchema = z.discriminatedUnion("type", [
  z.object({ questionId: z.string(), type: z.literal("mcq"), selectedIndex: z.number().int().min(0) }),
  z.object({ questionId: z.string(), type: z.literal("short_answer"), textAnswer: z.string().min(1).max(5000) }),
]);

export const submitAssessmentSchema = z.object({
  answers: z.array(answerInputSchema).min(1),
});
export type SubmitAssessmentInput = z.infer<typeof submitAssessmentSchema>;
