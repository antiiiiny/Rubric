# Rubric Development Stages

This is the master implementation roadmap. It **must** be updated after every completed stage: mark status, add an implementation summary, record architectural decisions, record tests performed, record known limitations, update the next stage if reality diverged, and update overall project status. See [CLAUDE.md](CLAUDE.md) for how to work on the project generally.

**Overall project status: Stages 0–4 complete (fast/minimum-scope mode from here per explicit user request — functional over exhaustive). Foundation, auth, course management, and the quiz system (authoring, publishing, submission, MCQ auto-grading) are in place. Ready to begin Stage 5 (AI Evaluation Engine, single-path).**

---

## Stage 0 — Project Foundation
Status: COMPLETED (2026-09-15)

Objectives:
- Establish persistent project documentation (CLAUDE.md, stages.md, .claude/) so all future work has consistent context.
- Scaffold the npm-workspace monorepo (frontend + backend) and the standalone Python ai-service project.
- Get a trivial end-to-end health check working: frontend can call backend `/health`, backend can call ai-service `/health`.

Tasks:
- [x] Inspect repository (confirmed empty — no prior code to preserve).
- [x] Create `CLAUDE.md`.
- [x] Create `stages.md`.
- [x] Create `.claude/commands/next-stage.md`.
- [x] Root `package.json` with npm workspaces (`frontend`, `backend`).
- [x] `frontend/` — Next.js + TypeScript + Tailwind skeleton.
- [x] `backend/` — Express + TypeScript skeleton with a `/health` route.
- [x] `ai-service/` — FastAPI skeleton (own `pyproject.toml`/venv) with a `/health` route.
- [x] Root `.gitignore`, `.env.example`.
- [x] ESLint config for both frontend and backend workspaces; ruff for ai-service.
- [x] README with setup/run instructions.
- [x] First git commit.

Deliverables:
- Documentation set (CLAUDE.md, stages.md, `.claude/commands/next-stage.md`).
- Runnable skeleton for all three services, each independently startable, backend able to reach ai-service over HTTP.

Acceptance Criteria:
- `npm install` at root succeeds and installs both workspaces. ✅
- `npm run dev:backend` / `npm run dev:frontend` start without errors; ai-service starts via uvicorn under its own venv. ✅
- Backend `/health` returns 200 and successfully round-trips a call to ai-service `/health` (`aiService: "ok"`). ✅ Verified live: ai-service on :8000, backend on :4000, frontend on :3000, full chain confirmed via curl and browser fetch.
- `npm run build`, `npm run lint`, `npm run typecheck` all pass for both workspaces; `ruff check app` passes for ai-service. ✅
- No secrets committed; `.env.example` documents required variables. ✅

Dependencies: none (first stage).

Implementation notes:
- **Monorepo**: npm workspaces (`frontend`, `backend`) under root `package.json`; `ai-service/` is an independent Python project with its own `.venv` and `pyproject.toml` (editable install, `fastapi`, `uvicorn`, `pydantic`, `pydantic-settings`; dev extras `ruff`, `pytest`, `httpx`).
- **Frontend stack decision**: started with Next.js 14.2.5 as originally planned, but `npm audit` flagged it (and even 14.2.35) against a broad, serious advisory range including an unauthenticated RCE on Windows-hosted servers — directly relevant since this is a Windows dev machine. Upgraded to **Next.js 15.5.25 + React 19.0.0** (pinned exact, not caret) instead of jumping to Next 16, because `eslint-config-next@16` requires ESLint 9's flat-config system (a migration not worth taking on for Stage 0), while Next 15 still supports ESLint 8's `.eslintrc.json`. Residual `npm audit` findings are limited to Next's own internal bundled `postcss` (source-map/build-time tooling, not runtime-exposed) — accepted as low-risk rather than forcing the Next 16 flat-config migration prematurely.
- Hit a transient `next build` failure (`Minified React error #31`) while prerendering `/404`/`/500` during version churn (14→16→15 switches). Root cause was a stale/partially-resolved `node_modules` from the churn, not a real code or version-compat issue — a clean `rm -rf node_modules package-lock.json` + reinstall resolved it. Worth remembering if a similar error resurfaces after a dependency bump: try a clean reinstall before assuming a real incompatibility.
- Backend error-handling middleware requires an unused 4th `_next` param (Express convention for recognizing error handlers by arity) — added `argsIgnorePattern: "^_"` to the backend ESLint config rather than suppressing the rule entirely.
- Added `*.egg-info/` to `.gitignore` (Python editable-install build artifact, not meant to be committed).
- **Known limitation / flagged for user**: the working-directory `.gitignore` had a `.claude/` line appear on disk that this session did not add (likely an environment default). This means `.claude/commands/next-stage.md` is currently *not* tracked by git. Left as-is per policy on unexplained changes (flagged to the user rather than silently reverted) — revisit if `.claude/` content should be version-controlled going forward.
- Tests performed: `npm run build`, `npm run lint`, `npm run typecheck` at root (both workspaces); `ruff check app` in ai-service; live end-to-end run of all three services with real HTTP calls (not just unit-level) confirming the health-check chain.
- No automated test suite yet (none required at this stage — Stage 11 owns test coverage).

---

## Stage 1 — Backend Foundation
Status: COMPLETED (2026-09-15)

Objectives:
- Solid Express/TypeScript application structure that later stages build on: routing, centralized error handling, request validation, logging, config loading.

Tasks:
- [x] Express app factory with layered structure (routes/controllers/services/schemas).
- [x] Centralized error-handling middleware with consistent error response shape (`{ error: { code, message, details? } }`).
- [x] Request validation middleware (Zod schemas per route, via `validateBody`).
- [x] Structured logging (request id, level, no secrets in logs) via `pino` + `pino-http`.
- [x] Environment/config loading and validation at boot (Zod-validated env, fails fast on invalid/missing vars).

Deliverables: A backend that boots, validates its own config, and has a documented pattern for adding a new route with validation + error handling (the `echo` feature: `schemas/echo.schema.ts` → `services/echo.service.ts` → `controllers/echo.controller.ts` → `routes/echo.ts`).

Acceptance Criteria: A sample route demonstrating the full pattern (validated input → service → typed response, plus a deliberately invalid request returning a clean 4xx) is present and tested. ✅ `POST /echo`; 4 passing Vitest + Supertest tests covering the success path, missing-field 400, and over-length 400, plus an unmatched-route 404 test.

Dependencies: Stage 0 (backend skeleton must exist).

Implementation notes:
- **Error shape**: all errors respond as `{ error: { code, message, details? } }`. `AppError` (in `src/errors/AppError.ts`) is the only way application code should raise an HTTP-level error; anything else is caught by the catch-all `errorHandler` and logged + reported as a generic 500 (never leaks internals to the client).
- **Validation**: `validateBody(schema)` middleware parses `req.body` with Zod and replaces it with the parsed/typed value on success, or forwards an `AppError.badRequest` (400) with Zod's flattened field errors on failure — no manual `if` validation blocks in controllers.
- **Logging**: `pino-http` assigns a UUID per request (`x-request-id`, respecting an inbound header if the caller already set one), logs method/path/status/duration, and never logs the request body — avoids leaking submitted content (relevant later once request bodies carry student answers).
- **Env validation**: `src/config/env.ts` now validates via a Zod schema (`PORT`, `NODE_ENV`, `AI_SERVICE_URL`, `LOG_LEVEL`) instead of ad hoc fallback logic, and throws at boot on invalid config rather than failing later at first use.
- **Testing**: added Vitest + Supertest to the backend workspace (`npm run test` at root delegates to it). Tests build the Express app in-process (no network port needed) and assert on status codes + response bodies. `LOG_LEVEL=silent` is set in `vitest.config.mts` to keep test output readable.
- **Build hygiene**: `backend/tsconfig.json` now excludes `**/*.test.ts` and `src/__tests__` so test files don't leak into `dist/` (caught during verification — the first build attempt emitted compiled test files into the production build).
- Tests performed: `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test` all pass at the root. Live smoke test: booted the backend directly and curled `/health`, `POST /echo` (valid + invalid), and an unmatched route — confirmed correct status codes, response shapes, and request-id logging end to end.
- No known limitations carried forward; auth/DB (Stage 2) is the next real dependency for further backend work.

---

## Stage 2 — Database & Authentication
Status: COMPLETED (2026-09-15)

Objectives:
- Postgres schema/migrations for `users`, `courses`, `course_members`.
- JWT + bcrypt authentication (email/password), RBAC middleware distinguishing faculty vs. student.

Tasks:
- [x] Choose and configure a migration tool (node-pg-migrate).
- [x] `users`, `courses`, `course_members` tables with proper foreign keys/constraints.
- [x] Signup/login/logout endpoints; password hashing (bcryptjs).
- [x] JWT issuance, httpOnly cookie storage, expiry handling.
- [x] RBAC middleware (`requireRole('faculty' | 'student')`) applied to protected routes.
- [x] Basic frontend auth pages (login/signup) wired to the backend.

Deliverables: Working signup/login for both roles; protected routes reject unauthenticated/unauthorized requests.

Acceptance Criteria: A student cannot hit a faculty-only route (and vice versa); passwords are never stored/logged in plaintext; sessions persist across page reload via the httpOnly cookie. ✅ All verified — see implementation notes.

Dependencies: Stage 1.

Implementation notes:
- **Local Postgres via Docker Compose** (`docker-compose.yml`, root). The user's machine already runs a native Postgres service on port 5432, so the container is mapped to host port **5433** instead (`DATABASE_URL` in `.env`/`.env.example` updated accordingly) to avoid touching the existing native install.
- **Migrations**: node-pg-migrate, JS-format migration files in `backend/migrations/`. One migration (`1757900000000_init-core-schema`) creates `users`, `courses`, `course_members` with a `pgcrypto`-backed `gen_random_uuid()` default, a case-insensitive unique index on `users.email` (`lower(email)`, no citext extension needed), `ON DELETE CASCADE` from `courses.faculty_id` → `users.id` and from `course_members` → both `courses`/`users`, and a composite PK on `course_members(course_id, user_id)`. `npm run migrate:up`/`migrate:down` (root or backend) via `--envPath` pointed at the root `.env` (node-pg-migrate's own dotenv loading defaults to its cwd, which is `backend/`, not the repo root).
- **Password hashing**: `bcryptjs` (pure JS) rather than native `bcrypt`, to avoid a node-gyp native-compile dependency on Windows dev machines — acceptable performance trade-off at this scale, revisit only if profiling ever shows it matters.
- **Auth**: `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`. JWT (`jsonwebtoken`) signed with `sub`=user id, `role`=user role, 7-day expiry, delivered as an httpOnly, `sameSite=lax` cookie (`rubric_token`); `secure` flag tied to `env.isProduction`. `authenticate` middleware verifies the cookie and attaches `req.auth`; `requireRole(...roles)` gates by role, composing with `authenticate`.
- **CORS**: switched from wildcard `cors()` to `{ origin: env.frontendUrl, credentials: true }` — required for the browser to send/receive the httpOnly cookie cross-origin (frontend :3000, backend :4000); wildcard origin is incompatible with `credentials: true` per the CORS spec. Added `FRONTEND_URL` to env config/`.env.example`.
- **Security fix caught during verification**: the Stage 1 `pino-http` request logger was serializing the raw `Cookie` request header and `Set-Cookie` response header by default — which would have written live session JWTs into logs. Added `redact` paths (`req.headers.cookie`, `req.headers.authorization`, `res.headers["set-cookie"]`) to `requestLogger.ts` and confirmed via a live log inspection that both now show `[redacted]`.
- **Env validation**: `DATABASE_URL` and `JWT_SECRET` (min 16 chars) are now required (no default) in the Zod env schema — the app fails to boot without them, per the Stage 1 "fail fast" principle.
- **Frontend**: `/login` and `/signup` pages (App Router, client components), a small typed `lib/api.ts` fetch wrapper (`credentials: 'include'`, typed `ApiError`), and the home page now shows session state (signed-in user + logout button, or login/signup links) alongside the existing health widget.
- **Testing**: `requireRole` unit-tested with mocked req/res/next (no DB). `auth.test.ts` integration-tests signup (success, duplicate email, invalid payload), login (success, wrong password, unknown email), `/auth/me` (rejected with no cookie, accepted and **stable across two consecutive requests** — the "survives page reload" check — with a valid one), logout (clears cookie, subsequent `/auth/me` then rejected), and RBAC end-to-end over real HTTP using the production `authenticate`/`requireRole` middleware mounted on a small test-only harness app (avoids adding a throwaway business route to the real app just to test RBAC). Test users are created with UUID-suffixed emails and cleaned up via `deleteUserByEmail` in `afterAll`, run against the same dev Postgres database (a dedicated test database is deferred to Stage 11 — acceptable for now since tests clean up after themselves and use collision-proof emails).
- Tests performed: `npm run build`, `lint`, `typecheck`, `test` (20/20 passing) at root. Live smoke test: booted backend + frontend, exercised signup → `/auth/me` (with and without cookie) → logout → `/auth/me` (rejected) via curl; confirmed cookie flags (`HttpOnly`) and confirmed via `docker exec psql` that rows land correctly and get cleaned up. Frontend pages verified via curl (200 status, correct server-rendered markup for `/login` and `/signup`) and full `next build`/`lint`/`typecheck` — **not** interactively clicked in a real browser, since no browser-automation tool is available in this environment; the client-side session/logout behavior these pages depend on (`useEffect` + `getMe()`/`logout()`) is exercised indirectly through the passing API-level tests and manual curl checks, but hydration/interaction itself is unverified.
- **Known limitations**: no dedicated test database yet (see above); no password-reset or email-verification flow (out of scope for Stage 2); JWT has no refresh-token/rotation mechanism (7-day flat expiry is acceptable for the project's demo scope, revisit if session security becomes a concern later); frontend auth pages are functional but not yet part of a shared layout/nav (that lands with Stage 3's course navigation).

---

## Stage 3 — Course Management
Status: COMPLETED (2026-09-15) — minimum-viable scope

Objectives:
- Faculty can create/manage courses and add students; both roles can navigate course-scoped pages.

Tasks:
- [x] Course CRUD API (create + list + get) + faculty UI.
- [x] Enrollment: faculty adds a student by email (simplest reliable option; no invite-code flow).
- [x] Course list + course detail pages (frontend). Materials/analytics pages deferred — no content to show yet until Stage 4+.
- [x] Course-level authorization (`requireCourseAccess`/`requireCourseOwner` middleware; non-member gets 404, not 403, to avoid leaking course existence).

Deliverables: A faculty user can create a course and see it; a student can view courses they're enrolled in.

Acceptance Criteria: Course-scoped data isolation verified (a student not enrolled in course X cannot fetch course X's data). ✅

Implementation notes:
- `users`/`courses`/`course_members` tables already existed from Stage 2, so this stage was pure API+UI.
- Bug caught in testing: `coursesRouter.use(authenticate)` with no path prefix was intercepting *every* request through that router (including unmatched routes), breaking the global 404 handler — fixed by scoping it to `coursesRouter.use("/courses", authenticate)`.
- Scope cut for speed: no course editing/deletion, no student self-join by code, no Materials/Analytics pages yet (nothing to show until quizzes/assignments and evaluations exist — those land in later stages and will extend course-scoped navigation then).
- Tests: 9 new integration tests (create as faculty, block student create, enroll, cross-faculty enrollment blocked, member can view, non-member blocked, student's course list scoped correctly, owner can list members, non-owner blocked). 29/29 backend tests passing; frontend build/lint/typecheck clean.

Dependencies: Stage 2.

---

## Stage 4 — Quiz System
Status: COMPLETED (2026-09-15) — minimum-viable scope

Objectives:
- `assessments`, `questions`, `rubric_criteria`, `submissions`, `answers` schema and CRUD.
- Faculty can author MCQ and short-answer questions with rubric criteria/weights.
- Students can take a quiz and submit answers (stored only — no AI evaluation yet).

Tasks:
- [x] Migration `1757900000001_quiz-schema` — `assessments`, `questions`, `rubric_criteria`, `submissions`, `answers`.
- [x] Faculty quiz-authoring UI (question text, type, expected answer, concepts + weights for short answer; options + correct answer for MCQ).
- [x] Publish assessment state (draft → published, one-way; no unpublish — out of minimum scope).
- [x] Student quiz-taking UI, submission persistence.
- [x] MCQ auto-grading (deterministic — no AI needed for this type).

Deliverables: End-to-end quiz creation → publish → student submission flow, MCQs auto-graded. ✅

Acceptance Criteria: Rubric weights for a question sum sensibly (validated, e.g. must total 100%); a submitted short answer is retrievable by faculty; MCQ score is computed deterministically and correctly. ✅ All verified — see implementation notes.

Dependencies: Stage 3.

Implementation notes:
- **Schema**: `assessments` (belongs to a course, `type` fixed to `'quiz'` for now, `status` enum `draft`/`published`), `questions` (polymorphic MCQ/short-answer via nullable `mcq_options`/`mcq_correct_index`/`expected_answer` columns rather than a subtype table — simplest option for two question types), `rubric_criteria` (per short-answer question, `name` + `weight`), `submissions` (one per student per assessment, unique constraint), `answers` (per question, `mcq_selected_index`/`text_answer`, nullable `score`).
- **Validation**: Zod discriminated union (`assessment.schema.ts`) for MCQ vs. short-answer question creation, with `.refine()` checks that `correctIndex` is a valid option index and that rubric criteria weights sum to exactly 100 — rejected with 400 before touching the DB.
- **Auto-grading**: MCQ answers are scored deterministically at submission time (100/0) in `assessment.service.ts`. Short-answer `score` is left `null` ("pending AI evaluation") — Stage 5 fills this in; the frontend and submission-listing aggregation both treat `null` as "pending" rather than 0.
- **Access control reused the Stage 3 pattern**: `requireAssessmentAccess` loads the assessment + parent course, checks membership, and hides draft assessments from non-owners as 404 (not 403) — consistent with `requireCourseAccess`'s existence-hiding approach. `requireAssessmentOwner` gates authoring actions (add question, publish, list submissions) to the owning faculty member.
- **Known routing bug pattern (from Stage 3) deliberately avoided**: `assessmentsRouter.use(...)` is scoped per path prefix (`"/courses/:id/assessments"` and `"/assessments"`) rather than applied at router root, so it doesn't swallow unmatched routes / break the global 404 handler.
- **Answer-key sanitization**: `getAssessment` strips `mcq_correct_index` and `expected_answer` from the response for non-owners (students), so a student can inspect the network response without seeing the correct answer key.
- **Frontend**: extended `lib/api.ts` with typed assessment/question/submission functions following the existing `Course`/`createCourse` pattern. Course detail page now lists quizzes and lets faculty create one. New `app/assessments/[id]/page.tsx` renders a faculty authoring view (question list, add-question form with live weight-sum validation, publish button, submissions-with-scores list) or a student-taking view (answer form → submit → results view showing per-question score, "pending AI evaluation" for ungraded short answers) based on role — a single faculty member is always the course owner given enrollment is student-only, so `user.role === "faculty"` reliably implies ownership for any assessment the access-control layer let them load.
- Tests performed: `npm run build`, `lint`, `typecheck`, `test` all pass at root (46/46 backend tests, up from 29; two ESLint warnings in the controller's answer-key-stripping destructure fixed by adding `varsIgnorePattern: "^_"` to the backend ESLint config alongside the existing `argsIgnorePattern`). 17 new integration tests in `assessments.test.ts`: create assessment (faculty-only), rubric weight-sum rejection, add MCQ + short-answer questions, draft hidden from non-owner as 404, publish, non-member blocked from published assessment, answer key hidden from student / visible to faculty, submission with correct MCQ auto-grading (100) and short-answer left null, duplicate submission blocked, student retrieves own submission, non-member submission blocked (404), faculty lists submissions with scores, student blocked from listing all submissions (403). Live end-to-end curl smoke test additionally confirmed the full flow (signup → course → enroll → create quiz → add MCQ + short-answer → publish → student views sanitized questions → submits → faculty lists submission with score) against the real dev Postgres database.
- Frontend build/lint/typecheck pass; **not** interactively verified in a browser (no browser-automation tool available in this environment) — the UI logic (form state, role branching, weight-sum validation) is exercised only by TypeScript's type-checking and manual reasoning, not by clicking through it.
- **Known limitations**: no unpublish/edit-after-publish flow; no question deletion/reordering UI; no per-answer feedback beyond raw score yet (arrives with Stage 5 AI evaluation); assessment `type` is hardcoded to `'quiz'` (assignment/document type comes in Stage 7); total score aggregation is a simple average of per-answer scores, not yet weighted by anything beyond the rubric criteria already baked into short-answer scoring (revisit if per-question weighting within an assessment becomes a requirement).

---

## Stage 5 — AI Evaluation Engine (single-path)
Status: NOT STARTED

Objectives:
- Build and prove the single-LLM structured evaluation path before introducing multi-agent orchestration, per the mandated progression: basic rubric evaluation → semantic similarity → LLM structured evaluation.

Tasks:
- ai-service: embedding generation + similarity scoring against rubric concepts.
- ai-service: single LLM call (Groq) that takes rubric + submission + embedding evidence and returns a schema-validated structured evaluation (Pydantic).
- backend: endpoint to trigger evaluation for a short-answer submission, persist `evaluations` + `criterion_results`.
- Deterministic score aggregation in the backend from criterion-level AI results, using faculty weights (not LLM-computed totals).
- Basic faculty view of an evaluation result (score, per-criterion status, evidence).

Deliverables: A short-answer submission can be evaluated end-to-end (single LLM pass) and the result displayed to faculty and student.

Acceptance Criteria: Evaluation output always validates against the schema (malformed LLM output is caught and retried/flagged, never silently trusted); score is computed deterministically from criterion results and faculty weights, not asserted directly by the LLM.

Dependencies: Stage 4.

---

## Stage 6 — LangGraph Multi-Agent Evaluation
Status: NOT STARTED

Objectives:
- Replace/extend the Stage 5 single-LLM path with the full LangGraph pipeline: parallel specialized evaluators, judge reconciliation, conditional conflict resolution.

Tasks:
- LangGraph graph: Load Rubric → Prepare Submission → parallel {Concept Evaluator, Accuracy Critic, Completeness Evaluator} → Aggregate → Judge → confidence/conflict conditional edge → (Normal: Feedback Agent) or (Conflict: Additional Critic → Judge → Feedback Agent).
- `evaluation_runs` + `agent_results` schema and persistence (per-agent status/result/confidence/timestamp).
- Faculty-facing evaluation detail view: per-agent results, disagreement flag, judge's reconciliation explanation.
- Routing thresholds for confidence/disagreement tuned and documented.

Deliverables: Multi-agent evaluation replacing the single-LLM path for short-answer questions, fully observable per run.

Acceptance Criteria: A deliberately ambiguous test answer triggers the conflict-resolution branch and is visibly flagged; a clear-cut answer takes the cheap path without invoking the additional critic; all agent outputs for a run are queryable.

Dependencies: Stage 5.

---

## Stage 7 — Assignment Evaluation
Status: NOT STARTED

Objectives:
- Extend evaluation to document-based assignment submissions (PDF/DOCX): section detection, content-to-rubric matching.

Tasks:
- File upload (type/size validated), safe parsing (PDF/DOCX text extraction, no code execution risk).
- Required-section detection against faculty-defined assignment structure.
- Reuse the Stage 6 evaluation pipeline per relevant section/criterion, with document content passed as clearly-delimited untrusted data (prompt-injection resistant).
- Faculty view of assignment evaluation: section presence, per-criterion results, missing/weak areas.

Deliverables: A student can upload a document assignment and receive a structured, section-aware evaluation.

Acceptance Criteria: A document missing a required section is correctly flagged as missing (not silently scored 0 without explanation); a malicious document containing prompt-injection text does not alter evaluator behavior (tested explicitly).

Dependencies: Stage 6.

---

## Stage 8 — Faculty Review
Status: NOT STARTED

Objectives:
- Full faculty override/approval workflow, preserving both AI and faculty-final results.

Tasks:
- Faculty review UI: approve, edit score, edit feedback, override individual criteria, add comments, mark reviewed.
- Backend: store AI result and faculty-final result as distinct, both retrievable; audit trail of who changed what and when.
- Student view updates to reflect faculty-reviewed status where applicable.

Deliverables: Faculty can review any AI evaluation and either approve or override it without destroying the original AI output.

Acceptance Criteria: After an override, both the original AI evaluation and the faculty-final result are independently queryable; student sees the faculty-final result once reviewed.

Dependencies: Stage 6 (and Stage 7 for assignment reviews).

---

## Stage 9 — Analytics
Status: NOT STARTED

Objectives:
- Class-wide concept mastery aggregation and misconception detection for faculty.

Tasks:
- Aggregation queries/views over `criterion_results` grouped by concept across a course/assessment.
- Faculty analytics UI: concept mastery table/chart, flagged common misconceptions (e.g. "37% struggled with X").

Deliverables: A faculty analytics page for a course showing concept-level mastery breakdown.

Acceptance Criteria: Aggregation numbers are verifiably correct against seeded test data; page performs reasonably for a realistic class size.

Dependencies: Stage 6 (needs evaluation data to aggregate).

---

## Stage 10 — UI/UX Polish
Status: NOT STARTED

Objectives:
- Full responsive/accessibility pass across all screens built so far; consistent professional visual language per CLAUDE.md UI/UX principles.

Tasks:
- Responsive layout audit (mobile/tablet/desktop).
- Accessibility audit (forms, contrast, keyboard nav).
- Empty-state and loading-state audit across all list/detail views.
- Visual consistency pass (typography, spacing, component reuse).

Deliverables: Polished UI across faculty and student flows.

Acceptance Criteria: No broken layouts at common breakpoints; forms are keyboard-navigable and labeled.

Dependencies: Stages 3–9 (polishing what exists).

---

## Stage 11 — Testing & Reliability
Status: NOT STARTED

Objectives:
- Automated test coverage per CLAUDE.md's Testing Expectations for backend, AI service, and frontend.

Tasks:
- Backend: auth, course creation, assessment creation, submission, rubric storage, evaluation persistence tests.
- AI service: covered/missing/partial concept, incorrect answer, semantically-equivalent-wording, evaluator disagreement, low-confidence routing, schema-validation-failure handling tests.
- Frontend: login, course navigation, quiz submission, assignment upload, results viewing, faculty review tests.
- CI wiring (if applicable) to run these on every change.

Deliverables: Test suites passing across all three layers.

Acceptance Criteria: All listed minimum test cases exist and pass; a broken evaluation schema or a broken auth check is caught by the suite, not manual testing.

Dependencies: Stages 1–9 (tests what exists).

---

## Stage 12 — Demo Preparation
Status: NOT STARTED

Objectives:
- Seed data and a scripted end-to-end demo matching the Section 20 flow (faculty creates course/quiz/rubric → student submits → multi-agent evaluation with a deliberate disagreement → judge reconciliation → feedback → student views results → faculty reviews/overrides → analytics shows misconceptions).

Tasks:
- Seed script: sample course, faculty/student accounts, a short-answer question with a rubric, and at least one submission engineered to trigger evaluator disagreement.
- Demo script/checklist walking through the full Section 20 flow.
- Final smoke test of the complete loop.

Deliverables: A repeatable, seeded demo environment and a step-by-step demo script.

Acceptance Criteria: The full Section 20 flow can be executed live without errors, end to end.

Dependencies: Stages 0–11.
