import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { authRouter } from "./routes/auth";
import { coursesRouter } from "./routes/courses";
import { echoRouter } from "./routes/echo";
import { healthRouter } from "./routes/health";

export function createApp(): Express {
  const app = express();

  app.use(requestLogger);
  app.use(cors({ origin: env.frontendUrl, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.use(healthRouter);
  app.use(echoRouter);
  app.use(authRouter);
  app.use(coursesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
