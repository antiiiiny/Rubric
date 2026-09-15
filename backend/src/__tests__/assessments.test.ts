import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { deleteUserByEmail } from "../db/users.repo";

const app = createApp();

const facultyEmail = `quiz-faculty-${randomUUID()}@example.com`;
const studentEmail = `quiz-student-${randomUUID()}@example.com`;
const outsiderEmail = `quiz-outsider-${randomUUID()}@example.com`;
const password = "correct-horse-battery-staple";

let facultyCookie: string;
let studentCookie: string;
let outsiderCookie: string;
let courseId: string;
let assessmentId: string;
let mcqQuestionId: string;
let shortAnswerQuestionId: string;

function extractCookie(res: request.Response): string {
  const cookies = res.headers["set-cookie"] as unknown as string[];
  return cookies.find((c) => c.startsWith("rubric_token="))!.split(";")[0];
}

beforeAll(async () => {
  const facultyRes = await request(app)
    .post("/auth/signup")
    .send({ email: facultyEmail, password, fullName: "Quiz Faculty", role: "faculty" });
  facultyCookie = extractCookie(facultyRes);

  const studentRes = await request(app)
    .post("/auth/signup")
    .send({ email: studentEmail, password, fullName: "Quiz Student", role: "student" });
  studentCookie = extractCookie(studentRes);

  const outsiderRes = await request(app)
    .post("/auth/signup")
    .send({ email: outsiderEmail, password, fullName: "Quiz Outsider", role: "student" });
  outsiderCookie = extractCookie(outsiderRes);

  const courseRes = await request(app)
    .post("/courses")
    .set("Cookie", facultyCookie)
    .send({ title: "Quiz Course", description: "For quiz tests" });
  courseId = courseRes.body.course.id;

  await request(app)
    .post(`/courses/${courseId}/members`)
    .set("Cookie", facultyCookie)
    .send({ email: studentEmail });
});

afterAll(async () => {
  await Promise.all([facultyEmail, studentEmail, outsiderEmail].map((e) => deleteUserByEmail(e)));
});

describe("assessment creation and authoring", () => {
  it("lets the owning faculty create a draft assessment", async () => {
    const res = await request(app)
      .post(`/courses/${courseId}/assessments`)
      .set("Cookie", facultyCookie)
      .send({ title: "Normalization Quiz" });

    expect(res.status).toBe(201);
    expect(res.body.assessment.status).toBe("draft");
    assessmentId = res.body.assessment.id;
  });

  it("blocks a student from creating an assessment", async () => {
    const res = await request(app)
      .post(`/courses/${courseId}/assessments`)
      .set("Cookie", studentCookie)
      .send({ title: "Should not work" });

    expect(res.status).toBe(403);
  });

  it("rejects rubric criteria weights that don't sum to 100", async () => {
    const res = await request(app)
      .post(`/assessments/${assessmentId}/questions`)
      .set("Cookie", facultyCookie)
      .send({
        type: "short_answer",
        prompt: "What is normalization?",
        expectedAnswer: "Reduces redundancy and prevents anomalies",
        criteria: [
          { name: "reduces redundancy", weight: 40 },
          { name: "prevents anomalies", weight: 30 },
        ],
      });

    expect(res.status).toBe(400);
  });

  it("adds a short-answer question with valid rubric criteria", async () => {
    const res = await request(app)
      .post(`/assessments/${assessmentId}/questions`)
      .set("Cookie", facultyCookie)
      .send({
        type: "short_answer",
        prompt: "What is normalization?",
        expectedAnswer: "Reduces redundancy and prevents anomalies",
        criteria: [
          { name: "reduces redundancy", weight: 40 },
          { name: "prevents anomalies", weight: 30 },
          { name: "organizes data", weight: 30 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.question.criteria).toHaveLength(3);
    shortAnswerQuestionId = res.body.question.id;
  });

  it("adds an MCQ question", async () => {
    const res = await request(app)
      .post(`/assessments/${assessmentId}/questions`)
      .set("Cookie", facultyCookie)
      .send({
        type: "mcq",
        prompt: "Which normal form removes partial dependencies?",
        options: ["1NF", "2NF", "3NF", "BCNF"],
        correctIndex: 1,
      });

    expect(res.status).toBe(201);
    mcqQuestionId = res.body.question.id;
  });

  it("blocks a student from submitting to a draft assessment (hidden as not found)", async () => {
    const res = await request(app)
      .post(`/assessments/${assessmentId}/submissions`)
      .set("Cookie", studentCookie)
      .send({ answers: [{ questionId: mcqQuestionId, type: "mcq", selectedIndex: 1 }] });

    expect(res.status).toBe(404);
  });

  it("hides a draft assessment from a non-owner", async () => {
    const res = await request(app).get(`/assessments/${assessmentId}`).set("Cookie", studentCookie);
    expect(res.status).toBe(404);
  });

  it("publishes the assessment", async () => {
    const res = await request(app)
      .post(`/assessments/${assessmentId}/publish`)
      .set("Cookie", facultyCookie);

    expect(res.status).toBe(200);
  });
});

describe("student submission flow", () => {
  it("blocks a non-member from viewing the published assessment", async () => {
    const res = await request(app).get(`/assessments/${assessmentId}`).set("Cookie", outsiderCookie);
    expect(res.status).toBe(404);
  });

  it("hides the correct answer key from a student", async () => {
    const res = await request(app).get(`/assessments/${assessmentId}`).set("Cookie", studentCookie);
    expect(res.status).toBe(200);
    const mcq = res.body.questions.find((q: { id: string }) => q.id === mcqQuestionId);
    const shortAnswer = res.body.questions.find((q: { id: string }) => q.id === shortAnswerQuestionId);
    expect(mcq.mcq_correct_index).toBeUndefined();
    expect(shortAnswer.expected_answer).toBeUndefined();
  });

  it("shows the answer key to the owning faculty", async () => {
    const res = await request(app).get(`/assessments/${assessmentId}`).set("Cookie", facultyCookie);
    expect(res.status).toBe(200);
    const mcq = res.body.questions.find((q: { id: string }) => q.id === mcqQuestionId);
    expect(mcq.mcq_correct_index).toBe(1);
  });

  it("submits answers and auto-grades the MCQ correctly", async () => {
    const res = await request(app)
      .post(`/assessments/${assessmentId}/submissions`)
      .set("Cookie", studentCookie)
      .send({
        answers: [
          { questionId: mcqQuestionId, type: "mcq", selectedIndex: 1 },
          { questionId: shortAnswerQuestionId, type: "short_answer", textAnswer: "It reduces redundancy." },
        ],
      });

    expect(res.status).toBe(201);
    const mcqAnswer = res.body.answers.find((a: { question_id: string }) => a.question_id === mcqQuestionId);
    const shortAnswer = res.body.answers.find(
      (a: { question_id: string }) => a.question_id === shortAnswerQuestionId,
    );
    expect(Number(mcqAnswer.score)).toBe(100);
    expect(shortAnswer.score).toBeNull();
  });

  it("blocks a duplicate submission", async () => {
    const res = await request(app)
      .post(`/assessments/${assessmentId}/submissions`)
      .set("Cookie", studentCookie)
      .send({ answers: [{ questionId: mcqQuestionId, type: "mcq", selectedIndex: 0 }] });

    expect(res.status).toBe(400);
  });

  it("lets the student retrieve their own submission", async () => {
    const res = await request(app)
      .get(`/assessments/${assessmentId}/submissions/me`)
      .set("Cookie", studentCookie);

    expect(res.status).toBe(200);
    expect(res.body.submission).not.toBeNull();
    expect(res.body.answers).toHaveLength(2);
  });

  it("blocks a non-member from submitting", async () => {
    const res = await request(app)
      .post(`/assessments/${assessmentId}/submissions`)
      .set("Cookie", outsiderCookie)
      .send({ answers: [{ questionId: mcqQuestionId, type: "mcq", selectedIndex: 0 }] });

    expect(res.status).toBe(404);
  });

  it("lets faculty list all submissions with scores", async () => {
    const res = await request(app)
      .get(`/assessments/${assessmentId}/submissions`)
      .set("Cookie", facultyCookie);

    expect(res.status).toBe(200);
    expect(res.body.submissions).toHaveLength(1);
    expect(res.body.submissions[0].student.email).toBe(studentEmail);
  });

  it("blocks a student from listing all submissions", async () => {
    const res = await request(app)
      .get(`/assessments/${assessmentId}/submissions`)
      .set("Cookie", studentCookie);

    expect(res.status).toBe(403);
  });
});
