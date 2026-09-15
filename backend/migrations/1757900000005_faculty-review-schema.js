/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("faculty_reviews", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    answer_id: { type: "uuid", notNull: true, references: "answers", onDelete: "cascade" },
    reviewer_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    status: { type: "text", notNull: true, check: "status in ('approved', 'overridden')" },
    final_score: { type: "numeric" },
    final_feedback: { type: "text" },
    comment: { type: "text" },
    criterion_overrides: { type: "jsonb" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("faculty_reviews", "faculty_reviews_answer_unique", { unique: ["answer_id"] });
};

exports.down = (pgm) => {
  pgm.dropTable("faculty_reviews");
};
