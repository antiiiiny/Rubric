import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app";

const app = createApp();

describe("POST /echo", () => {
  it("returns a transformed response for valid input", async () => {
    const res = await request(app).post("/echo").send({ message: "hello rubric" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      original: "hello rubric",
      transformed: "HELLO RUBRIC",
      length: 12,
    });
  });

  it("returns a clean 400 for missing message", async () => {
    const res = await request(app).post("/echo").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
    expect(res.body.error.message).toBe("Invalid request body");
  });

  it("returns a clean 400 for a message over the length limit", async () => {
    const res = await request(app)
      .post("/echo")
      .send({ message: "a".repeat(501) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });
});
