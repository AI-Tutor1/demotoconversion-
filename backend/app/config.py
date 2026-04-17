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

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
