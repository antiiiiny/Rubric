from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# ai-service is run with its own directory as cwd (see README), but secrets
# live in the single root .env shared by all three services.
_ROOT_ENV = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ROOT_ENV, extra="ignore")

    ai_service_port: int = 8000
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"


settings = Settings()
