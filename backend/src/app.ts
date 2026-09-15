import cors from "cors";
import express, { type Express } from "express";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { echoRouter } from "./routes/echo";
import { healthRouter } from "./routes/health";

export function createApp(): Express {
  const app = express();

  app.use(requestLogger);
  app.use(cors());
  app.use(express.json());

  app.use(healthRouter);
  app.use(echoRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
