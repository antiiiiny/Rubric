import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { deleteUserByEmail } from "../db/users.repo";

const app = createApp();

const facultyEmail = `course-faculty-${randomUUID()}@example.com`;
const otherFacultyEmail = `course-other-faculty-${randomUUID()}@example.com`;
const studentEmail = `course-student-${randomUUID()}@example.com`;
const outsiderEmail = `course-outsider-${randomUUID()}@example.com`;
const password = "correct-horse-battery-staple";

let facultyCookie: string;
let otherFacultyCookie: string;
let studentCookie: string;
let outsiderCookie: string;
let courseId: string;

function extractCookie(res: request.Response): string {
  const cookies = res.headers["set-cookie"] as unknown as string[];
  return cookies.find((c) => c.startsWith("rubric_token="))!.split(";")[0];
}

beforeAll(async () => {
  const facultyRes = await request(app)
    .post("/auth/signup")
    .send({ email: facultyEmail, password, fullName: "Owning Faculty", role: "faculty" });
  facultyCookie = extractCookie(facultyRes);

  const otherFacultyRes = await request(app)
    .post("/auth/signup")
    .send({ email: otherFacultyEmail, password, fullName: "Other Faculty", role: "faculty" });
  otherFacultyCookie = extractCookie(otherFacultyRes);

  const studentRes = await request(app)
    .post("/auth/signup")
    .send({ email: studentEmail, password, fullName: "Enrolled Student", role: "student" });
  studentCookie = extractCookie(studentRes);

  const outsiderRes = await request(app)
    .post("/auth/signup")
    .send({ email: outsiderEmail, password, fullName: "Outsider Student", role: "student" });
  outsiderCookie = extractCookie(outsiderRes);
});

afterAll(async () => {
  await Promise.all(
    [facultyEmail, otherFacultyEmail, studentEmail, outsiderEmail].map((e) => deleteUserByEmail(e)),
  );
});

describe("POST /courses", () => {
  it("lets faculty create a course", async () => {
    const res = await request(app)
      .post("/courses")
      .set("Cookie", facultyCookie)
      .send({ title: "Intro to Databases", description: "DBMS fundamentals" });

    expect(res.status).toBe(201);
    expect(res.body.course.title).toBe("Intro to Databases");
    courseId = res.body.course.id;
  });

  it("blocks a student from creating a course", async () => {
    const res = await request(app)
      .post("/courses")
      .set("Cookie", studentCookie)
      .send({ title: "Should not work" });

    expect(res.status).toBe(403);
  });
});

describe("course enrollment and data isolation", () => {
  it("owning faculty can enroll a student", async () => {
    const res = await request(app)
      .post(`/courses/${courseId}/members`)
      .set("Cookie", facultyCookie)
      .send({ email: studentEmail });

    expect(res.status).toBe(201);
  });

  it("a different faculty member cannot enroll students in someone else's course", async () => {
    const res = await request(app)
      .post(`/courses/${courseId}/members`)
      .set("Cookie", otherFacultyCookie)
      .send({ email: outsiderEmail });

    expect(res.status).toBe(404);
  });

  it("enrolled student can view the course", async () => {
    const res = await request(app).get(`/courses/${courseId}`).set("Cookie", studentCookie);
    expect(res.status).toBe(200);
    expect(res.body.course.id).toBe(courseId);
  });

  it("a student not enrolled cannot view the course", async () => {
    const res = await request(app).get(`/courses/${courseId}`).set("Cookie", outsiderCookie);
    expect(res.status).toBe(404);
  });

  it("student's course list only includes courses they're enrolled in", async () => {
    const res = await request(app).get("/courses").set("Cookie", outsiderCookie);
    expect(res.status).toBe(200);
    expect(res.body.courses).toEqual([]);
  });

  it("owning faculty can list members", async () => {
    const res = await request(app).get(`/courses/${courseId}/members`).set("Cookie", facultyCookie);
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].email).toBe(studentEmail);
  });

  it("a non-owning faculty cannot list members", async () => {
    const res = await request(app).get(`/courses/${courseId}/members`).set("Cookie", otherFacultyCookie);
    expect(res.status).toBe(404);
  });
});
