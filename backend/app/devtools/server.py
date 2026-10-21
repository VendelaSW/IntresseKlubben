"""
Startar backend i testläget: `python -m app.devtools.server` från backend/ (eller `npm run dev:test` från
frontend/, som startar frontend också). Databasen är en SQLite-fil i backend/.devdata/ som byggs om vid varje
start, så Neon rörs aldrig. Ingen OpenAI (fejkad AI) och inga riktiga mejl (de skrivs i terminalen).

Bara datorn själv når den, om inte DEV_BACKEND_HOST säger något annat: `npm run dev:telefon` sätter 0.0.0.0, så
att en telefon på samma Wi-Fi når den, och lägger till telefonens adress i DEV_CORS_ORIGINS.
"""

import os
import secrets
from pathlib import Path

DB_FILE = Path(__file__).resolve().parents[2] / ".devdata" / "testlage.db"
# Adressen till frontend, för länkarna i mejlen, och de adresser frontend får anropa backend från (CORS).
FRONTEND = os.environ.get("DEV_FRONTEND_URL", "http://localhost:5173")
CORS = os.environ.get("DEV_CORS_ORIGINS", FRONTEND)
HOST = os.environ.get("DEV_BACKEND_HOST", "127.0.0.1")
PORT = int(os.environ.get("DEV_BACKEND_PORT", "8000"))

# Måste sättas innan något ur appen importeras. En miljövariabel går före backend/.env, så inga riktiga värden
# (databasen, nycklarna) läses in.
os.environ.update(
    {
        "DATABASE_URL": f"sqlite:///{DB_FILE.as_posix()}?check_same_thread=false",
        "DEV_MODE": "1",
        "VERCEL_ENV": "",
        "JWT_SECRET": secrets.token_hex(32),
        "CORS_ORIGINS": CORS,
        "FRONTEND_URL": FRONTEND,
        "OPENAI_API_KEY": "",
        "OPENAI_MODEL": "",
        "RESEND_API_KEY": "",
        "REQUIRE_EMAIL_VERIFICATION": "",
        **{name: "" for name in ("S3_BUCKET", "AWS_ENDPOINT_URL_S3", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY")},
    }
)


def main() -> None:
    import uvicorn

    from app.devtools.database import rebuild, use_utc_datetimes
    from app.main import app

    DB_FILE.parent.mkdir(exist_ok=True)
    use_utc_datetimes()
    accounts = rebuild(app)
    print(f"\nTestläget: {len(accounts)} testkonton i {DB_FILE}. Öppna {FRONTEND}\n", flush=True)
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")


if __name__ == "__main__":
    main()
