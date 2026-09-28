from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")
    
    database_url: str = ""
    # Kommaseparerad lista över tillåtna frontend-URL:er, t.ex.
    # Sätts i .env lokalt och i vercel panelen i produktion
    cors_origins: str = ""


    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
