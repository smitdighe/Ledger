"""Central application settings, loaded from `.env` via pydantic-settings."""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- app ---------------------------------------------------------------
    app_env: str = "local"
    log_level: str = "INFO"

    # --- postgres ----------------------------------------------------------
    # async DSN (asyncpg) used by the app; sync DSN (psycopg) used by alembic.
    database_url: str = Field(...)
    alembic_database_url: str = Field(...)

    # --- redis / celery ----------------------------------------------------
    redis_url: str = Field(...)
    celery_broker_url: str | None = None
    celery_result_backend: str | None = None

    # --- clickhouse --------------------------------------------------------
    clickhouse_host: str = "localhost"
    clickhouse_port: int = 8123
    clickhouse_native_port: int = 9000
    clickhouse_user: str = "ledger"
    clickhouse_password: str = Field(...)
    # app time-series live in their own DB; `default` holds Langfuse's tables.
    clickhouse_db: str = "ledger"

    # --- langfuse ----------------------------------------------------------
    langfuse_host: str = "http://localhost:3000"
    langfuse_public_key: str | None = None
    langfuse_secret_key: str | None = None

    # --- llm providers (4-tier router) ------------------------------------
    cerebras_api_key: str | None = None
    groq_api_key: str | None = None
    gemini_api_key: str | None = None
    # 127.0.0.1 (not localhost): localhost may resolve to ::1 where a different
    # Ollama instance can be listening; pin to IPv4 loopback for this install.
    ollama_host: str = "http://127.0.0.1:11434"

    # --- API auth (scoped API keys) ---------------------------------------
    # admin key => full access; ingestion key => POST /traces only.
    # No default: app must fail fast at startup if these aren't set in env.
    admin_api_key: str = Field(...)
    ingestion_api_key: str = Field(...)

    # --- CORS ----------------------------------------------------------------
    # Comma-separated list of allowed origins, e.g. "https://app.vercel.app".
    allowed_origins: str = ""

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Cached singleton — import this, don't construct Settings directly."""
    return Settings()


settings = get_settings()
