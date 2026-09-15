import type { NextFunction, Request, Response } from "express";
import { findCourseById, isCourseMember, type CourseRow } from "../db/courses.repo";
import { AppError } from "../errors/AppError";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      course?: CourseRow;
    }
  }
}

export async function requireCourseAccess(req: Request, _res: Response, next: NextFunction) {
  try {
    const course = await findCourseById(req.params.id);
    if (!course) {
      next(AppError.notFound("Course not found"));
      return;
    }

    const auth = req.auth;
    if (!auth) {
      next(new AppError(401, "UNAUTHENTICATED", "Authentication required"));
      return;
    }

    const isOwner = course.faculty_id === auth.sub;
    const isMember = isOwner || (await isCourseMember(course.id, auth.sub));
    if (!isMember) {
      next(AppError.notFound("Course not found"));
      return;
    }

    req.course = course;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireCourseOwner(req: Request, _res: Response, next: NextFunction) {
  if (!req.course || !req.auth || req.course.faculty_id !== req.auth.sub) {
    next(new AppError(403, "FORBIDDEN", "Only the owning faculty member can do this"));
    return;
  }
  next();
}
