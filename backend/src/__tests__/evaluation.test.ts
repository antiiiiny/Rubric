import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../services/aiService.client", () => ({
  evaluateAnswer: vi.fn(),
}));

import { createApp } from "../app";
import { deleteUserByEmail } from "../db/users.repo";
import { evaluateAnswer } from "../services/aiService.client";

const app = createApp();
const mockedEvaluateAnswer = vi.mocked(evaluateAnswer);

const facultyEmail = `eval-faculty-${randomUUID()}@example.com`;
const studentEmail = `eval-student-${randomUUID()}@example.com`;
const password = "correct-horse-battery-staple";

let facultyCookie: string;
let studentCookie: string;
let courseId: string;

function extractCookie(res: request.Response): string {
  const cookies = res.headers["set-cookie"] as unknown as string[];
  return cookies.find((c) => c.startsWith("rubric_token="))!.split(";")[0];
}

async function createPublishedShortAnswerAssessment(criteria: { name: string; weight: number }[]) {
  const assessRes = await request(app)
    .post(`/courses/${courseId}/assessments`)
    .set("Cookie", facultyCookie)
    .send({ title: `Eval Quiz ${randomUUID()}` });
  const assessmentId = assessRes.body.assessment.id;

  const questionRes = await request(app)
    .post(`/assessments/${assessmentId}/questions`)
    .set("Cookie", facultyCookie)
    .send({
      type: "short_answer",
      prompt: "What is normalization?",
      expectedAnswer: "Reduces redundancy and prevents anomalies",
      criteria,
    });
  const questionId = questionRes.body.question.id;
  const criterionIds: string[] = questionRes.body.question.criteria.map((c: { id: string }) => c.id);

  await request(app).post(`/assessments/${assessmentId}/publish`).set("Cookie", facultyCookie);

  return { assessmentId, questionId, criterionIds };
}

beforeAll(async () => {
  const facultyRes = await request(app)
    .post("/auth/signup")
    .send({ email: facultyEmail, password, fullName: "Eval Faculty", role: "faculty" });
  facultyCookie = extractCookie(facultyRes);

  const studentRes = await request(app)
    .post("/auth/signup")
    .send({ email: studentEmail, password, fullName: "Eval Student", role: "student" });
  studentCookie = extractCookie(studentRes);

  const courseRes = await request(app)
    .post("/courses")
    .set("Cookie", facultyCookie)
    .send({ title: "Eval Course" });
  courseId = courseRes.body.course.id;

  await request(app)
    .post(`/courses/${courseId}/members`)
    .set("Cookie", facultyCookie)
    .send({ email: studentEmail });
});

afterAll(async () => {
  await Promise.all([facultyEmail, studentEmail].map((e) => deleteUserByEmail(e)));
});

describe("AI evaluation of short-answer submissions", () => {
  it("computes a deterministic weighted score from AI-assessed criterion status", async () => {
    const { assessmentId, questionId, criterionIds } = await createPublishedShortAnswerAssessment([
      { name: "reduces redundancy", weight: 40 },
      { name: "prevents anomalies", weight: 30 },
      { name: "organizes data", weight: 30 },
    ]);

    mockedEvaluateAnswer.mockResolvedValueOnce({
      criteria: [
        { criterion_id: criterionIds[0], status: "covered", evidence: "x", confidence: 0.9, reasoning: "ok", embedding_similarity: 0.7 },
        { criterion_id: criterionIds[1], status: "partial", evidence: "y", confidence: 0.6, reasoning: "half", embedding_similarity: 0.4 },
        { criterion_id: criterionIds[2], status: "missing", evidence: null, confidence: 0.8, reasoning: "absent", embedding_similarity: 0.1 },
      ],
      overall_confidence: 0.8,
      needs_faculty_review: false,
      conflict_occurred: false,
      agent_trace: [
        { agent_name: "concept_evaluator", status: "ok", confidence: 0.8, summary: "ok" },
        { agent_name: "judge", status: "ok", confidence: 0.8, summary: "ok" },
      ],
      feedback: null,
    });

    const res = await request(app)
      .post(`/assessments/${assessmentId}/submissions`)
      .set("Cookie", studentCookie)
      .send({
        answers: [{ questionId, type: "short_answer", textAnswer: "It reduces redundancy somewhat." }],
      });

    expect(res.status).toBe(201);
    // 40*100 + 30*50 + 30*0 = 5500 / 100 = 55
    expect(Number(res.body.answers[0].score)).toBe(55);
    expect(res.body.answers[0].evaluation.needsFacultyReview).toBe(false);
    expect(res.body.answers[0].evaluation.conflictOccurred).toBe(false);
    expect(res.body.answers[0].evaluation.agentTrace).toHaveLength(2);
    expect(res.body.answers[0].evaluation.criteria).toHaveLength(3);
    const covered = res.body.answers[0].evaluation.criteria.find(
      (c: { criterionId: string }) => c.criterionId === criterionIds[0],
    );
    expect(covered.status).toBe("covered");
    expect(covered.name).toBe("reduces redundancy");
  });

  it("persists conflict and agent-trace metadata from the multi-agent pipeline", async () => {
    const { assessmentId, questionId, criterionIds } = await createPublishedShortAnswerAssessment([
      { name: "reduces redundancy", weight: 100 },
    ]);

    mockedEvaluateAnswer.mockResolvedValueOnce({
      criteria: [
        { criterion_id: criterionIds[0], status: "covered", evidence: "x", confidence: 0.85, reasoning: "resolved after conflict", embedding_similarity: 0.5 },
      ],
      overall_confidence: 0.85,
      needs_faculty_review: false,
      conflict_occurred: true,
      agent_trace: [
        { agent_name: "concept_evaluator", status: "ok", confidence: 0.9, summary: "ok" },
        { agent_name: "accuracy_critic", status: "ok", confidence: 0.4, summary: "disagreed" },
        { agent_name: "completeness_evaluator", status: "ok", confidence: 0.9, summary: "ok" },
        { agent_name: "judge", status: "ok", confidence: 0.4, summary: "first pass, conflict" },
        { agent_name: "accuracy_critic", status: "ok", confidence: 0.9, summary: "re-review" },
        { agent_name: "judge", status: "ok", confidence: 0.85, summary: "resolved" },
        { agent_name: "feedback_agent", status: "ok", confidence: null, summary: "ok" },
      ],
      feedback: { strengths: ["good"], gaps: [], inaccuracies: [], suggestions: [], summary: "Nice." },
    });

    const res = await request(app)
      .post(`/assessments/${assessmentId}/submissions`)
      .set("Cookie", studentCookie)
      .send({ answers: [{ questionId, type: "short_answer", textAnswer: "It reduces redundancy." }] });

    expect(res.status).toBe(201);
    expect(res.body.answers[0].evaluation.conflictOccurred).toBe(true);
    expect(res.body.answers[0].evaluation.agentTrace).toHaveLength(7);
    expect(res.body.answers[0].evaluation.feedback.summary).toBe("Nice.");

    const mine = await request(app)
      .get(`/assessments/${assessmentId}/submissions/me`)
      .set("Cookie", studentCookie);
    expect(mine.body.answers[0].evaluation.agentTrace).toHaveLength(7);
    expect(mine.body.answers[0].evaluation.conflictOccurred).toBe(true);
  });

  it("leaves the answer ungraded and flags for review when the AI service call fails", async () => {
    const { assessmentId, questionId } = await createPublishedShortAnswerAssessment([
      { name: "reduces redundancy", weight: 100 },
    ]);

    mockedEvaluateAnswer.mockRejectedValueOnce(new Error("ai-service unreachable"));

    const res = await request(app)
      .post(`/assessments/${assessmentId}/submissions`)
      .set("Cookie", studentCookie)
      .send({ answers: [{ questionId, type: "short_answer", textAnswer: "Some answer." }] });

    expect(res.status).toBe(201);
    expect(res.body.answers[0].score).toBeNull();
    expect(res.body.answers[0].evaluation.failed).toBe(true);
    expect(res.body.answers[0].evaluation.needsFacultyReview).toBe(true);
  });

  it("rejects a malformed AI response before it can drive a score (schema validation)", async () => {
    const { assessmentId, questionId } = await createPublishedShortAnswerAssessment([
      { name: "reduces redundancy", weight: 100 },
    ]);

    // Simulate the ai-service HTTP client throwing after Zod validation fails
    // on an out-of-range confidence value (mirrors evaluationResultSchema.parse behavior).
    mockedEvaluateAnswer.mockRejectedValueOnce(new Error("Invalid evaluation payload"));

    const res = await request(app)
      .post(`/assessments/${assessmentId}/submissions`)
      .set("Cookie", studentCookie)
      .send({ answers: [{ questionId, type: "short_answer", textAnswer: "Some answer." }] });

    expect(res.status).toBe(201);
    expect(res.body.answers[0].score).toBeNull();
    expect(res.body.answers[0].evaluation.failed).toBe(true);
  });
});
