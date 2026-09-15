import { pool } from "./pool";

export interface ConceptMasteryRow {
  concept: string;
  total_responses: string;
  covered_count: string;
  partial_count: string;
  missing_count: string;
}

export async function conceptMasteryForCourse(courseId: string): Promise<ConceptMasteryRow[]> {
  const result = await pool.query<ConceptMasteryRow>(
    `SELECT
       rc.name AS concept,
       COUNT(*) AS total_responses,
       COUNT(*) FILTER (WHERE cr.status = 'covered') AS covered_count,
       COUNT(*) FILTER (WHERE cr.status = 'partial') AS partial_count,
       COUNT(*) FILTER (WHERE cr.status = 'missing') AS missing_count
     FROM criterion_results cr
     JOIN evaluations e ON e.id = cr.evaluation_id
     JOIN answers a ON a.id = e.answer_id
     JOIN rubric_criteria rc ON rc.id = cr.criterion_id
     JOIN submissions s ON s.id = a.submission_id
     JOIN assessments ass ON ass.id = s.assessment_id
     WHERE ass.course_id = $1
     GROUP BY rc.name
     ORDER BY rc.name ASC`,
    [courseId],
  );
  return result.rows;
}
