import { Router } from "express";
import { getConceptMastery } from "../controllers/analytics.controller";
import { authenticate } from "../middleware/auth";
import { requireCourseAccess, requireCourseOwner } from "../middleware/courseAccess";
import { asyncHandler } from "../utils/asyncHandler";

export const analyticsRouter = Router();

analyticsRouter.use("/courses/:id/analytics", authenticate);

analyticsRouter.get(
  "/courses/:id/analytics/concept-mastery",
  requireCourseAccess,
  requireCourseOwner,
  asyncHandler(getConceptMastery),
);
