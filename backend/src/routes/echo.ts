import { Router } from "express";
import { postEcho } from "../controllers/echo.controller";
import { validateBody } from "../middleware/validate";
import { echoRequestSchema } from "../schemas/echo.schema";

export const echoRouter = Router();

echoRouter.post("/echo", validateBody(echoRequestSchema), postEcho);
