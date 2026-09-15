# Rubric

Faculty defines what matters. Rubric understands what students know.

An AI-powered assessment and feedback platform for educators. See [CLAUDE.md](CLAUDE.md) for architecture and working conventions, and [stages.md](stages.md) for the development roadmap and current status.

## Project layout

```
rubric/
├── frontend/     Next.js + TypeScript + Tailwind (npm workspace)
├── backend/      Node/Express + TypeScript (npm workspace)
├── ai-service/   Python + FastAPI (independent project, own venv)
```

## Prerequisites

- Node.js 20+ and npm 10+
- Python 3.11+
- Docker Desktop (for the local Postgres container)

## Setup

```bash
# Install frontend + backend (npm workspaces)
npm install

# Set up the AI service (separate Python project)
cd ai-service
python -m venv .venv
./.venv/Scripts/pip install -e ".[dev]"   # Windows
# source .venv/bin/activate && pip install -e ".[dev]"   # macOS/Linux
cd ..

# Copy env template and fill in secrets
cp .env.example .env

# Start Postgres (maps container port 5432 -> host port 5433, to avoid
# clashing with a native Postgres install; DATABASE_URL in .env.example
# already points at 5433)
docker compose up -d

# Apply database migrations
cd backend
npm run migrate:up
cd ..
```

## Running in development

Each service runs independently. Open three terminals:

```bash
# Terminal 1 — AI service
cd ai-service
./.venv/Scripts/uvicorn app.main:app --reload --port 8000

# Terminal 2 — Backend
npm run dev:backend

# Terminal 3 — Frontend
npm run dev:frontend
```

Then visit http://localhost:3000 — sign up as faculty or student, log in/out, and see the session persist across reloads. The home page also calls the backend's `/health` endpoint, which in turn checks the AI service's `/health` endpoint, confirming all three services can talk to each other.

## Database

- Local Postgres runs via Docker Compose (`docker-compose.yml`), on host port **5433** (not 5432, to avoid colliding with a native Postgres install).
- Migrations are managed with [node-pg-migrate](https://salsita.github.io/node-pg-migrate/): `npm run migrate:up` / `npm run migrate:down` / `npm run migrate:create -- <name>` from `backend/`.
- Migration files live in `backend/migrations/`.

## Build / lint / typecheck

```bash
npm run build       # backend + frontend
npm run lint        # backend + frontend
npm run typecheck   # backend + frontend

cd ai-service && ./.venv/Scripts/ruff check app tests   # ai-service lint
cd ai-service && ./.venv/Scripts/pytest -q              # ai-service tests
```
