import {
  insertAnswer,
  insertSubmission,
  listCriteriaForQuestions,
  listQuestionsForAssessment,
  type QuestionRow,
} from "../db/assessments.repo";
import { AppError } from "../errors/AppError";
import type { SubmitAssessmentInput } from "../schemas/assessment.schema";
import { evaluateShortAnswer } from "./evaluation.service";

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
  const shortAnswerQuestionIds = input.answers
    .filter((a) => a.type === "short_answer")
    .map((a) => a.questionId);
  const criteriaByQuestion = new Map<string, Awaited<ReturnType<typeof listCriteriaForQuestions>>>();
  if (shortAnswerQuestionIds.length > 0) {
    const allCriteria = await listCriteriaForQuestions(shortAnswerQuestionIds);
    for (const c of allCriteria) {
      const list = criteriaByQuestion.get(c.question_id) ?? [];
      list.push(c);
      criteriaByQuestion.set(c.question_id, list);
    }
  }

  const evaluationJobs: Promise<void>[] = [];

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
      // Short-answer score is filled in below by the AI evaluation engine; left
      // null here to represent "not yet graded" rather than an arbitrary default.
      const inserted = await insertAnswer({
        submissionId: submission.id,
        questionId: question.id,
        textAnswer: answer.textAnswer,
      });

      const criteria = criteriaByQuestion.get(question.id) ?? [];
      evaluationJobs.push(
        evaluateShortAnswer({
          answerId: inserted.id,
          questionPrompt: question.prompt,
          expectedAnswer: question.expected_answer ?? "",
          studentAnswer: answer.textAnswer,
          criteria,
        }),
      );
    }
  }

  // Evaluate short answers in parallel; each job is already best-effort and
  // never throws, so a slow/unreachable AI service degrades gracefully
  // (answers stay ungraded) instead of failing the whole submission.
  await Promise.all(evaluationJobs);

  return submission;
}
