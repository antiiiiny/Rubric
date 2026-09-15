import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../errors/AppError";
import { requireRole } from "../middleware/auth";

function mockReq(auth?: { sub: string; role: "faculty" | "student" }): Request {
  return { auth } as unknown as Request;
}

describe("requireRole", () => {
  it("calls next with no error when the role matches", () => {
    const next = vi.fn() as NextFunction;
    requireRole("faculty")(mockReq({ sub: "u1", role: "faculty" }), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("calls next with a 403 AppError when the role does not match", () => {
    const next = vi.fn() as NextFunction;
    requireRole("faculty")(mockReq({ sub: "u1", role: "student" }), {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
  });

  it("calls next with a 401 AppError when there is no authenticated user", () => {
    const next = vi.fn() as NextFunction;
    requireRole("student")(mockReq(undefined), {} as Response, next);
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(401);
  });
});
