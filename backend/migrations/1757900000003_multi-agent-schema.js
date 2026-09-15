/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn("evaluations", {
    conflict_occurred: { type: "boolean", notNull: true, default: false },
    feedback: { type: "jsonb" },
  });

  pgm.createTable("evaluation_runs", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    evaluation_id: { type: "uuid", notNull: true, references: "evaluations", onDelete: "cascade" },
    conflict_occurred: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("evaluation_runs", "evaluation_runs_evaluation_unique", {
    unique: ["evaluation_id"],
  });

  pgm.createTable("agent_results", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    run_id: { type: "uuid", notNull: true, references: "evaluation_runs", onDelete: "cascade" },
    agent_name: { type: "text", notNull: true },
    status: { type: "text", notNull: true, check: "status in ('ok', 'error')" },
    confidence: { type: "numeric" },
    summary: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("agent_results", "run_id");
};

exports.down = (pgm) => {
  pgm.dropTable("agent_results");
  pgm.dropTable("evaluation_runs");
  pgm.dropColumn("evaluations", ["conflict_occurred", "feedback"]);
};
