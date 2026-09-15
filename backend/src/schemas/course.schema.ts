import { z } from "zod";

export const createCourseSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export const enrollSchema = z.object({
  email: z.email(),
});
export type EnrollInput = z.infer<typeof enrollSchema>;
