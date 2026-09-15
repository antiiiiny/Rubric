import { Router } from "express";
import { env } from "../config/env";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  let aiService: "ok" | "unreachable" = "unreachable";

  try {
    const response = await fetch(`${env.aiServiceUrl}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) {
      aiService = "ok";
    }
  } catch {
    aiService = "unreachable";
  }

  res.json({
    status: "ok",
    service: "backend",
    aiService,
    timestamp: new Date().toISOString(),
  });
});
