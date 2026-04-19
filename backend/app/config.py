from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Fails fast at import if any required key is missing.

    Groq is the single vendor for both Whisper transcription (ingest agent) and
    LLM analysis (demo_analyst). anthropic_api_key was dropped when the analyst
    was consolidated onto Groq Llama 3.3 70B.
    """

    groq_api_key: str
    supabase_url: str
    supabase_service_role_key: str
    # Comma-separated list of allowed frontend origins for CORS. Locally defaults
    # to the Next.js dev server. In production set this to your Vercel URL(s),
    # e.g. "https://demo-to-conversion.vercel.app,https://demo-to-conversion-git-main-*.vercel.app"
    frontend_origins: str = "http://localhost:3000"

    # ─── Auto-retry of failed sessions ───────────────────────────
    # Kill switch. When false, the scheduler still registers but the job
    # no-ops on every tick — useful for incident response without a redeploy.
    auto_retry_enabled: bool = True
    # How often the scheduler wakes up to scan for retryable sessions.
    auto_retry_interval_minutes: int = 15
    # Maximum total failed task_queue rows per session before auto-retry
    # gives up (counted across both ingest and demo_analyst). Manual analyst
    # retries via /process-recording or /analyze also count toward this cap.
    auto_retry_max_attempts: int = 3
    # Cooldown after a Groq Whisper ASPH / rate-limit 429. Must be ≥ the
    # Groq hourly window to avoid immediate re-429.
    auto_retry_rate_limit_backoff_minutes: int = 60
    # Cooldown after any other transient error (timeout, parse, network).
    auto_retry_generic_backoff_minutes: int = 5

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
