from pydantic import Field, field_validator
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

    # Språkmodellen som läser ut intressen ur texten i intervjun (se app/services/interest_extractor.py).
    # Saknas nyckeln eller modellen är funktionen avstängd. Nyckeln hör hemma i .env och i Vercel, aldrig i Git.
    openai_api_key: str = ""
    openai_model: str = ""
    # Hur mycket svaren får variera (0 till 2). Tom: modellens standard. 0 ger nästan samma svar varje gång på samma
    # text (mätt: 10 % av texterna fick olika taggar mellan två körningar, mot 24 % utan). Sätts bara för modeller
    # som tillåter det: resonemangsmodeller (o-serien, gpt-5) godtar inget annat än standard, så lämna den tom då.
    openai_temperature: float | None = Field(default=None, ge=0, le=2)
    # Ska analysen av intressen skicka följdfrågor (POST /interests/analyze)? Av som standard: frågorna är byggda
    # men inte aktiverade, så analysen sätter bara en aktivitet när texten säger den och gissar aldrig.
    interest_followups: bool = False

    # Mejl från appen (se app/services/email.py), via Resend. Utan nyckel skickas inget: mejlet skrivs i loggen i
    # stället, så att länkarna går att testa lokalt. Utan egen domän i Resend går mejl från onboarding@resend.dev bara
    # till kontots egen adress. RESEND_API_KEY skapas av Resends integration i Vercel.
    resend_api_key: str = ""
    email_from: str = "Intresseklubben <onboarding@resend.dev>"
    # Frontendens adress i den här miljön, för länkarna i mejlen (t.ex. https://intresse-klubben.vercel.app).
    # Tom: första adressen i CORS_ORIGINS.
    frontend_url: str = ""
    # Måste e-posten vara bekräftad för att logga in? Av tills vidare: befintliga konton bekräftar själva från profilen.
    require_email_verification: bool = False
    # Vilken miljö koden kör i. Sätts av Vercel själv ("production", "preview" eller "development"); tom lokalt.
    vercel_env: str = ""
    # Testläget (se app/devtools): "Logga in som ..." och testpanelen. Slås bara på av
    # `python -m app.devtools.server`, som också sätter en egen SQLite-databas. Går aldrig att slå på mot en
    # riktig databas eller på Vercel (se app/devtools/__init__.py).
    dev_mode: bool = False

    @field_validator("interest_followups", "require_email_verification", "dev_mode", mode="before")
    @classmethod
    def _empty_means_off(cls, value):
        # En tom rad (INTEREST_FOLLOWUPS=) i .env eller Vercel ska inte stoppa starten. Tomma textvärden
        # lämnas som de är: testerna tömmer dem med flit för att inte läsa riktiga nycklar ur .env.
        return False if isinstance(value, str) and not value.strip() else value

    @field_validator("openai_temperature", mode="before")
    @classmethod
    def _empty_means_default(cls, value):
        # OPENAI_TEMPERATURE= (en tom rad) i .env eller Vercel ska inte stoppa starten, utan betyda modellens standard.
        return None if isinstance(value, str) and not value.strip() else value

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def frontend_base_url(self) -> str:
        """Adressen som länkarna i mejlen börjar med, utan / på slutet."""
        url = self.frontend_url.strip() or next(iter(self.cors_origins_list), "http://localhost:5173")
        return url.rstrip("/")


settings = Settings()
