# Backend — Demo to Conversion AI Agents

Python FastAPI service that runs the AI agents (LangGraph) for the Demo to Conversion platform. Writes draft outputs to Supabase (`demo_drafts`, `task_queue`) using the service_role key (bypasses RLS).

Phase 3 scope: **Demo Analyst agent only**. Other agents (Ingest, Router, Sales Coach, Classifier, Teacher Coach, Escalation) are planned but not yet implemented.

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                # then fill in real keys
```

Env vars required (see `.env.example`):
- `ANTHROPIC_API_KEY` — Claude API key (paste manually into `.env`; never committed)
- `SUPABASE_URL` — same project the frontend uses
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase dashboard → Project Settings → API → `service_role`. **Secret.** Bypasses RLS.

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

- Swagger UI: http://localhost:8000/docs
- Health check: http://localhost:8000/health
- Analyze a demo: `curl -X POST http://localhost:8000/api/v1/demos/1/analyze`

## Project structure

```
app/          FastAPI application (routers, config, models, Supabase client)
agents/       LangGraph agents (base helpers + per-agent nodes)
tests/        pytest suite (fixtures in conftest.py)
transcripts/  Sample transcripts for local testing
```

## How it connects to the frontend

- Frontend (Next.js, :3000) calls `POST http://localhost:8000/api/v1/demos/{id}/analyze`
- Backend fetches the demo from Supabase, runs the Demo Analyst agent against the transcript, writes the draft to `demo_drafts`
- Frontend listens to `demo_drafts` via Supabase Realtime and renders the split-view draft-review UI

The two services communicate **only over HTTP**. The frontend imports nothing from `backend/`; the backend imports nothing from the Next.js app.
