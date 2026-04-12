from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import demos

app = FastAPI(
    title="Demo to Conversion — AI Backend",
    description="Python backend running LangGraph AI agents for the Demo to Conversion platform.",
    version="0.1.0",
)

# Dev-only CORS — localhost frontend. Production will add the deployed origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(demos.router, prefix="/api/v1/demos", tags=["demos"])


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check. Does not verify Supabase/Anthropic connectivity (those are checked per-request)."""
    return {"status": "ok"}
