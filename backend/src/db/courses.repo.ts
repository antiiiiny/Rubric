import { pool } from "./pool";

export interface CourseRow {
  id: string;
  title: string;
  description: string | null;
  faculty_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface CourseMemberRow {
  course_id: string;
  user_id: string;
  joined_at: Date;
}

export async function insertCourse(input: {
  title: string;
  description?: string;
  facultyId: string;
}): Promise<CourseRow> {
  const result = await pool.query<CourseRow>(
    `INSERT INTO courses (title, description, faculty_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.title, input.description ?? null, input.facultyId],
  );
  return result.rows[0];
}

export async function findCourseById(id: string): Promise<CourseRow | null> {
  const result = await pool.query<CourseRow>(`SELECT * FROM courses WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function listCoursesForFaculty(facultyId: string): Promise<CourseRow[]> {
  const result = await pool.query<CourseRow>(
    `SELECT * FROM courses WHERE faculty_id = $1 ORDER BY created_at DESC`,
    [facultyId],
  );
  return result.rows;
}

export async function listCoursesForStudent(studentId: string): Promise<CourseRow[]> {
  const result = await pool.query<CourseRow>(
    `SELECT c.* FROM courses c
     JOIN course_members cm ON cm.course_id = c.id
     WHERE cm.user_id = $1
     ORDER BY c.created_at DESC`,
    [studentId],
  );
  return result.rows;
}

export async function isCourseMember(courseId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM course_members WHERE course_id = $1 AND user_id = $2`,
    [courseId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function addCourseMember(courseId: string, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO course_members (course_id, user_id) VALUES ($1, $2)
     ON CONFLICT (course_id, user_id) DO NOTHING`,
    [courseId, userId],
  );
}

export interface CourseMemberWithUser {
  user_id: string;
  email: string;
  full_name: string;
  joined_at: Date;
}

export async function listCourseMembers(courseId: string): Promise<CourseMemberWithUser[]> {
  const result = await pool.query<CourseMemberWithUser>(
    `SELECT u.id AS user_id, u.email, u.full_name, cm.joined_at
     FROM course_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.course_id = $1
     ORDER BY cm.joined_at ASC`,
    [courseId],
  );
  return result.rows;
}
