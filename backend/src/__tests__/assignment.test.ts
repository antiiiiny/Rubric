import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../services/aiService.client", () => ({
  evaluateAnswer: vi.fn(),
}));

vi.mock("../services/documentExtraction.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/documentExtraction.service")>();
  return { ...actual, extractText: vi.fn() };
});

import { createApp } from "../app";
import { deleteUserByEmail } from "../db/users.repo";
import { evaluateAnswer } from "../services/aiService.client";
import { extractText } from "../services/documentExtraction.service";

const app = createApp();
const mockedEvaluateAnswer = vi.mocked(evaluateAnswer);
const mockedExtractText = vi.mocked(extractText);

const facultyEmail = `assign-faculty-${randomUUID()}@example.com`;
const studentEmail = `assign-student-${randomUUID()}@example.com`;
const outsiderEmail = `assign-outsider-${randomUUID()}@example.com`;
const password = "correct-horse-battery-staple";

let facultyCookie: string;
let studentCookie: string;
let outsiderCookie: string;
let courseId: string;
let assessmentId: string;
let questionId: string;
let criterionId: string;

function extractCookie(res: request.Response): string {
  const cookies = res.headers["set-cookie"] as unknown as string[];
  return cookies.find((c) => c.startsWith("rubric_token="))!.split(";")[0];
}

async function createPublishedDocumentAssignment() {
  const assessRes = await request(app)
    .post(`/courses/${courseId}/assessments`)
    .set("Cookie", facultyCookie)
    .send({ title: `Essay ${randomUUID()}`, type: "assignment" });
  const newAssessmentId = assessRes.body.assessment.id;

  const questionRes = await request(app)
    .post(`/assessments/${newAssessmentId}/questions`)
    .set("Cookie", facultyCookie)
    .send({
      type: "document",
      prompt: "Write an essay on normalization.",
      expectedAnswer: "Should discuss redundancy, anomalies, and organization.",
      criteria: [{ name: "reduces redundancy", weight: 100 }],
      sections: [
        { name: "Introduction", required: true },
        { name: "Conclusion", required: true },
      ],
    });
  const newQuestionId = questionRes.body.question.id;

  await request(app).post(`/assessments/${newAssessmentId}/publish`).set("Cookie", facultyCookie);

  return { assessmentId: newAssessmentId, questionId: newQuestionId };
}

function makeEvaluation() {
  return {
    criteria: [
      { criterion_id: criterionId, status: "covered" as const, evidence: "x", confidence: 0.9, reasoning: "ok", embedding_similarity: 0.5 },
    ],
    overall_confidence: 0.9,
    needs_faculty_review: false,
    conflict_occurred: false,
    agent_trace: [],
    feedback: null,
  };
}

beforeAll(async () => {
  const facultyRes = await request(app)
    .post("/auth/signup")
    .send({ email: facultyEmail, password, fullName: "Assign Faculty", role: "faculty" });
  facultyCookie = extractCookie(facultyRes);

  const studentRes = await request(app)
    .post("/auth/signup")
    .send({ email: studentEmail, password, fullName: "Assign Student", role: "student" });
  studentCookie = extractCookie(studentRes);

  const outsiderRes = await request(app)
    .post("/auth/signup")
    .send({ email: outsiderEmail, password, fullName: "Assign Outsider", role: "student" });
  outsiderCookie = extractCookie(outsiderRes);

  const courseRes = await request(app)
    .post("/courses")
    .set("Cookie", facultyCookie)
    .send({ title: "Assignment Course" });
  courseId = courseRes.body.course.id;

  await request(app)
    .post(`/courses/${courseId}/members`)
    .set("Cookie", facultyCookie)
    .send({ email: studentEmail });

  const assessRes = await request(app)
    .post(`/courses/${courseId}/assessments`)
    .set("Cookie", facultyCookie)
    .send({ title: "Essay Assignment", type: "assignment" });
  assessmentId = assessRes.body.assessment.id;
  expect(assessRes.body.assessment.type).toBe("assignment");

  const questionRes = await request(app)
    .post(`/assessments/${assessmentId}/questions`)
    .set("Cookie", facultyCookie)
    .send({
      type: "document",
      prompt: "Write an essay on normalization.",
      expectedAnswer: "Should discuss redundancy, anomalies, and organization.",
      criteria: [{ name: "reduces redundancy", weight: 100 }],
      sections: [
        { name: "Introduction", required: true },
        { name: "Conclusion", required: true },
      ],
    });
  questionId = questionRes.body.question.id;
  criterionId = questionRes.body.question.criteria[0].id;
  expect(questionRes.body.question.sections).toHaveLength(2);

  await request(app).post(`/assessments/${assessmentId}/publish`).set("Cookie", facultyCookie);
});

afterAll(async () => {
  await Promise.all([facultyEmail, studentEmail, outsiderEmail].map((e) => deleteUserByEmail(e)));
});

afterEach(() => {
  // Some tests short-circuit before extractText/evaluateAnswer are called
  // (duplicate/non-member checks), which would otherwise leave a queued
  // mockResolvedValueOnce/mockRejectedValueOnce to bleed into a later test.
  mockedExtractText.mockReset();
  mockedEvaluateAnswer.mockReset();
});

describe("assignment document submission", () => {
  it("rejects a file type other than PDF/DOCX before it reaches the controller", async () => {
    const res = await request(app)
      .post(`/assessments/${assessmentId}/submissions/document`)
      .set("Cookie", studentCookie)
      .field("questionId", questionId)
      .attach("file", Buffer.from("plain text file"), {
        filename: "essay.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(400);
  });

  it("extracts text, detects missing required sections, and evaluates the answer", async () => {
    mockedExtractText.mockResolvedValueOnce(
      "Introduction\nNormalization reduces redundancy in databases.",
    );
    mockedEvaluateAnswer.mockResolvedValueOnce(makeEvaluation());

    const res = await request(app)
      .post(`/assessments/${assessmentId}/submissions/document`)
      .set("Cookie", studentCookie)
      .field("questionId", questionId)
      .attach("file", Buffer.from("%PDF-1.4 fake pdf bytes"), {
        filename: "essay.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(201);
    const answer = res.body.answers[0];
    expect(answer.original_filename).toBe("essay.pdf");
    const sectionCheck = answer.section_check as { name: string; found: boolean }[];
    expect(sectionCheck.find((s) => s.name === "Introduction")?.found).toBe(true);
    expect(sectionCheck.find((s) => s.name === "Conclusion")?.found).toBe(false);
    expect(answer.evaluation).not.toBeNull();
  });

  it("blocks a duplicate assignment submission", async () => {
    mockedExtractText.mockResolvedValueOnce("Introduction\nSome text.");

    const res = await request(app)
      .post(`/assessments/${assessmentId}/submissions/document`)
      .set("Cookie", studentCookie)
      .field("questionId", questionId)
      .attach("file", Buffer.from("%PDF-1.4 fake pdf bytes"), {
        filename: "essay2.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
  });

  it("blocks a non-member from submitting", async () => {
    mockedExtractText.mockResolvedValueOnce("Introduction\nSome text.");

    const res = await request(app)
      .post(`/assessments/${assessmentId}/submissions/document`)
      .set("Cookie", outsiderCookie)
      .field("questionId", questionId)
      .attach("file", Buffer.from("%PDF-1.4 fake pdf bytes"), {
        filename: "essay.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(404);
  });

  it("returns a clean error when the document cannot be parsed", async () => {
    const { assessmentId: freshAssessmentId, questionId: freshQuestionId } =
      await createPublishedDocumentAssignment();

    const { AppError } = await import("../errors/AppError");
    mockedExtractText.mockRejectedValueOnce(
      AppError.badRequest("Could not parse the uploaded document. Is the file corrupted?"),
    );

    const res = await request(app)
      .post(`/assessments/${freshAssessmentId}/submissions/document`)
      .set("Cookie", studentCookie)
      .field("questionId", freshQuestionId)
      .attach("file", Buffer.from("garbage"), { filename: "essay.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(400);
  });
});
