import { z } from "zod";

export const signupSchema = z.object({
  email: z.email(),
  password: z.string().min(8, "password must be at least 8 characters").max(72),
  fullName: z.string().min(1).max(200),
  role: z.enum(["faculty", "student"]),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
