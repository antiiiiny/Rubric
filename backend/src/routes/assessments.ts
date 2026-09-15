import { Router } from "express";
import {
  getAssessment,
  getAssessments,
  getMySubmission,
  getSubmissions,
  postAssessment,
  postPublish,
  postQuestion,
  postSubmission,
} from "../controllers/assessments.controller";
import { authenticate, requireRole } from "../middleware/auth";
import { requireAssessmentAccess, requireAssessmentOwner } from "../middleware/assessmentAccess";
import { requireCourseAccess, requireCourseOwner } from "../middleware/courseAccess";
import { validateBody } from "../middleware/validate";
import {
  createAssessmentSchema,
  createQuestionSchema,
  submitAssessmentSchema,
} from "../schemas/assessment.schema";
import { asyncHandler } from "../utils/asyncHandler";

export const assessmentsRouter = Router();

assessmentsRouter.use("/courses/:id/assessments", authenticate);
assessmentsRouter.use("/assessments", authenticate);

assessmentsRouter.post(
  "/courses/:id/assessments",
  requireCourseAccess,
  requireCourseOwner,
  validateBody(createAssessmentSchema),
  asyncHandler(postAssessment),
);
assessmentsRouter.get(
  "/courses/:id/assessments",
  requireCourseAccess,
  asyncHandler(getAssessments),
);

assessmentsRouter.get(
  "/assessments/:assessmentId",
  requireAssessmentAccess,
  asyncHandler(getAssessment),
);
assessmentsRouter.post(
  "/assessments/:assessmentId/questions",
  requireAssessmentAccess,
  requireAssessmentOwner,
  validateBody(createQuestionSchema),
  asyncHandler(postQuestion),
);
assessmentsRouter.post(
  "/assessments/:assessmentId/publish",
  requireAssessmentAccess,
  requireAssessmentOwner,
  asyncHandler(postPublish),
);
assessmentsRouter.post(
  "/assessments/:assessmentId/submissions",
  requireAssessmentAccess,
  requireRole("student"),
  validateBody(submitAssessmentSchema),
  asyncHandler(postSubmission),
);
assessmentsRouter.get(
  "/assessments/:assessmentId/submissions/me",
  requireAssessmentAccess,
  requireRole("student"),
  asyncHandler(getMySubmission),
);
assessmentsRouter.get(
  "/assessments/:assessmentId/submissions",
  requireAssessmentAccess,
  requireAssessmentOwner,
  asyncHandler(getSubmissions),
);
