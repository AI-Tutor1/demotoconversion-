from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Fails fast at import if any required key is missing."""

    anthropic_api_key: str
    openai_api_key: str
    supabase_url: str
    supabase_service_role_key: str

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
