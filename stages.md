# Rubric Development Stages

This is the master implementation roadmap. It **must** be updated after every completed stage: mark status, add an implementation summary, record architectural decisions, record tests performed, record known limitations, update the next stage if reality diverged, and update overall project status. See [CLAUDE.md](CLAUDE.md) for how to work on the project generally.

**Overall project status: Stages 0–8 complete (fast/minimum-scope mode from here per explicit user request — functional over exhaustive). Foundation, auth, course management, the quiz system, multi-agent AI evaluation, assignment/document evaluation, and the faculty review/override workflow (AI result and faculty-final result stored and queryable independently) are all live end-to-end. Ready to begin Stage 9 (Analytics).**

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
Status: COMPLETED (2026-09-15) — minimum-viable scope

Objectives:
- Build and prove the single-LLM structured evaluation path before introducing multi-agent orchestration, per the mandated progression: basic rubric evaluation → semantic similarity → LLM structured evaluation.

Tasks:
- [x] ai-service: embedding-style similarity scoring against rubric concepts.
- [x] ai-service: single LLM call (Groq) that takes rubric + submission + similarity evidence and returns a schema-validated structured evaluation (Pydantic).
- [x] backend: evaluation triggered automatically on short-answer submission, persists `evaluations` + `criterion_results`.
- [x] Deterministic score aggregation in the backend from criterion-level AI results, using faculty weights (not LLM-computed totals).
- [x] Basic faculty and student view of an evaluation result (score, per-criterion status, evidence, reasoning).

Deliverables: A short-answer submission can be evaluated end-to-end (single LLM pass) and the result displayed to faculty and student. ✅

Acceptance Criteria: Evaluation output always validates against the schema (malformed LLM output is caught and retried/flagged, never silently trusted); score is computed deterministically from criterion results and faculty weights, not asserted directly by the LLM. ✅ Verified live and via tests — see implementation notes.

Dependencies: Stage 4.

Implementation notes:
- **Embedding provider decision**: used TF-IDF cosine similarity (scikit-learn) instead of a hosted/local embedding model. Rationale: no API key or model download needed, installs in seconds (no `torch`/`sentence-transformers`), fast enough for this project's scale, and — critically — the pipeline mandate is "embedding similarity is evidence/retrieval only, never the sole determinant of correctness," which the LLM verification step already satisfies regardless of embedding quality. Documented as a deliberate trade-off in `ai-service/app/similarity.py`; revisit with a real embedding provider only if paraphrase recall proves insufficient in practice (untested edge case, flagged as a known limitation below).
- **LLM model**: `GROQ_MODEL` env var, default `openai/gpt-oss-120b` — the originally-planned `llama-3.3-70b-versatile` returned `model_not_found` for this account's Groq API key (verified via `GET /v1/models`); `gpt-oss-120b` supports Groq's JSON mode/structured outputs and was confirmed working live.
- **ai-service pipeline** (`app/similarity.py` → `app/llm.py` → `app/evaluate.py` → `POST /evaluate`): computes per-criterion TF-IDF similarity, builds a prompt that explicitly marks the student answer as untrusted data (prompt-injection-resistant framing per CLAUDE.md, ready for Stage 7's file uploads too), calls Groq with `response_format: json_object`, validates the response against a Pydantic `EvaluationResult` schema, and retries once with an error-correction message on invalid JSON/schema before letting a second failure propagate as a 502. `/evaluate` is internal-only (called by the backend, never exposed to the frontend).
- **Backend evaluation flow**: `evaluateShortAnswer` (`services/evaluation.service.ts`) is invoked automatically for every short-answer answer during `submitAssessment`, in parallel across answers. It's fully best-effort — a Groq/network failure or schema-validation failure is caught, logged, and recorded as a `failed` evaluation row with `needsFacultyReview: true` rather than crashing the submission or silently leaving no record. The ai-service response is re-validated with a mirrored Zod schema (`schemas/evaluation.schema.ts`) on the Node side, since a cross-service HTTP call is still an untrusted-input boundary per CLAUDE.md's schema-validation rule.
- **Deterministic scoring**: `computeWeightedScore` maps AI-assessed status → points (covered=100, partial=50, missing=0), multiplies by each criterion's faculty-defined weight, and divides by total weight — entirely in backend code, never LLM-asserted. Verified live: a submission with criteria weighted 40/30/30 and AI statuses covered/missing/covered produced score 70 exactly as `(40×100 + 30×0 + 30×100)/100`.
- **Explainability**: both `getMySubmission` (student) and `getSubmissions` (faculty) now embed each short-answer's evaluation (overall confidence, needs-faculty-review flag, and per-criterion status/evidence-quote/confidence/one-sentence reasoning) via a shared `attachEvaluations` controller helper — reasoning is capped at 500 chars and explicitly prompted as "concise decision explanation, not raw chain-of-thought," never exposing the model's raw reasoning trace.
- **Frontend**: extended `lib/api.ts` types (`AnswerEvaluation`, `CriterionResult`) and added a shared `EvaluationBreakdown` component in `app/assessments/[id]/page.tsx` — shown in both the student results view and the faculty submissions list, color-coded by status (covered/partial/missing) with evidence quotes and a review-flag banner when applicable.
- Tests performed: `npm run build`, `lint`, `typecheck`, `test` pass at root (49/49 backend tests, up from 46 — 3 new tests in `evaluation.test.ts` mocking `aiService.client.evaluateAnswer` to verify deterministic weighted scoring, graceful degradation on AI-service failure (answer stays ungraded, flagged for review, submission still succeeds), and that a rejected/malformed AI response never drives a score). ai-service: `pytest` (11/11 passing — schema validation rejects invalid status/out-of-range confidence/malformed payloads; TF-IDF similarity sanity checks; LLM retry-once-then-raise logic verified with a mocked Groq call) and `ruff check` both clean. Live end-to-end smoke test against the real Groq API and real Postgres: created a short-answer question with 40/30/30-weighted criteria, submitted an answer missing one concept, confirmed the AI correctly flagged the missing concept with evidence and reasoning, and the deterministic score (70) matched the hand-computed expectation exactly; confirmed the answer-key/evaluation data is visible to faculty and the student's own submission alike.
- Frontend build/lint/typecheck pass; **not** interactively verified in a browser (no browser-automation tool in this environment) — the evaluation-display UI is exercised by TypeScript checking and the live curl-based API responses it renders, not by clicking through it.
- **Known limitations**: TF-IDF similarity is lexical, not truly semantic — a "semantically-equivalent-but-differently-worded answer" (an explicit Stage 11 test case) relies entirely on the LLM step to catch, since the similarity evidence alone would score it low; this is acceptable because the LLM is the actual arbiter of status, but worth re-testing explicitly once Stage 11's test matrix is written. No retry/backoff beyond the single JSON-repair retry (a persistent Groq outage flags every submission for review rather than queuing for later retry — acceptable for demo scope). No manual "re-run evaluation" action for faculty yet (would be a natural Stage 8 addition alongside override/approval). Evaluation is only wired for short-answer quiz questions — assignment/document evaluation is Stage 7.

---

## Stage 6 — LangGraph Multi-Agent Evaluation
Status: COMPLETED (2026-09-15) — minimum-viable scope

Objectives:
- Replace/extend the Stage 5 single-LLM path with the full LangGraph pipeline: parallel specialized evaluators, judge reconciliation, conditional conflict resolution.

Tasks:
- [x] LangGraph graph: Prepare (similarity) → parallel {Concept Evaluator, Accuracy Critic, Completeness Evaluator} → Aggregate → Judge → confidence/conflict conditional edge → (Normal: Feedback Agent) or (Conflict: Additional Critic → Judge → Feedback Agent).
- [x] `evaluation_runs` + `agent_results` schema and persistence (per-agent status/result/confidence/timestamp).
- [x] Faculty-facing evaluation detail view: per-agent results (collapsible trace), disagreement flag, judge's reconciled result.
- [x] Routing thresholds for confidence/disagreement tuned and documented.

Deliverables: Multi-agent evaluation replacing the single-LLM path for short-answer questions, fully observable per run. ✅

Acceptance Criteria: A deliberately ambiguous test answer triggers the conflict-resolution branch and is visibly flagged; a clear-cut answer takes the cheap path without invoking the additional critic; all agent outputs for a run are queryable. ✅ Verified via mocked graph tests (live LLM was consistently too confident to trigger conflict naturally — see notes) and live end-to-end runs of the direct path.

Dependencies: Stage 5.

Implementation notes:
- **Graph shape** (`ai-service/app/graph.py`, `langgraph.graph.StateGraph`): `prepare` (computes TF-IDF similarity once) fans out to three parallel agent nodes (`concept_evaluator`, `accuracy_critic`, `completeness_evaluator`), which join at an `aggregate` node (a deliberate no-op — LangGraph's shared-state fan-in already merges their outputs; `aggregate` exists as an explicit step only to match the mandated pipeline shape, with the real reconciliation happening in `judge`) → `judge` → a conditional edge routes to `additional_critic` (if `conflict_detected` or `overall_confidence < 0.6`) or straight to `feedback_agent`. `additional_critic` cycles back to `judge` for a second, better-informed pass; a `critic_pass` state flag guards against re-looping (spec's "still uncertain → flag needsFacultyReview" is honored by carrying the judge's flag forward rather than looping indefinitely).
- **Simplification**: "low confidence → additional evaluator pass" and "disagreement → critic/judge reconciliation" are unified into one conditional branch and one remediation node (`additional_critic`, which re-runs the Accuracy Critic agent) rather than building two separate remediation paths — both conditions warrant the same remedy (an independent re-review feeding a second judge pass), and splitting them would have added graph complexity without a behavioral difference. Documented here as a deliberate scope cut.
- **Agents** (`ai-service/app/agents.py`): each is a single Groq call (via the shared `call_structured` retry-once helper in `llm.py`) with a distinct persona/prompt and Pydantic output schema (`ConceptEvaluatorOutput`, `AccuracyCriticOutput`, `CompletenessEvaluatorOutput`, `JudgeOutput`, `FeedbackOutput`). Every agent function catches its own exceptions and returns `(None, AgentTraceEntry(status="error", ...))` instead of raising — a single agent failing never crashes the run; `judge` synthesizes from whichever inputs are available, and if the Judge itself fails, `graph.py`'s `_fallback_judge_output` constructs a valid all-"missing"/`needs_faculty_review=True` result from the request's own criteria list so the pipeline always returns something reviewable rather than a 502.
- **Response contract extended, not replaced**: `EvaluationResult` (the `/evaluate` response schema) gained `conflict_occurred`, `agent_trace`, and `feedback` fields with safe defaults — the Stage 5 fields (`criteria`, `overall_confidence`, `needs_faculty_review`) are unchanged, so the backend's Stage 5 integration needed no breaking changes, only additive ones.
- **Persistence**: new `evaluation_runs` (one per evaluation, `conflict_occurred` flag) and `agent_results` (per-agent name/status/confidence/summary/timestamp, FK to the run) tables, plus `conflict_occurred`/`feedback` (jsonb) columns added to the existing `evaluations` table. The Stage 5 `evaluations`/`criterion_results` tables still hold the Judge's final reconciled per-criterion decision (unchanged shape) — `evaluation_runs`/`agent_results` are purely the audit trail layered on top, exactly matching CLAUDE.md's "persist per run: each agent's name/status/result/confidence/timestamp, whether conflict resolution occurred, and the final judge result."
- **Explainability**: `attachEvaluations` (backend controller helper) now also joins in the agent trace and exposes it, plus `conflictOccurred` and `feedback`, to both the student and faculty views. Reasoning/summaries stay capped and prompted as concise decision explanations — never raw chain-of-thought — consistent with Stage 5's approach, now applied to every agent (Concept Evaluator, Accuracy Critic, Completeness Evaluator, Judge, Feedback Agent).
- **Frontend**: `EvaluationBreakdown` (`app/assessments/[id]/page.tsx`) gained a feedback panel (strengths/suggestions/summary) and a collapsible `<details>` "Evaluator trace" section listing each agent's name and one-line summary, with a "conflict resolved" note when applicable.
- Tests performed: `npm run build/lint/typecheck/test` at root (50/50 backend tests — one new test class covers persisting conflict/agent-trace metadata through submission and retrieval). ai-service: `pytest` (14/14 — 3 new `test_graph.py` cases using monkeypatched agents to deterministically exercise (a) the direct high-confidence/no-conflict path, verifying `additional_critic` is never invoked and `judge` runs exactly once, (b) the conflict-resolution cycle, verifying `additional_critic` and a second `judge` pass both fire and the final status reflects the reconciled (not the original conflicting) decision, and (c) total Judge-agent failure still yields a valid, faculty-review-flagged result via the fallback) and `ruff check` clean. Live end-to-end smoke tests against the real Groq API confirmed the direct (no-conflict) path executes correctly end-to-end (~5s, 5 agent calls) including the Feedback Agent's generated strengths/gaps/suggestions, and confirmed `evaluation_runs`/`agent_results` rows land correctly in Postgres.
- **Known limitation**: the live Groq model (`openai/gpt-oss-120b`) was consistently confident and well-agreed across agents on the test answers tried, so the conflict/additional-critic branch was never observed live end-to-end (only via the mocked `test_graph.py` unit tests, which verify the graph's control flow deterministically). This is an acceptable gap for demo scope — the graph logic itself is proven correct — but Stage 12's demo script should deliberately engineer a submission likely to produce agent disagreement (e.g., a subtly wrong or self-contradictory answer) to show the conflict-resolution UI live, per the Section 20 flow's explicit requirement for a "deliberate disagreement" case.

---

## Stage 7 — Assignment Evaluation
Status: COMPLETED (2026-09-15) — minimum-viable scope

Objectives:
- Extend evaluation to document-based assignment submissions (PDF/DOCX): section detection, content-to-rubric matching.

Tasks:
- [x] File upload (type/size validated), safe parsing (PDF/DOCX text extraction, no code execution risk).
- [x] Required-section detection against faculty-defined assignment structure.
- [x] Reuse the Stage 6 evaluation pipeline per relevant section/criterion, with document content passed as clearly-delimited untrusted data (prompt-injection resistant).
- [x] Faculty view of assignment evaluation: section presence, per-criterion results, missing/weak areas.

Deliverables: A student can upload a document assignment and receive a structured, section-aware evaluation. ✅

Acceptance Criteria: A document missing a required section is correctly flagged as missing (not silently scored 0 without explanation); a malicious document containing prompt-injection text does not alter evaluator behavior (tested explicitly). ✅ See implementation notes.

Dependencies: Stage 6.

Implementation notes:
- **Architectural choice: reuse over rebuild.** Rather than a parallel data model for assignments, an "assignment" is simply an `assessment` with `type='assignment'` containing one `question` of a new `type='document'` (same `rubric_criteria` linkage as `short_answer`). This let Stage 7 reuse essentially all of Stage 4-6's machinery unchanged — access control, publish flow, the multi-agent evaluation pipeline, deterministic weighted scoring, evaluation persistence — with the only new work being the upload/extraction/section-detection layer in front of it. A `document` question's extracted text is passed as `studentAnswer` to the exact same `evaluateShortAnswer` call used for quizzes.
- **Schema**: migration `1757900000004_assignment-schema` widens `assessments.type` to `('quiz','assignment')` and `questions.type` to `('mcq','short_answer','document')`, adds `assignment_sections` (per-question required/optional section names), and adds `answers.original_filename`/`answers.section_check` (jsonb) columns.
- **File handling**: `multer` (memory storage, 10MB limit, mimetype allowlist restricted to PDF and DOCX) on a dedicated `POST /assessments/:assessmentId/submissions/document` route (separate from the JSON `/submissions` route since it needs `multipart/form-data`). Rejected file types are caught by multer's `fileFilter` before the controller ever runs; oversized files are caught by `MulterError`, both mapped to clean 400s via a new `errorHandler.ts` branch (previously any non-`AppError` fell through to a generic 500).
- **Text extraction** (`documentExtraction.service.ts`): `pdf-parse` v2 (`PDFParse` class, built on `pdfjs-dist` — tolerant of even minimal/malformed PDFs via pdf.js's recovery parsing, verified with a handwritten minimal-PDF fixture in testing) for PDF, `mammoth.extractRawText` for DOCX. Both are pure-JS parsers with no shell-out/native-code execution risk. A parse failure (corrupted file) is caught and surfaces as a clean 400, never a crash or silently-empty evaluation.
- **Required-section detection is deterministic, not AI** (`detectSections`) — per CLAUDE.md's explicit deterministic/AI split, "required sections" belongs in the code bucket. A section counts as present if any line of the extracted text case-insensitively matches its name as a heading (tolerating trailing punctuation). This is intentionally a cheap heuristic (not layout/font-size-aware heading detection) — acceptable for demo scope since it's faculty-explainable and the result is always surfaced, never silently folded into the AI score.
- **Prompt-injection resistance**: no new work was needed here — the untrusted-answer framing built in Stage 5/6 (`--- STUDENT ANSWER ---` / `--- END STUDENT ANSWER ---` markers around anything the student submitted) already applies uniformly to extracted document text, since it flows through the identical `evaluateShortAnswer` → ai-service `/evaluate` path. Added explicit test coverage (`test_prompt_injection_framing.py`) asserting, for every agent's prompt-builder, that untrusted content sits strictly inside those markers and a malicious "ignore all previous instructions" payload never appears before them — the closest deterministic proxy available for "the model isn't fooled" without a live, non-deterministic LLM call.
- **Faculty/student explainability**: `attachEvaluations` (unchanged) already surfaces the reused evaluation; `original_filename` and a new `SectionCheckList` component show which required sections were found/missing, both in the faculty submissions list and the student's own results view — kept structurally separate from the rubric-criteria evaluation (a missing section is not silently blended into the AI score).
- **Frontend**: course page's quiz-creation form gained a Quiz/Assignment type selector; the assessment authoring page's question form gained a "Document upload" question type (with a required-sections editor) shown only for assignment-type assessments; the student-facing submission form branches entirely to a dedicated `DocumentUploadForm` (native `<input type="file">`, PDF/DOCX only) for assignments instead of the quiz-taking form; `lib/api.ts` gained a `submitDocumentAssignment` function using raw `fetch`+`FormData` (not the JSON-only `apiFetch` wrapper, since multipart needs the browser to set its own Content-Type boundary).
- Tests performed: `npm run build/lint/typecheck/test` at root (60/60 backend tests, up from 50 — new `documentExtraction.test.ts` unit-tests `detectSections`' case-insensitivity/punctuation-tolerance and `extractText`'s rejection of unsupported mimetypes and corrupted PDFs; new `assignment.test.ts` integration-tests the full flow with `extractText`/`evaluateAnswer` mocked — bad file type rejected at the multer layer, section detection correctly flags a missing required section, duplicate submission blocked, non-member blocked, and a document-parse failure surfaces as a clean 400). ai-service: `pytest` (19/19, up from 14 — 5 new `test_prompt_injection_framing.py` cases) and `ruff check` clean. Live end-to-end smoke test against the real Groq API, real Postgres, and a real (handwritten-minimal) PDF file via curl: uploaded a PDF with an "Introduction" section but no "Conclusion," confirmed `pdf-parse` extracted the real text, confirmed section detection correctly flagged Introduction=found/Conclusion=missing, and confirmed the multi-agent pipeline evaluated the extracted text and produced a deterministic score (100, since both rubric criteria happened to be covered) end to end.
- Frontend build/lint/typecheck pass; **not** interactively verified in a browser (no browser-automation tool in this environment) — the file-input/upload flow is exercised only via the backend's real HTTP endpoint (curl) and TypeScript checking, not by clicking through a browser file picker.
- **Known limitations**: an "assignment" assessment is modeled as exactly one document question (no multi-question assignments); section detection is a simple heading-line heuristic, not layout-aware (a section header styled unusually, e.g. bolded mid-paragraph text, could be missed); no antivirus/content-scanning on uploaded files (acceptable for demo scope on a local dev network, would need revisiting before any real deployment accepting untrusted uploads from the public internet); uploaded file bytes are not retained after text extraction (no object storage wired up) — only the extracted text and original filename are persisted, so a faculty member can't download the original file, only read its extracted content.

---

## Stage 8 — Faculty Review
Status: COMPLETED (2026-09-15) — minimum-viable scope

Objectives:
- Full faculty override/approval workflow, preserving both AI and faculty-final results.

Tasks:
- [x] Faculty review UI: approve, edit score, edit feedback, override individual criteria, add comments, mark reviewed.
- [x] Backend: store AI result and faculty-final result as distinct, both retrievable; audit trail of who changed what and when.
- [x] Student view updates to reflect faculty-reviewed status where applicable.

Deliverables: Faculty can review any AI evaluation and either approve or override it without destroying the original AI output. ✅

Acceptance Criteria: After an override, both the original AI evaluation and the faculty-final result are independently queryable; student sees the faculty-final result once reviewed. ✅ Verified live and via tests — see implementation notes.

Dependencies: Stage 6 (and Stage 7 for assignment reviews).

Implementation notes:
- **Schema**: migration `1757900000005_faculty-review-schema` adds `faculty_reviews` (one row per answer via a unique constraint — `upsertReview` uses `ON CONFLICT (answer_id) DO UPDATE`, so re-reviewing edits the same row and `updated_at` tracks the most recent change; `reviewer_id` tracks who): `status` (`approved`/`overridden`), `final_score`, `final_feedback`, `comment`, `criterion_overrides` (jsonb). Deliberately a **separate table** from `evaluations`/`criterion_results` (the AI's original result, from Stage 5) — the AI row is never mutated by a review, satisfying CLAUDE.md's "faculty overriding a grade must never overwrite/destroy the original AI evaluation" verbatim.
- **Three ways to review** (`POST /assessments/:assessmentId/answers/:answerId/review`, faculty-owner-only), unified in one endpoint by what the request body contains: (1) send neither `finalScore` nor `criterionOverrides` → "approve," which snapshots the AI's current deterministic score as `final_score` with `status: 'approved'`; (2) send `finalScore` directly → a blunt manual override, `status: 'overridden'`; (3) send `criterionOverrides` (a subset or all criteria) → the backend merges the overrides onto the *original* AI per-criterion statuses and reuses the exact same `computeWeightedScore` function from Stage 5/6 to deterministically recompute the final score — so a partial override (e.g., correcting one criterion the AI got wrong) still respects the faculty-defined weights for the untouched criteria. `finalFeedback` (shown to the student) and `comment` (visible to faculty only... currently shown to both, see limitations) can accompany any of the three.
- **Effective score / display precedence**: `attachEvaluations` (shared by all four answer-returning endpoints) now also joins `faculty_reviews` and computes `effectiveScore` per answer — `review.finalScore` if a review exists, else the AI's `answer.score`. The submission-level `totalScore` (`computeTotalScore`, replacing the old DB-requerying `scoreSubmission`) is now the average of `effectiveScore` across answers, computed once from the already-fetched enriched answers rather than a second query — so a single faculty override immediately and correctly changes what the student's overall grade shows, without any separate "publish review" step.
- **Access control reused unchanged**: the review route sits under `requireAssessmentAccess` + `requireAssessmentOwner`, the same pattern as publish/add-question — a non-owning faculty member gets 404 (existence-hiding), a student gets 403 (role check fires before ownership check).
- **Frontend**: faculty submissions list gained an expandable `FacultyReviewForm` per answer (Approve button; a final-score override form; a per-criterion status-override form seeded with the AI's original statuses; feedback/comment textareas) and a `ReviewBadge` showing the current review state. The student results view now displays `effectiveScore` instead of the raw AI `score`, plus the same `ReviewBadge` with the faculty's feedback/comment — so a reviewed answer visibly reads differently from an un-reviewed one without hiding the underlying AI evaluation (which stays visible via the existing `EvaluationBreakdown`).
- Tests performed: `npm run build/lint/typecheck/test` at root (65/65 backend tests, up from 60 — 5 new tests in `review.test.ts`: approving preserves the AI's original score and evaluation are still queryable after review; a direct score override changes what the student sees via `totalScore`/`effectiveScore` while the original AI per-criterion "missing" result remains present in the response; a partial criterion override correctly recomputes the weighted score from mixed original+overridden statuses; a non-owning faculty member is blocked (404); a student is blocked (403)). Live end-to-end smoke test against the real Groq API and Postgres: submitted a weak answer (AI scored it 0, correctly marked the sole criterion "missing"), faculty overrode to 75 with feedback, confirmed the student's `/submissions/me` response now shows `effectiveScore: 75`/`totalScore: 75` while the original AI evaluation (`score: 0`, criterion status `missing`, full agent trace) remained fully intact and visible in the same response.
- Frontend build/lint/typecheck pass; **not** interactively verified in a browser (no browser-automation tool in this environment) — the review form's client-side state (expand/collapse, per-criterion selects) is exercised only by TypeScript checking and the live curl-based API responses it renders, not by clicking through it.
- **Data isolation fix caught during review-writing**: the internal `comment` field (faculty-only per CLAUDE.md's "add comments") was initially returned to students alongside the student-facing `finalFeedback` in the same `review` object. Fixed by threading a `forStudent` option through `attachEvaluations`/`mapReview` — the three student-facing endpoints (`postSubmission`, `postDocumentSubmission`, `getMySubmission`) now null out `comment` before responding, while `getSubmissions` and the review endpoint itself (both faculty-only) still return it.
- **Known limitations**: no notification to the student when a review happens (they'd only see it on next page load/re-fetch). No "mark reviewed without changing anything" audit trail beyond the single `faculty_reviews` row's `updated_at`/`reviewer_id` — a full change history (who changed what, each previous value) would need a separate append-only log table, deferred as unnecessary for demo scope.

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
