import "dotenv/config";

interface Env {
  port: number;
  nodeEnv: string;
  aiServiceUrl: string;
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env: Env = {
  port: Number(requireEnv("PORT", "4000")),
  nodeEnv: requireEnv("NODE_ENV", "development"),
  aiServiceUrl: requireEnv("AI_SERVICE_URL", "http://localhost:8000"),
};
