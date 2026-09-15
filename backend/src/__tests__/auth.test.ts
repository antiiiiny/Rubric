import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { deleteUserByEmail } from "../db/users.repo";
import { authenticate, requireRole } from "../middleware/auth";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler";

const app = createApp();

const facultyEmail = `faculty-${randomUUID()}@example.com`;
const studentEmail = `student-${randomUUID()}@example.com`;
const password = "correct-horse-battery-staple";

afterAll(async () => {
  await deleteUserByEmail(facultyEmail);
  await deleteUserByEmail(studentEmail);
});

function extractCookie(res: request.Response): string {
  const cookies = res.headers["set-cookie"] as unknown as string[];
  const authCookie = cookies?.find((c) => c.startsWith("rubric_token="));
  if (!authCookie) throw new Error("auth cookie not set");
  return authCookie.split(";")[0];
}

describe("POST /auth/signup", () => {
  it("creates a faculty account and sets an httpOnly session cookie", async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: facultyEmail, password, fullName: "Dr. Faculty", role: "faculty" });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: facultyEmail, role: "faculty" });
    expect(res.body.user.password_hash).toBeUndefined();

    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("rubric_token=") && c.includes("HttpOnly"))).toBe(true);
  });

  it("creates a student account", async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: studentEmail, password, fullName: "A Student", role: "student" });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("student");
  });

  it("rejects a duplicate email", async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: facultyEmail, password, fullName: "Dupe", role: "faculty" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  it("rejects an invalid payload", async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: "not-an-email", password: "short", fullName: "", role: "wizard" });

    expect(res.status).toBe(400);
  });
});

describe("POST /auth/login", () => {
  it("logs in with correct credentials", async () => {
    const res = await request(app).post("/auth/login").send({ email: facultyEmail, password });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(facultyEmail);
  });

  it("rejects an incorrect password", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: facultyEmail, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects an unknown email", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@example.com", password });

    expect(res.status).toBe(401);
  });
});

describe("GET /auth/me", () => {
  it("rejects a request with no session cookie", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user for a valid session, and the session survives a second request (page reload)", async () => {
    const loginRes = await request(app).post("/auth/login").send({ email: facultyEmail, password });
    const cookie = extractCookie(loginRes);

    const first = await request(app).get("/auth/me").set("Cookie", cookie);
    expect(first.status).toBe(200);
    expect(first.body.user.email).toBe(facultyEmail);

    const second = await request(app).get("/auth/me").set("Cookie", cookie);
    expect(second.status).toBe(200);
    expect(second.body.user.email).toBe(facultyEmail);
  });
});

describe("POST /auth/logout", () => {
  it("clears the session cookie so /auth/me is rejected afterward", async () => {
    const loginRes = await request(app).post("/auth/login").send({ email: facultyEmail, password });
    const cookie = extractCookie(loginRes);

    const logoutRes = await request(app).post("/auth/logout").set("Cookie", cookie);
    expect(logoutRes.status).toBe(204);

    const clearedCookie = extractCookie(logoutRes);
    const meRes = await request(app).get("/auth/me").set("Cookie", clearedCookie);
    expect(meRes.status).toBe(401);
  });
});

describe("role-based access control", () => {
  // A minimal harness app built from the real authenticate/requireRole middleware,
  // used to verify the RBAC chain end-to-end over HTTP without adding a
  // throwaway business route to the production app.
  const rbacApp = express();
  rbacApp.use(express.json());
  rbacApp.use(cookieParser());
  rbacApp.get("/faculty-only", authenticate, requireRole("faculty"), (_req, res) => {
    res.status(200).json({ ok: true });
  });
  rbacApp.use(notFoundHandler);
  rbacApp.use(errorHandler);

  it("allows a faculty user through a faculty-only route", async () => {
    const loginRes = await request(app).post("/auth/login").send({ email: facultyEmail, password });
    const cookie = extractCookie(loginRes);

    const res = await request(rbacApp).get("/faculty-only").set("Cookie", cookie);
    expect(res.status).toBe(200);
  });

  it("blocks a student user from a faculty-only route", async () => {
    const loginRes = await request(app).post("/auth/login").send({ email: studentEmail, password });
    const cookie = extractCookie(loginRes);

    const res = await request(rbacApp).get("/faculty-only").set("Cookie", cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("blocks an unauthenticated request from a faculty-only route", async () => {
    const res = await request(rbacApp).get("/faculty-only");
    expect(res.status).toBe(401);
  });
});
