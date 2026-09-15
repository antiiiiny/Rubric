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
- PostgreSQL (from Stage 2 onward)

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

Then visit http://localhost:3000 — the home page calls the backend's `/health` endpoint, which in turn checks the AI service's `/health` endpoint, confirming all three services can talk to each other.

## Build / lint / typecheck

```bash
npm run build       # backend + frontend
npm run lint        # backend + frontend
npm run typecheck   # backend + frontend

cd ai-service && ./.venv/Scripts/ruff check app   # ai-service lint
```
