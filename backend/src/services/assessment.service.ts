import {
  insertAnswer,
  insertSubmission,
  listQuestionsForAssessment,
  type QuestionRow,
} from "../db/assessments.repo";
import { AppError } from "../errors/AppError";
import type { SubmitAssessmentInput } from "../schemas/assessment.schema";

export async function submitAssessment(
  assessmentId: string,
  studentId: string,
  input: SubmitAssessmentInput,
) {
  const questions = await listQuestionsForAssessment(assessmentId);
  const questionsById = new Map<string, QuestionRow>(questions.map((q) => [q.id, q]));

  for (const answer of input.answers) {
    const question = questionsById.get(answer.questionId);
    if (!question) {
      throw AppError.badRequest(`Unknown question id: ${answer.questionId}`);
    }
    if (question.type !== answer.type) {
      throw AppError.badRequest(`Answer type does not match question ${answer.questionId}`);
    }
  }

  const submission = await insertSubmission(assessmentId, studentId);

  for (const answer of input.answers) {
    const question = questionsById.get(answer.questionId)!;
    if (answer.type === "mcq") {
      const score = answer.selectedIndex === question.mcq_correct_index ? 100 : 0;
      await insertAnswer({
        submissionId: submission.id,
        questionId: question.id,
        mcqSelectedIndex: answer.selectedIndex,
        score,
      });
    } else {
      // Short-answer scoring is filled in by the AI evaluation engine (Stage 5+); left
      // null here to represent "not yet graded" rather than an arbitrary default.
      await insertAnswer({
        submissionId: submission.id,
        questionId: question.id,
        textAnswer: answer.textAnswer,
      });
    }
  }

  return submission;
}
