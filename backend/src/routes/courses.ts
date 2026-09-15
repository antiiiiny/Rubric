import { Router } from "express";
import {
  getCourse,
  getCourseMembers,
  getCourses,
  postCourse,
  postEnroll,
} from "../controllers/courses.controller";
import { authenticate, requireRole } from "../middleware/auth";
import { requireCourseAccess, requireCourseOwner } from "../middleware/courseAccess";
import { validateBody } from "../middleware/validate";
import { createCourseSchema, enrollSchema } from "../schemas/course.schema";
import { asyncHandler } from "../utils/asyncHandler";

export const coursesRouter = Router();

coursesRouter.use("/courses", authenticate);

coursesRouter.post(
  "/courses",
  requireRole("faculty"),
  validateBody(createCourseSchema),
  asyncHandler(postCourse),
);
coursesRouter.get("/courses", asyncHandler(getCourses));
coursesRouter.get("/courses/:id", requireCourseAccess, getCourse);
coursesRouter.get(
  "/courses/:id/members",
  requireCourseAccess,
  requireCourseOwner,
  asyncHandler(getCourseMembers),
);
coursesRouter.post(
  "/courses/:id/members",
  requireCourseAccess,
  requireCourseOwner,
  validateBody(enrollSchema),
  asyncHandler(postEnroll),
);
