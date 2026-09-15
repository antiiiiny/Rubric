import { z } from "zod";

export const echoRequestSchema = z.object({
  message: z.string().min(1, "message must not be empty").max(500, "message must be 500 characters or fewer"),
});

export type EchoRequest = z.infer<typeof echoRequestSchema>;
