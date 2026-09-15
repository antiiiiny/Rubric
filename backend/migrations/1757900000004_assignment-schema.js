/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.dropConstraint("assessments", "assessments_type_check", { ifExists: true });
  pgm.addConstraint("assessments", "assessments_type_check", {
    check: "type in ('quiz', 'assignment')",
  });

  pgm.dropConstraint("questions", "questions_type_check", { ifExists: true });
  pgm.addConstraint("questions", "questions_type_check", {
    check: "type in ('mcq', 'short_answer', 'document')",
  });

  pgm.createTable("assignment_sections", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    question_id: { type: "uuid", notNull: true, references: "questions", onDelete: "cascade" },
    name: { type: "text", notNull: true },
    required: { type: "boolean", notNull: true, default: true },
    order_index: { type: "integer", notNull: true, default: 0 },
  });
  pgm.createIndex("assignment_sections", "question_id");

  pgm.addColumn("answers", {
    original_filename: { type: "text" },
    section_check: { type: "jsonb" },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn("answers", ["original_filename", "section_check"]);
  pgm.dropTable("assignment_sections");

  pgm.dropConstraint("questions", "questions_type_check", { ifExists: true });
  pgm.addConstraint("questions", "questions_type_check", {
    check: "type in ('mcq', 'short_answer')",
  });

  pgm.dropConstraint("assessments", "assessments_type_check", { ifExists: true });
  pgm.addConstraint("assessments", "assessments_type_check", {
    check: "type in ('quiz')",
  });
};
