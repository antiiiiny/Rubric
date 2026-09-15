import type { Request, Response } from "express";
import {
  findCriteriaByIds,
  findSubmission,
  insertAssessment,
  insertQuestion,
  insertRubricCriteria,
  listAnswersForSubmission,
  listAssessmentsForCourse,
  listCriteriaForQuestions,
  listQuestionsForAssessment,
  listSubmissionsForAssessment,
  publishAssessment,
  type AnswerRow,
  type QuestionRow,
} from "../db/assessments.repo";
import {
  listAgentResultsForEvaluations,
  listCriterionResultsForEvaluations,
  listEvaluationsForAnswers,
} from "../db/evaluations.repo";
import { findUserById } from "../db/users.repo";
import { AppError } from "../errors/AppError";
import type { CreateAssessmentInput, CreateQuestionInput, SubmitAssessmentInput } from "../schemas/assessment.schema";
import { submitAssessment as submitAssessmentService } from "../services/assessment.service";

async function attachEvaluations(answers: AnswerRow[]) {
  const evaluations = await listEvaluationsForAnswers(answers.map((a) => a.id));
  const evaluationByAnswer = new Map(evaluations.map((e) => [e.answer_id, e]));

  const criterionResults = await listCriterionResultsForEvaluations(evaluations.map((e) => e.id));
  const resultsByEvaluation = new Map<string, typeof criterionResults>();
  for (const r of criterionResults) {
    const list = resultsByEvaluation.get(r.evaluation_id) ?? [];
    list.push(r);
    resultsByEvaluation.set(r.evaluation_id, list);
  }

  const criteria = await findCriteriaByIds(criterionResults.map((r) => r.criterion_id));
  const criterionById = new Map(criteria.map((c) => [c.id, c]));

  const agentResults = await listAgentResultsForEvaluations(evaluations.map((e) => e.id));
  const agentTraceByEvaluation = new Map<string, typeof agentResults>();
  for (const a of agentResults) {
    const list = agentTraceByEvaluation.get(a.evaluation_id) ?? [];
    list.push(a);
    agentTraceByEvaluation.set(a.evaluation_id, list);
  }

  return answers.map((answer) => {
    const evaluation = evaluationByAnswer.get(answer.id);
    if (!evaluation) {
      return { ...answer, evaluation: null };
    }
    const results = (resultsByEvaluation.get(evaluation.id) ?? []).map((r) => ({
      criterionId: r.criterion_id,
      name: criterionById.get(r.criterion_id)?.name ?? "Unknown concept",
      weight: criterionById.get(r.criterion_id)?.weight ?? 0,
      status: r.status,
      evidence: r.evidence,
      confidence: Number(r.confidence),
      reasoning: r.reasoning,
      embeddingSimilarity: Number(r.embedding_similarity),
    }));
    const agentTrace = (agentTraceByEvaluation.get(evaluation.id) ?? []).map((a) => ({
      agentName: a.agent_name,
      status: a.status,
      confidence: a.confidence === null ? null : Number(a.confidence),
      summary: a.summary,
    }));
    return {
      ...answer,
      evaluation: {
        overallConfidence: Number(evaluation.overall_confidence),
        needsFacultyReview: evaluation.needs_faculty_review,
        failed: evaluation.failed,
        conflictOccurred: evaluation.conflict_occurred,
        feedback: evaluation.feedback,
        agentTrace,
        criteria: results,
      },
    };
  });
}

function sanitizeQuestion(question: QuestionRow, forStudent: boolean) {
  if (!forStudent) return question;
  const { mcq_correct_index: _correct, expected_answer: _expected, ...rest } = question;
  return rest;
}

export async function postAssessment(req: Request, res: Response) {
  const body = req.body as CreateAssessmentInput;
  const assessment = await insertAssessment(req.course!.id, body.title);
  res.status(201).json({ assessment });
}

export async function getAssessments(req: Request, res: Response) {
  const publishedOnly = req.auth!.role === "student";
  const assessments = await listAssessmentsForCourse(req.course!.id, { publishedOnly });
  res.status(200).json({ assessments });
}

export async function getAssessment(req: Request, res: Response) {
  const questions = await listQuestionsForAssessment(req.assessment!.id);
  const criteria = await listCriteriaForQuestions(questions.map((q) => q.id));
  const criteriaByQuestion = new Map<string, typeof criteria>();
  for (const c of criteria) {
    const list = criteriaByQuestion.get(c.question_id) ?? [];
    list.push(c);
    criteriaByQuestion.set(c.question_id, list);
  }

  const forStudent = !req.isCourseOwner;
  const questionsOut = questions.map((q) => ({
    ...sanitizeQuestion(q, forStudent),
    criteria: criteriaByQuestion.get(q.id) ?? [],
  }));

  res.status(200).json({ assessment: req.assessment, questions: questionsOut });
}

export async function postQuestion(req: Request, res: Response) {
  const assessment = req.assessment!;
  if (assessment.status !== "draft") {
    throw AppError.badRequest("Cannot add questions to a published assessment");
  }

  const body = req.body as CreateQuestionInput;
  const existing = await listQuestionsForAssessment(assessment.id);

  const question =
    body.type === "mcq"
      ? await insertQuestion({
          assessmentId: assessment.id,
          type: "mcq",
          prompt: body.prompt,
          orderIndex: existing.length,
          mcqOptions: body.options,
          mcqCorrectIndex: body.correctIndex,
        })
      : await insertQuestion({
          assessmentId: assessment.id,
          type: "short_answer",
          prompt: body.prompt,
          orderIndex: existing.length,
          expectedAnswer: body.expectedAnswer,
        });

  const criteria = body.type === "short_answer" ? await insertRubricCriteria(question.id, body.criteria) : [];

  res.status(201).json({ question: { ...question, criteria } });
}

export async function postPublish(req: Request, res: Response) {
  const assessment = req.assessment!;
  const questions = await listQuestionsForAssessment(assessment.id);
  if (questions.length === 0) {
    throw AppError.badRequest("Cannot publish an assessment with no questions");
  }
  await publishAssessment(assessment.id);
  res.status(200).json({ status: "published" });
}

export async function postSubmission(req: Request, res: Response) {
  const assessment = req.assessment!;
  if (assessment.status !== "published") {
    throw AppError.badRequest("This assessment is not open for submission");
  }
  if (req.isCourseOwner) {
    throw AppError.badRequest("Faculty cannot submit answers to their own assessment");
  }

  const existing = await findSubmission(assessment.id, req.auth!.sub);
  if (existing) {
    throw AppError.badRequest("You have already submitted this assessment");
  }

  const body = req.body as SubmitAssessmentInput;
  const submission = await submitAssessmentService(assessment.id, req.auth!.sub, body);
  const rawAnswers = await listAnswersForSubmission(submission.id);
  const answers = await attachEvaluations(rawAnswers);
  res.status(201).json({ submission, answers });
}

async function scoreSubmission(submissionId: string) {
  const answers = await listAnswersForSubmission(submissionId);
  if (answers.some((a) => a.score === null)) return null;
  const total = answers.reduce((sum, a) => sum + Number(a.score), 0);
  return Math.round(total / answers.length);
}

export async function getMySubmission(req: Request, res: Response) {
  const submission = await findSubmission(req.assessment!.id, req.auth!.sub);
  if (!submission) {
    res.status(200).json({ submission: null });
    return;
  }
  const rawAnswers = await listAnswersForSubmission(submission.id);
  const answers = await attachEvaluations(rawAnswers);
  const totalScore = await scoreSubmission(submission.id);
  res.status(200).json({ submission, answers, totalScore });
}

export async function getSubmissions(req: Request, res: Response) {
  const submissions = await listSubmissionsForAssessment(req.assessment!.id);
  const withScores = await Promise.all(
    submissions.map(async (s) => {
      const student = await findUserById(s.student_id);
      const totalScore = await scoreSubmission(s.id);
      const rawAnswers = await listAnswersForSubmission(s.id);
      const answers = await attachEvaluations(rawAnswers);
      return {
        ...s,
        totalScore,
        answers,
        student: student ? { id: student.id, email: student.email, fullName: student.full_name } : null,
      };
    }),
  );
  res.status(200).json({ submissions: withScores });
}
