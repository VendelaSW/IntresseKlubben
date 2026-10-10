from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    
    database_url: str = ""
    # Kommaseparerad lista över tillåtna frontend-URL:er, t.ex.
    # Sätts i .env lokalt och i vercel panelen i produktion
    cors_origins: str = ""

    # S3-kompatibel bucket i Neon för profilbilder. boto3 läser inte .env
    # själv, så värdena skickas vidare från här (se app/core/storage.py).
    s3_bucket: str = ""
    aws_endpoint_url_s3: str = ""
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = ""

    # Hemlig nyckel som inloggningstoken signeras med (se app/auth/security.py).
    # Lång slumpad sträng, olika i Preview och Production, aldrig i Git.
    jwt_secret: str = ""

    # Demo: en språkmodell läser ut intressen ur fri text (se app/api/routes/demo.py).
    # Av som standard. Nyckeln och modellen sätts bara i .env (lokalt) eller i Vercel som
    # Sensitive, aldrig i Git eller i frontend.
    demo_ai: bool = False
    openai_api_key: str = ""
    openai_model: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
