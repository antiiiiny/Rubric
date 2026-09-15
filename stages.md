# Rubric Development Stages

This is the master implementation roadmap. It **must** be updated after every completed stage: mark status, add an implementation summary, record architectural decisions, record tests performed, record known limitations, update the next stage if reality diverged, and update overall project status. See [CLAUDE.md](CLAUDE.md) for how to work on the project generally.

**Overall project status: Stage 0 complete. Monorepo scaffolding in place; frontend, backend, and ai-service all build, lint, and talk to each other over HTTP. Ready to begin Stage 1.**

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
Status: NOT STARTED

Objectives:
- Solid Express/TypeScript application structure that later stages build on: routing, centralized error handling, request validation, logging, config loading.

Tasks:
- Express app factory with layered structure (routes/controllers/services).
- Centralized error-handling middleware with consistent error response shape.
- Request validation middleware (e.g. Zod schemas per route).
- Structured logging (request id, level, no secrets in logs).
- Environment/config loading and validation at boot (fail fast on missing required env vars).

Deliverables: A backend that boots, validates its own config, and has a documented pattern for adding a new route with validation + error handling.

Acceptance Criteria: A sample route demonstrating the full pattern (validated input → service → typed response, plus a deliberately invalid request returning a clean 4xx) is present and tested.

Dependencies: Stage 0 (backend skeleton must exist).

---

## Stage 2 — Database & Authentication
Status: NOT STARTED

Objectives:
- Postgres schema/migrations for `users`, `courses`, `course_members`.
- JWT + bcrypt authentication (email/password), RBAC middleware distinguishing faculty vs. student.

Tasks:
- Choose and configure a migration tool.
- `users`, `courses`, `course_members` tables with proper foreign keys/constraints.
- Signup/login/logout endpoints; password hashing with bcrypt.
- JWT issuance, httpOnly cookie storage, refresh/expiry handling.
- RBAC middleware (`requireRole('faculty' | 'student')`) applied to protected routes.
- Basic frontend auth pages (login/signup) wired to the backend.

Deliverables: Working signup/login for both roles; protected routes reject unauthenticated/unauthorized requests.

Acceptance Criteria: A student cannot hit a faculty-only route (and vice versa); passwords are never stored/logged in plaintext; sessions persist across page reload via the httpOnly cookie.

Dependencies: Stage 1.

---

## Stage 3 — Course Management
Status: NOT STARTED

Objectives:
- Faculty can create/manage courses and add students; both roles can navigate course-scoped pages.

Tasks:
- Course CRUD API + faculty UI (create/edit course).
- Enrollment (faculty adds students, or student joins via code/invite — decide at implementation time).
- Course Home / Students / Materials pages (frontend), matching the Section 3 nav structure.
- Course-level authorization (only enrolled students / owning faculty can access a course's data).

Deliverables: A faculty user can create a course and see it; a student can view courses they're enrolled in.

Acceptance Criteria: Course-scoped data isolation verified (a student not enrolled in course X cannot fetch course X's data).

Dependencies: Stage 2.

---

## Stage 4 — Quiz System
Status: NOT STARTED

Objectives:
- `assessments`, `questions`, `rubrics`, `rubric_criteria`, `submissions` schema and CRUD.
- Faculty can author MCQ and short-answer questions with rubric criteria/weights.
- Students can take a quiz and submit answers (stored only — no AI evaluation yet).

Tasks:
- Schema + migrations for assessments/questions/rubrics/rubric_criteria/submissions.
- Faculty quiz-authoring UI (question text, type, expected answer, concepts + weights for short answer; options + correct answer for MCQ).
- Publish/unpublish assessment state.
- Student quiz-taking UI, submission persistence.
- MCQ auto-grading (deterministic — no AI needed for this type).

Deliverables: End-to-end quiz creation → publish → student submission flow, MCQs auto-graded.

Acceptance Criteria: Rubric weights for a question sum sensibly (validated, e.g. must total 100%); a submitted short answer is retrievable by faculty; MCQ score is computed deterministically and correctly.

Dependencies: Stage 3.

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
