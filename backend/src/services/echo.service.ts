import type { EchoRequest } from "../schemas/echo.schema";

export interface EchoResult {
  original: string;
  transformed: string;
  length: number;
}

export function echoMessage(input: EchoRequest): EchoResult {
  const trimmed = input.message.trim();
  return {
    original: input.message,
    transformed: trimmed.toUpperCase(),
    length: trimmed.length,
  };
}
