"""Check authentication and the moderation endpoint of the configured HF Space."""

import json
import os
import sys
import traceback
from pathlib import Path
from urllib.parse import quote, quote_plus

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(dotenv_path=REPO_ROOT / "backend" / ".env", override=False)
configured_ca = os.environ.get("SSL_CERT_FILE")
if configured_ca and not Path(configured_ca).is_file():
    try:
        import certifi

        os.environ["SSL_CERT_FILE"] = certifi.where()
        print("SSL_CERT_FILE pekade på en saknad fil; använder certifi CA-bundle för detta test.")
    except ImportError:
        print("SSL_CERT_FILE pekar på en saknad fil och certifi saknas.", file=sys.stderr)
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.core.config import settings


def main() -> int:
    space_id = settings.moderation_space.strip()
    hf_token = settings.hf_token.strip()
    print(f"MODERATION_SPACE: {space_id or '(saknas)'}")
    print(f"HF_TOKEN hittades: {'ja' if hf_token else 'nej'}")
    if not space_id:
        print("MODERATION_SPACE saknas i backend/.env", file=sys.stderr)
        return 2
    if not hf_token:
        print("HF_TOKEN saknas i backend/.env", file=sys.stderr)
        return 2

    try:
        from gradio_client import Client

        client = Client(
            space_id,
            token=hf_token,
            verbose=False,
            analytics_enabled=False,
            download_files=False,
            httpx_kwargs={"timeout": 20},
        )
        response = client.predict("Detta är en testtext", api_name="/moderate")
    except Exception as error:
        message = str(error)
        for secret in {hf_token, quote(hf_token, safe=""), quote_plus(hf_token)} - {""}:
            message = message.replace(secret, "[REDACTED]")
        if isinstance(error, FileNotFoundError):
            missing = Path(error.filename).name if error.filename else "okänd fil"
            print(f"{type(error).__name__}: {message} (fil: {missing})", file=sys.stderr)
        else:
            print(f"{type(error).__name__}: {message}", file=sys.stderr)
        for frame in traceback.extract_tb(error.__traceback__):
            print(f"  {Path(frame.filename).name}:{frame.lineno} i {frame.name}()", file=sys.stderr)
        print("Tokenen har inte skrivits ut.", file=sys.stderr)
        return 1

    print("Svar från Hugging Face Space:")
    print(json.dumps(response, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
