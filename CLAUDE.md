# Rubric — Project Context for Claude Code

**Faculty defines what matters. Rubric understands what students know.**

This file explains **how to work on this project**. For **what has been done and what's next**, see [stages.md](stages.md) — it is the authoritative source of current project state and must be updated after every completed stage.

## What Rubric Is

Rubric is an AI-powered assessment and feedback platform for educators, positioned as a lightweight LMS with an AI-native assessment layer. It does not just assign marks — it evaluates *what a student actually understood* against a faculty-defined rubric, at the concept level.

Example: a rubric for "What is normalization in DBMS?" might weight "reduces redundancy" (40%), "prevents anomalies" (30%), "organizes data" (30%). A student's free-text answer is evaluated per-concept (covered / partial / missing) with evidence, not just a single opaque score.

Faculty (course owners) define courses, assessments, rubric criteria and weights, and retain final authority over every AI-generated grade. Students take quizzes, submit assignments, and receive concept-level feedback, not just a number.

**Core product principle: AI recommends, faculty decides.** Never let this invert.

## Architecture

npm-workspace monorepo + a standalone Python AI service, talking over HTTP:

```
rubric/
├── frontend/     Next.js + TypeScript + Tailwind (npm workspace)
├── backend/      Node/Express + TypeScript (npm workspace) — REST API, Postgres access, auth, orchestrates calls to ai-service
├── ai-service/   Python + FastAPI (independent project, own venv/pyproject.toml) — LangGraph evaluation pipeline, Groq LLM calls, embeddings
├── package.json  npm workspaces root (frontend + backend only)
├── CLAUDE.md
└── stages.md
```

The backend is the system of record (Postgres, auth, business rules). The ai-service is stateless-ish and does interpretation only — it receives a submission + rubric, returns a structured, schema-validated evaluation. It never writes directly to the primary DB; the backend persists evaluation results.

## Technology Stack

- **Frontend**: Next.js, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL
- **AI service**: Python, FastAPI
- **AI orchestration**: LangGraph (+ LangChain where it genuinely helps — not by default)
- **LLM inference**: Groq API
- **Embeddings**: a practical/cheap provider chosen at Stage 5 implementation time — do not over-engineer this choice early
- **Auth**: JWT (access token in an httpOnly cookie) + bcrypt password hashing. No third-party auth provider — keep infra minimal.

## AI Architecture

### The deterministic / AI split (non-negotiable)

**Deterministic (code, not LLM):** rubric criteria, weights, required sections, submission format rules, word/page limits, basic validation, final score arithmetic where derivable from criterion scores.

**AI interpretation (LLM/embeddings):** semantic meaning, concept coverage, factual accuracy, evidence extraction, feedback text generation.

The LLM never invents or edits rubric criteria/weights. It only assesses a student's response against faculty-authored criteria.

### Semantic evaluation pipeline

```
Embedding similarity  →  Concept matching  →  LLM verification  →  Evaluation
```

Embedding similarity is evidence/retrieval only — it must never be the sole determinant of correctness. Always follow it with LLM verification against the specific rubric criterion.

### LangGraph multi-agent pipeline (introduced at Stage 6, not before)

Build the single-LLM evaluation path first (Stage 5) and prove it works before adding orchestration (Stage 6). Progression is:

```
Basic rubric evaluation → Semantic similarity → LLM structured evaluation
  → LangGraph orchestration → Parallel specialized evaluators → Judge
  → Conditional conflict resolution
```

Agents and responsibilities:

- **Concept Evaluator** — per rubric concept: covered / partial / missing, evidence span, confidence.
- **Accuracy Critic** — factual correctness, contradictions, misconceptions; may disagree with the Concept Evaluator.
- **Completeness / Rubric Evaluator** — checks all required concepts/criteria are addressed per the faculty rubric.
- **Judge** — reconciles the above, produces final structured evaluation, explains covered/partial/missing decisions, recommends a score strictly within faculty-defined weights. Never invents criteria.
- **Feedback Agent** — turns the judge's output into student-friendly feedback (strengths, gaps, inaccuracies, improvement suggestions).

**Conditional routing** (don't run max-cost evaluation on every submission):
- High agreement / high confidence → go straight to Feedback Agent.
- Low confidence → run one additional evaluator pass.
- Evaluator disagreement → critic/judge reconciliation cycle.
- Still uncertain / high-risk → flag `needsFacultyReview: true`.

Persist per run: evaluation ID, submission ID, each agent's name/status/result/confidence/timestamp, whether conflict resolution occurred, and the final judge result. This is what makes the system auditable and explainable.

### Explainability

Faculty view: AI score, per-criterion status, reasoning summary, evidence quote, confidence, which evaluator flagged what, whether evaluators disagreed, final judge decision.

Student view: criterion, score, what they demonstrated, what they missed, feedback.

**Never expose raw chain-of-thought.** Only concise evidence + decision explanations.

### Schema validation

All structured AI output (evaluations, criterion results, feedback) must be validated against a typed schema (e.g. Zod on the Node side, Pydantic on the Python side) before being trusted or persisted. Never let arbitrary unvalidated LLM text drive scoring or DB writes.

## Database Principles

Expect entities roughly equivalent to: `users`, `courses`, `course_members`, `assessments`, `questions`, `rubrics`, `rubric_criteria`, `submissions`, `evaluations`, `criterion_results`, `feedback`, `evaluation_runs`, `agent_results`.

- Proper relational design (foreign keys, normalization) — no complexity added for its own sake.
- Every submission's AI-generated result and faculty-final result are stored **separately**. Faculty overriding a grade must never overwrite/destroy the original AI evaluation — both must remain queryable for audit.
- Migrations are the source of truth for schema; don't hand-edit a live schema without a corresponding migration.

## API Principles

- REST, versioned only if/when it becomes necessary — don't pre-version prematurely.
- Every request validated at the boundary (auth, role, input shape) before touching business logic.
- Role-based access control enforced server-side on every route, never trusted from the client.
- AI-service endpoints are internal (backend → ai-service), never exposed directly to the frontend.

## UI/UX Principles

Build something that looks like a real university product, not a hackathon demo or an AI-chatbot skin.

Avoid: generic chatbot UI, excessive gradients, fake/placeholder dashboards, unnecessary animation, "futuristic" visual noise, template-looking screens.

Favor: clear information hierarchy, good typography, real navigation (courses → assessments → submissions), useful tables/cards, meaningful empty states, responsive layouts, accessible forms, explicit assessment/review states (draft/published/submitted/evaluated/reviewed).

## Coding Conventions

- TypeScript everywhere on the JS side (frontend + backend); avoid `any`, prefer explicit types/interfaces for API payloads shared conceptually between frontend and backend.
- Python side: type hints throughout, Pydantic models for all structured LLM I/O.
- No dead code, no speculative abstractions for features that don't exist yet (see Rule 11/12 below).
- Comments only where the *why* is non-obvious (a workaround, a subtle invariant) — not restating what the code does.

## Security Principles

- Never hardcode secrets; use environment variables (`.env`, git-ignored) with a checked-in `.env.example`.
- Never commit API keys (Groq, DB credentials, JWT secret).
- Treat every student submission (text and uploaded files) as untrusted input.
- File uploads: validate type/size, parse safely (no arbitrary code execution via document parsing), never let file content become literal system/instruction text sent to the LLM (prompt-injection resistance — wrap untrusted content clearly as data, not instructions).
- Enforce faculty/student data isolation: a student can only ever see their own submissions/grades; a faculty member can only manage their own courses.
- Standard web hardening: parameterized queries (no string-built SQL), RBAC middleware on every protected route, input validation on every mutating endpoint.

## Testing Expectations

Minimum coverage per layer (see stages.md Stage 11 for the full plan):

- **Backend**: auth, course creation, assessment creation, submission flow, rubric storage/retrieval, evaluation persistence.
- **AI service**: covered concept, missing concept, partially covered concept, incorrect answer, semantically-equivalent-but-differently-worded answer, evaluator disagreement, low-confidence routing, structured-output schema validation (including malformed/invalid LLM output).
- **Frontend**: login, course navigation, quiz submission, assignment upload, viewing results, faculty review actions.

Do not rely on manual testing alone for anything that will be part of the demo flow.

## Development Workflow

Follow this loop for every stage, without skipping steps:

1. **Inspect** — read the current repo state, don't assume; re-check `stages.md` for the current stage's objectives/acceptance criteria.
2. **Plan** — confirm what's already working, what's missing, what (if anything) needs to change from the existing plan.
3. **Implement** — build only the current stage. Do not start a later stage's work unless a genuine dependency requires a small piece of it.
4. **Verify** — actually run the build, tests, and lint/typecheck for anything touched. For UI changes, run the app and click through the golden path in a browser before claiming success. A stage is not done because code was written; it's done because it was verified.
5. **Update stages.md** — mark the stage `COMPLETED`, add an implementation summary, record architectural decisions made along the way, record what was tested, record known limitations, and update the next stage's notes if reality diverged from the original plan.
6. **Continue** — move to the next `NOT STARTED` stage only after the current one meets its acceptance criteria.

There is a `/next-stage` command in `.claude/commands/` that encodes this loop as a quick reminder.

## Important Constraints (do not violate)

1. Don't rewrite working code without a concrete reason.
2. Don't add a dependency unless it materially improves the product — no unnecessary infra.
3. No hardcoded secrets — environment variables only.
4. Never commit API keys.
5. All LLM output that feeds application logic must be schema-validated.
6. AI-generated grades must stay auditable (original AI result + faculty-final result both stored, per-agent trace retained).
7. Faculty-defined rubric criteria/weights are authoritative — AI never overrides or invents them.
8. Never expose raw chain-of-thought; expose concise evidence/decision explanations instead.
9. Don't present AI output as deterministic — always carry confidence + review state.
10. No fake/decorative functionality — every button/action in the UI must do something real.
11. Don't optimize prematurely.
12. Prefer simple architecture that can be expanded later over building for hypothetical future needs now.

## Current Project Stage

See [stages.md](stages.md) — **Stages 0–2 are COMPLETED.** The monorepo scaffolding exists, the frontend/backend/ai-service health-check chain works end-to-end, the backend has a layered architecture with centralized error handling, Zod validation, structured (secret-redacted) logging, and a passing Vitest test suite — and Postgres (via Docker Compose, host port 5433) plus JWT/bcrypt authentication with `users`/`courses`/`course_members` schema and RBAC middleware are all live and tested. Next up: Stage 3 (Course Management).
