import type { Request, Response } from "express";
import {
  addCourseMember,
  insertCourse,
  listCourseMembers,
  listCoursesForFaculty,
  listCoursesForStudent,
} from "../db/courses.repo";
import { findUserByEmail } from "../db/users.repo";
import { AppError } from "../errors/AppError";
import type { CreateCourseInput, EnrollInput } from "../schemas/course.schema";

export async function postCourse(req: Request, res: Response) {
  const body = req.body as CreateCourseInput;
  const course = await insertCourse({ ...body, facultyId: req.auth!.sub });
  res.status(201).json({ course });
}

export async function getCourses(req: Request, res: Response) {
  const auth = req.auth!;
  const courses =
    auth.role === "faculty" ? await listCoursesForFaculty(auth.sub) : await listCoursesForStudent(auth.sub);
  res.status(200).json({ courses });
}

export function getCourse(req: Request, res: Response) {
  res.status(200).json({ course: req.course });
}

export async function postEnroll(req: Request, res: Response) {
  const body = req.body as EnrollInput;
  const student = await findUserByEmail(body.email);
  if (!student || student.role !== "student") {
    throw AppError.badRequest("No student account found with that email");
  }
  await addCourseMember(req.course!.id, student.id);
  res.status(201).json({ enrolled: { id: student.id, email: student.email, fullName: student.full_name } });
}

export async function getCourseMembers(req: Request, res: Response) {
  const members = await listCourseMembers(req.course!.id);
  res.status(200).json({ members });
}
