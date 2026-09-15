import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../services/aiService.client", () => ({
  evaluateAnswer: vi.fn(),
}));

import { createApp } from "../app";
import { deleteUserByEmail } from "../db/users.repo";
import { evaluateAnswer } from "../services/aiService.client";

const app = createApp();
const mockedEvaluateAnswer = vi.mocked(evaluateAnswer);

const facultyEmail = `review-faculty-${randomUUID()}@example.com`;
const otherFacultyEmail = `review-other-faculty-${randomUUID()}@example.com`;
const studentEmail = `review-student-${randomUUID()}@example.com`;
const password = "correct-horse-battery-staple";

let facultyCookie: string;
let otherFacultyCookie: string;
let studentCookie: string;
let courseId: string;

function extractCookie(res: request.Response): string {
  const cookies = res.headers["set-cookie"] as unknown as string[];
  return cookies.find((c) => c.startsWith("rubric_token="))!.split(";")[0];
}

async function createSubmittedShortAnswer(aiEvaluation: {
  criteria: { criterion_id: string; status: "covered" | "partial" | "missing"; evidence: string | null; confidence: number; reasoning: string; embedding_similarity: number }[];
  overall_confidence: number;
  needs_faculty_review: boolean;
  conflict_occurred: boolean;
  agent_trace: unknown[];
  feedback: null;
}) {
  const assessRes = await request(app)
    .post(`/courses/${courseId}/assessments`)
    .set("Cookie", facultyCookie)
    .send({ title: `Review Quiz ${randomUUID()}` });
  const assessmentId = assessRes.body.assessment.id;

  const questionRes = await request(app)
    .post(`/assessments/${assessmentId}/questions`)
    .set("Cookie", facultyCookie)
    .send({
      type: "short_answer",
      prompt: "What is normalization?",
      expectedAnswer: "Reduces redundancy",
      criteria: [
        { name: "reduces redundancy", weight: 60 },
        { name: "organizes data", weight: 40 },
      ],
    });
  const questionId = questionRes.body.question.id;
  const criterionIds: string[] = questionRes.body.question.criteria.map((c: { id: string }) => c.id);

  await request(app).post(`/assessments/${assessmentId}/publish`).set("Cookie", facultyCookie);

  const patched = {
    ...aiEvaluation,
    criteria: aiEvaluation.criteria.map((c, i) => ({ ...c, criterion_id: criterionIds[i] })),
  };
  mockedEvaluateAnswer.mockResolvedValueOnce(patched);

  const submitRes = await request(app)
    .post(`/assessments/${assessmentId}/submissions`)
    .set("Cookie", studentCookie)
    .send({ answers: [{ questionId, type: "short_answer", textAnswer: "It reduces redundancy." }] });

  const answerId = submitRes.body.answers[0].id;
  return { assessmentId, questionId, criterionIds, answerId };
}

beforeAll(async () => {
  const facultyRes = await request(app)
    .post("/auth/signup")
    .send({ email: facultyEmail, password, fullName: "Review Faculty", role: "faculty" });
  facultyCookie = extractCookie(facultyRes);

  const otherFacultyRes = await request(app)
    .post("/auth/signup")
    .send({ email: otherFacultyEmail, password, fullName: "Other Faculty", role: "faculty" });
  otherFacultyCookie = extractCookie(otherFacultyRes);

  const studentRes = await request(app)
    .post("/auth/signup")
    .send({ email: studentEmail, password, fullName: "Review Student", role: "student" });
  studentCookie = extractCookie(studentRes);

  const courseRes = await request(app)
    .post("/courses")
    .set("Cookie", facultyCookie)
    .send({ title: "Review Course" });
  courseId = courseRes.body.course.id;

  await request(app)
    .post(`/courses/${courseId}/members`)
    .set("Cookie", facultyCookie)
    .send({ email: studentEmail });
});

afterAll(async () => {
  await Promise.all([facultyEmail, otherFacultyEmail, studentEmail].map((e) => deleteUserByEmail(e)));
});

afterEach(() => {
  mockedEvaluateAnswer.mockReset();
});

describe("faculty review of AI evaluations", () => {
  it("approving without changes preserves the AI's original score and keeps the AI evaluation queryable", async () => {
    const { assessmentId, answerId } = await createSubmittedShortAnswer({
      criteria: [
        { criterion_id: "", status: "covered", evidence: "x", confidence: 0.9, reasoning: "ok", embedding_similarity: 0.5 },
        { criterion_id: "", status: "missing", evidence: null, confidence: 0.9, reasoning: "absent", embedding_similarity: 0.1 },
      ],
      overall_confidence: 0.9,
      needs_faculty_review: false,
      conflict_occurred: false,
      agent_trace: [],
      feedback: null,
    });
    // AI score: 60*100 + 40*0 = 6000/100 = 60

    const res = await request(app)
      .post(`/assessments/${assessmentId}/answers/${answerId}/review`)
      .set("Cookie", facultyCookie)
      .send({ comment: "Looks right." });

    expect(res.status).toBe(200);
    expect(res.body.review.status).toBe("approved");
    expect(Number(res.body.review.finalScore)).toBe(60);

    const mine = await request(app)
      .get(`/assessments/${assessmentId}/submissions/me`)
      .set("Cookie", studentCookie);
    expect(mine.body.totalScore).toBe(60);
    expect(mine.body.answers[0].review.status).toBe("approved");
    // Original AI evaluation is still independently present, not destroyed.
    expect(mine.body.answers[0].evaluation.criteria).toHaveLength(2);
  });

  it("overriding the final score directly changes what the student sees, without altering the original AI evaluation", async () => {
    const { assessmentId, answerId } = await createSubmittedShortAnswer({
      criteria: [
        { criterion_id: "", status: "covered", evidence: "x", confidence: 0.9, reasoning: "ok", embedding_similarity: 0.5 },
        { criterion_id: "", status: "missing", evidence: null, confidence: 0.9, reasoning: "absent", embedding_similarity: 0.1 },
      ],
      overall_confidence: 0.9,
      needs_faculty_review: false,
      conflict_occurred: false,
      agent_trace: [],
      feedback: null,
    });

    const res = await request(app)
      .post(`/assessments/${assessmentId}/answers/${answerId}/review`)
      .set("Cookie", facultyCookie)
      .send({ finalScore: 85, finalFeedback: "Actually pretty good, AI was too harsh." });

    expect(res.status).toBe(200);
    expect(res.body.review.status).toBe("overridden");
    expect(Number(res.body.review.finalScore)).toBe(85);

    const mine = await request(app)
      .get(`/assessments/${assessmentId}/submissions/me`)
      .set("Cookie", studentCookie);
    expect(mine.body.totalScore).toBe(85);
    expect(mine.body.answers[0].review.finalFeedback).toBe("Actually pretty good, AI was too harsh.");
    // Original AI per-criterion result (missing) is preserved, not overwritten.
    const missingCriterion = mine.body.answers[0].evaluation.criteria.find(
      (c: { status: string }) => c.status === "missing",
    );
    expect(missingCriterion).toBeDefined();
  });

  it("keeps the internal faculty comment hidden from the student, while faculty can still see it", async () => {
    const { assessmentId, answerId } = await createSubmittedShortAnswer({
      criteria: [
        { criterion_id: "", status: "covered", evidence: "x", confidence: 0.9, reasoning: "ok", embedding_similarity: 0.5 },
        { criterion_id: "", status: "covered", evidence: "y", confidence: 0.9, reasoning: "ok", embedding_similarity: 0.5 },
      ],
      overall_confidence: 0.9,
      needs_faculty_review: false,
      conflict_occurred: false,
      agent_trace: [],
      feedback: null,
    });

    await request(app)
      .post(`/assessments/${assessmentId}/answers/${answerId}/review`)
      .set("Cookie", facultyCookie)
      .send({ comment: "Internal note: this student needs extra help." });

    const mine = await request(app)
      .get(`/assessments/${assessmentId}/submissions/me`)
      .set("Cookie", studentCookie);
    expect(mine.body.answers[0].review.comment).toBeNull();

    const facultyView = await request(app)
      .get(`/assessments/${assessmentId}/submissions`)
      .set("Cookie", facultyCookie);
    expect(facultyView.body.submissions[0].answers[0].review.comment).toBe(
      "Internal note: this student needs extra help.",
    );
  });

  it("overriding individual criteria recomputes the deterministic score from faculty-corrected statuses", async () => {
    const { assessmentId, answerId, criterionIds } = await createSubmittedShortAnswer({
      criteria: [
        { criterion_id: "", status: "missing", evidence: null, confidence: 0.9, reasoning: "AI missed it", embedding_similarity: 0.1 },
        { criterion_id: "", status: "missing", evidence: null, confidence: 0.9, reasoning: "absent", embedding_similarity: 0.1 },
      ],
      overall_confidence: 0.9,
      needs_faculty_review: false,
      conflict_occurred: false,
      agent_trace: [],
      feedback: null,
    });

    // Faculty corrects the first criterion (60% weight) to "covered"; leaves the second as-is.
    const res = await request(app)
      .post(`/assessments/${assessmentId}/answers/${answerId}/review`)
      .set("Cookie", facultyCookie)
      .send({ criterionOverrides: [{ criterionId: criterionIds[0], status: "covered" }] });

    expect(res.status).toBe(200);
    expect(res.body.review.status).toBe("overridden");
    // 60*100 + 40*0 = 6000/100 = 60
    expect(Number(res.body.review.finalScore)).toBe(60);
  });

  it("a non-owning faculty member cannot review an answer", async () => {
    const { assessmentId, answerId } = await createSubmittedShortAnswer({
      criteria: [
        { criterion_id: "", status: "covered", evidence: "x", confidence: 0.9, reasoning: "ok", embedding_similarity: 0.5 },
        { criterion_id: "", status: "covered", evidence: "y", confidence: 0.9, reasoning: "ok", embedding_similarity: 0.5 },
      ],
      overall_confidence: 0.9,
      needs_faculty_review: false,
      conflict_occurred: false,
      agent_trace: [],
      feedback: null,
    });

    const res = await request(app)
      .post(`/assessments/${assessmentId}/answers/${answerId}/review`)
      .set("Cookie", otherFacultyCookie)
      .send({ comment: "not mine" });

    expect(res.status).toBe(404);
  });

  it("a student cannot review an answer", async () => {
    const { assessmentId, answerId } = await createSubmittedShortAnswer({
      criteria: [
        { criterion_id: "", status: "covered", evidence: "x", confidence: 0.9, reasoning: "ok", embedding_similarity: 0.5 },
        { criterion_id: "", status: "covered", evidence: "y", confidence: 0.9, reasoning: "ok", embedding_similarity: 0.5 },
      ],
      overall_confidence: 0.9,
      needs_faculty_review: false,
      conflict_occurred: false,
      agent_trace: [],
      feedback: null,
    });

    const res = await request(app)
      .post(`/assessments/${assessmentId}/answers/${answerId}/review`)
      .set("Cookie", studentCookie)
      .send({ comment: "self-review" });

    expect(res.status).toBe(403);
  });
});
