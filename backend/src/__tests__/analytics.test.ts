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

const facultyEmail = `analytics-faculty-${randomUUID()}@example.com`;
const otherFacultyEmail = `analytics-other-faculty-${randomUUID()}@example.com`;
const studentAEmail = `analytics-student-a-${randomUUID()}@example.com`;
const studentBEmail = `analytics-student-b-${randomUUID()}@example.com`;
const password = "correct-horse-battery-staple";

let facultyCookie: string;
let otherFacultyCookie: string;
let studentACookie: string;
let studentBCookie: string;
let courseId: string;

function extractCookie(res: request.Response): string {
  const cookies = res.headers["set-cookie"] as unknown as string[];
  return cookies.find((c) => c.startsWith("rubric_token="))!.split(";")[0];
}

beforeAll(async () => {
  const facultyRes = await request(app)
    .post("/auth/signup")
    .send({ email: facultyEmail, password, fullName: "Analytics Faculty", role: "faculty" });
  facultyCookie = extractCookie(facultyRes);

  const otherFacultyRes = await request(app)
    .post("/auth/signup")
    .send({ email: otherFacultyEmail, password, fullName: "Other Faculty", role: "faculty" });
  otherFacultyCookie = extractCookie(otherFacultyRes);

  const studentARes = await request(app)
    .post("/auth/signup")
    .send({ email: studentAEmail, password, fullName: "Student A", role: "student" });
  studentACookie = extractCookie(studentARes);

  const studentBRes = await request(app)
    .post("/auth/signup")
    .send({ email: studentBEmail, password, fullName: "Student B", role: "student" });
  studentBCookie = extractCookie(studentBRes);

  const courseRes = await request(app)
    .post("/courses")
    .set("Cookie", facultyCookie)
    .send({ title: "Analytics Course" });
  courseId = courseRes.body.course.id;

  await request(app)
    .post(`/courses/${courseId}/members`)
    .set("Cookie", facultyCookie)
    .send({ email: studentAEmail });
  await request(app)
    .post(`/courses/${courseId}/members`)
    .set("Cookie", facultyCookie)
    .send({ email: studentBEmail });

  // One quiz, one short-answer question, one criterion: "reduces redundancy".
  const assessRes = await request(app)
    .post(`/courses/${courseId}/assessments`)
    .set("Cookie", facultyCookie)
    .send({ title: "Analytics Quiz" });
  const assessmentId = assessRes.body.assessment.id;

  const questionRes = await request(app)
    .post(`/assessments/${assessmentId}/questions`)
    .set("Cookie", facultyCookie)
    .send({
      type: "short_answer",
      prompt: "What is normalization?",
      expectedAnswer: "Reduces redundancy",
      criteria: [{ name: "reduces redundancy", weight: 100 }],
    });
  const criterionId = questionRes.body.question.criteria[0].id;

  await request(app).post(`/assessments/${assessmentId}/publish`).set("Cookie", facultyCookie);

  // Student A: AI says "covered". Student B: AI says "missing".
  // Expected aggregate: 1 covered, 1 missing -> mastery = (100+0)/2 = 50,
  // struggling share = 1/2 = 0.5 >= 0.4 threshold -> flagged.
  mockedEvaluateAnswer.mockResolvedValueOnce({
    criteria: [{ criterion_id: criterionId, status: "covered", evidence: "x", confidence: 0.9, reasoning: "ok", embedding_similarity: 0.5 }],
    overall_confidence: 0.9,
    needs_faculty_review: false,
    conflict_occurred: false,
    agent_trace: [],
    feedback: null,
  });
  await request(app)
    .post(`/assessments/${assessmentId}/submissions`)
    .set("Cookie", studentACookie)
    .send({ answers: [{ questionId: questionRes.body.question.id, type: "short_answer", textAnswer: "It reduces redundancy." }] });

  mockedEvaluateAnswer.mockResolvedValueOnce({
    criteria: [{ criterion_id: criterionId, status: "missing", evidence: null, confidence: 0.9, reasoning: "absent", embedding_similarity: 0.1 }],
    overall_confidence: 0.9,
    needs_faculty_review: false,
    conflict_occurred: false,
    agent_trace: [],
    feedback: null,
  });
  await request(app)
    .post(`/assessments/${assessmentId}/submissions`)
    .set("Cookie", studentBCookie)
    .send({ answers: [{ questionId: questionRes.body.question.id, type: "short_answer", textAnswer: "Not sure." }] });
});

afterAll(async () => {
  await Promise.all(
    [facultyEmail, otherFacultyEmail, studentAEmail, studentBEmail].map((e) => deleteUserByEmail(e)),
  );
});

afterEach(() => {
  mockedEvaluateAnswer.mockReset();
});

describe("course concept-mastery analytics", () => {
  it("aggregates concept mastery correctly against seeded submissions", async () => {
    const res = await request(app)
      .get(`/courses/${courseId}/analytics/concept-mastery`)
      .set("Cookie", facultyCookie);

    expect(res.status).toBe(200);
    const concept = res.body.concepts.find((c: { concept: string }) => c.concept === "reduces redundancy");
    expect(concept).toBeDefined();
    expect(concept.totalResponses).toBe(2);
    expect(concept.coveredCount).toBe(1);
    expect(concept.missingCount).toBe(1);
    expect(concept.masteryPercent).toBe(50);
    expect(concept.commonMisconception).toBe(true);
  });

  it("blocks a non-owning faculty member from viewing course analytics", async () => {
    const res = await request(app)
      .get(`/courses/${courseId}/analytics/concept-mastery`)
      .set("Cookie", otherFacultyCookie);

    expect(res.status).toBe(404);
  });

  it("blocks a student from viewing course analytics", async () => {
    const res = await request(app)
      .get(`/courses/${courseId}/analytics/concept-mastery`)
      .set("Cookie", studentACookie);

    expect(res.status).toBe(403);
  });
});
