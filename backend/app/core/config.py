from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = ""
    # Kommaseparerad lista över tillåtna frontend-URL:er, t.ex.
    # "http://localhost:5173,https://intresseklubben-frontend.onrender.com"
    cors_origins: str = "http://localhost:5173"

    class Config:
        env_file = ".env"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
