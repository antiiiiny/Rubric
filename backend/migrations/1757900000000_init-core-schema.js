/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension("pgcrypto", { ifNotExists: true });

  pgm.createTable("users", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    email: { type: "text", notNull: true },
    password_hash: { type: "text", notNull: true },
    full_name: { type: "text", notNull: true },
    role: { type: "text", notNull: true, check: "role in ('faculty', 'student')" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("users", pgm.func("lower(email)"), { unique: true, name: "users_email_unique_idx" });

  pgm.createTable("courses", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    title: { type: "text", notNull: true },
    description: { type: "text" },
    faculty_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "cascade",
    },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("courses", "faculty_id");

  pgm.createTable("course_members", {
    course_id: {
      type: "uuid",
      notNull: true,
      references: "courses",
      onDelete: "cascade",
    },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "cascade",
    },
    joined_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("course_members", "course_members_pkey", {
    primaryKey: ["course_id", "user_id"],
  });
  pgm.createIndex("course_members", "user_id");
};

exports.down = (pgm) => {
  pgm.dropTable("course_members");
  pgm.dropTable("courses");
  pgm.dropTable("users");
};
