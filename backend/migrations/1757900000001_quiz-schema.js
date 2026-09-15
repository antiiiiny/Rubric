/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("assessments", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    course_id: { type: "uuid", notNull: true, references: "courses", onDelete: "cascade" },
    title: { type: "text", notNull: true },
    type: { type: "text", notNull: true, default: "quiz", check: "type in ('quiz')" },
    status: { type: "text", notNull: true, default: "draft", check: "status in ('draft', 'published')" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("assessments", "course_id");

  pgm.createTable("questions", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    assessment_id: { type: "uuid", notNull: true, references: "assessments", onDelete: "cascade" },
    type: { type: "text", notNull: true, check: "type in ('mcq', 'short_answer')" },
    prompt: { type: "text", notNull: true },
    order_index: { type: "integer", notNull: true, default: 0 },
    mcq_options: { type: "jsonb" },
    mcq_correct_index: { type: "integer" },
    expected_answer: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("questions", "assessment_id");

  pgm.createTable("rubric_criteria", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    question_id: { type: "uuid", notNull: true, references: "questions", onDelete: "cascade" },
    name: { type: "text", notNull: true },
    weight: { type: "integer", notNull: true },
    order_index: { type: "integer", notNull: true, default: 0 },
  });
  pgm.createIndex("rubric_criteria", "question_id");

  pgm.createTable("submissions", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    assessment_id: { type: "uuid", notNull: true, references: "assessments", onDelete: "cascade" },
    student_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    submitted_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("submissions", "submissions_assessment_student_unique", {
    unique: ["assessment_id", "student_id"],
  });
  pgm.createIndex("submissions", "student_id");

  pgm.createTable("answers", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    submission_id: { type: "uuid", notNull: true, references: "submissions", onDelete: "cascade" },
    question_id: { type: "uuid", notNull: true, references: "questions", onDelete: "cascade" },
    mcq_selected_index: { type: "integer" },
    text_answer: { type: "text" },
    score: { type: "numeric" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("answers", "answers_submission_question_unique", {
    unique: ["submission_id", "question_id"],
  });
};

exports.down = (pgm) => {
  pgm.dropTable("answers");
  pgm.dropTable("submissions");
  pgm.dropTable("rubric_criteria");
  pgm.dropTable("questions");
  pgm.dropTable("assessments");
};
