/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("evaluations", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    answer_id: { type: "uuid", notNull: true, references: "answers", onDelete: "cascade" },
    model: { type: "text", notNull: true },
    overall_confidence: { type: "numeric", notNull: true },
    needs_faculty_review: { type: "boolean", notNull: true, default: false },
    failed: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("evaluations", "evaluations_answer_unique", { unique: ["answer_id"] });

  pgm.createTable("criterion_results", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    evaluation_id: { type: "uuid", notNull: true, references: "evaluations", onDelete: "cascade" },
    criterion_id: { type: "uuid", notNull: true, references: "rubric_criteria", onDelete: "cascade" },
    status: { type: "text", notNull: true, check: "status in ('covered', 'partial', 'missing')" },
    evidence: { type: "text" },
    confidence: { type: "numeric", notNull: true },
    reasoning: { type: "text", notNull: true },
    embedding_similarity: { type: "numeric", notNull: true },
  });
  pgm.createIndex("criterion_results", "evaluation_id");
};

exports.down = (pgm) => {
  pgm.dropTable("criterion_results");
  pgm.dropTable("evaluations");
};
