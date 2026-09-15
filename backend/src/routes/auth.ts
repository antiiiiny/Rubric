import { Router } from "express";
import { getMe, postLogin, postLogout, postSignup } from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { loginSchema, signupSchema } from "../schemas/auth.schema";
import { asyncHandler } from "../utils/asyncHandler";

export const authRouter = Router();

authRouter.post("/auth/signup", validateBody(signupSchema), asyncHandler(postSignup));
authRouter.post("/auth/login", validateBody(loginSchema), asyncHandler(postLogin));
authRouter.post("/auth/logout", postLogout);
authRouter.get("/auth/me", authenticate, asyncHandler(getMe));
