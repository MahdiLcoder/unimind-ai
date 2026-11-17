from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "UniMind AI API"
    app_env: str = "development"
    database_url: SecretStr | None = None
    postgres_db: str = "unimind"
    postgres_user: str = "unimind"
    postgres_password: SecretStr | None = None
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    redis_url: SecretStr = SecretStr("redis://localhost:6379/0")
    metrics_bearer_token: SecretStr | None = None
    cors_origins: str = "http://localhost:3000"
    clerk_jwks_url: str | None = None
    clerk_issuer: str | None = None
    clerk_authorized_parties: str = ""
    admin_clerk_user_ids: str = ""
    code_runner_url: str | None = None
    api_rate_limit_enabled: bool | None = None
    api_rate_limit_requests: int = Field(default=120, ge=1, le=100_000)
    api_rate_limit_window_seconds: int = Field(default=60, ge=1, le=86_400)

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.database_url is not None:
            return self.database_url.get_secret_value()
        if self.postgres_password is None:
            raise ValueError("Set DATABASE_URL or POSTGRES_PASSWORD")
        return URL.create(
            "postgresql+asyncpg",
            username=self.postgres_user,
            password=self.postgres_password.get_secret_value(),
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        ).render_as_string(hide_password=False)

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def authorized_clerk_parties(self) -> frozenset[str]:
        return frozenset(
            party.strip()
            for party in self.clerk_authorized_parties.split(",")
            if party.strip()
        )

    @property
    def bootstrap_admin_user_ids(self) -> frozenset[str]:
        return frozenset(
            user_id.strip()
            for user_id in self.admin_clerk_user_ids.split(",")
            if user_id.strip()
        )

    @property
    def rate_limit_enabled(self) -> bool:
        if self.api_rate_limit_enabled is not None:
            return self.api_rate_limit_enabled
        return self.app_env.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
