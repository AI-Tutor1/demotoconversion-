from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import demos, ingest, recruitment, sessions
from .scheduler import shutdown_scheduler, start_scheduler


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Start the auto-retry scheduler when uvicorn boots. Scheduler respects
    # AUTO_RETRY_ENABLED internally, so the kill switch needs no main.py edit.
    start_scheduler()
    try:
        yield
    finally:
        shutdown_scheduler()


app = FastAPI(
    title="Demo to Conversion — AI Backend",
    description="Python backend running LangGraph AI agents for the Demo to Conversion platform.",
    version="0.1.0",
    lifespan=lifespan,
)

# Allowed origins come from the FRONTEND_ORIGINS env var — comma-separated.
# Locally this defaults to http://localhost:3000; in production set it to your
# Vercel production URL. Vercel preview deployments (random *.vercel.app
# subdomains per PR) are matched via a regex allow-list so every preview works
# without redeploying the backend.
_allow_list = [o.strip() for o in settings.frontend_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_list,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(demos.router, prefix="/api/v1/demos", tags=["demos"])
app.include_router(ingest.router, prefix="/api/v1/demos", tags=["ingest"])
app.include_router(sessions.router, prefix="/api/v1/sessions", tags=["sessions"])
app.include_router(recruitment.router, prefix="/api/v1/hr-interviews", tags=["hr-interviews"])


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check. Does not verify Supabase/Groq connectivity (those are checked per-request)."""
    return {"status": "ok"}
