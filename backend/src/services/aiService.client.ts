import { env } from "../config/env";
import { evaluationResultSchema, type EvaluationResult } from "../schemas/evaluation.schema";

export interface EvaluateAnswerRequest {
  questionPrompt: string;
  expectedAnswer: string;
  studentAnswer: string;
  criteria: { id: string; name: string; weight: number }[];
}

export async function evaluateAnswer(input: EvaluateAnswerRequest): Promise<EvaluationResult> {
  const response = await fetch(`${env.aiServiceUrl}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question_prompt: input.questionPrompt,
      expected_answer: input.expectedAnswer,
      student_answer: input.studentAnswer,
      criteria: input.criteria,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ai-service evaluation failed (${response.status}): ${detail}`);
  }

  const body: unknown = await response.json();
  return evaluationResultSchema.parse(body);
}
