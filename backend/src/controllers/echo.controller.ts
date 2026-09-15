import type { Request, Response } from "express";
import type { EchoRequest } from "../schemas/echo.schema";
import { echoMessage } from "../services/echo.service";

export function postEcho(req: Request, res: Response) {
  const body = req.body as EchoRequest;
  const result = echoMessage(body);
  res.status(200).json(result);
}
