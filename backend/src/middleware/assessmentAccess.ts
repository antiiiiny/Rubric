import type { NextFunction, Request, Response } from "express";
import { findAssessmentById, type AssessmentRow } from "../db/assessments.repo";
import { findCourseById, isCourseMember } from "../db/courses.repo";
import { AppError } from "../errors/AppError";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      assessment?: AssessmentRow;
      isCourseOwner?: boolean;
    }
  }
}

export async function requireAssessmentAccess(req: Request, _res: Response, next: NextFunction) {
  try {
    const assessment = await findAssessmentById(req.params.assessmentId);
    if (!assessment) {
      next(AppError.notFound("Assessment not found"));
      return;
    }

    const course = await findCourseById(assessment.course_id);
    const auth = req.auth;
    if (!course || !auth) {
      next(AppError.notFound("Assessment not found"));
      return;
    }

    const isOwner = course.faculty_id === auth.sub;
    const isMember = isOwner || (await isCourseMember(course.id, auth.sub));
    if (!isMember) {
      next(AppError.notFound("Assessment not found"));
      return;
    }

    if (assessment.status === "draft" && !isOwner) {
      next(AppError.notFound("Assessment not found"));
      return;
    }

    req.assessment = assessment;
    req.isCourseOwner = isOwner;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAssessmentOwner(req: Request, _res: Response, next: NextFunction) {
  if (!req.isCourseOwner) {
    next(new AppError(403, "FORBIDDEN", "Only the owning faculty member can do this"));
    return;
  }
  next();
}
