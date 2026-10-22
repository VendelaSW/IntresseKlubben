"""Smoke-test the configured Hugging Face moderation Space.

Run from ``backend/``:
    python -m app.scripts.test_live_moderation

Optionally provide another phrase:
    python -m app.scripts.test_live_moderation --text "Vi ses vid entrén klockan 18."
"""

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

DEFAULT_TEXT = "Vi ses vid entrén klockan 18 för löpning."
BACKEND_ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    parser = argparse.ArgumentParser(description="Testa Hugging Face-modereringen live.")
    parser.add_argument("--text", default=DEFAULT_TEXT, help="Svensk testmening som skickas till Space:en")
    args = parser.parse_args()

    load_dotenv(BACKEND_ROOT / ".env", override=False)

    from app.services.ai_clients import AIFailed, AINotConfigured, Deadline, get_toxicity_classifier

    print("Anropar Hugging Face-modereringen...")
    try:
        result = get_toxicity_classifier().classify(args.text, Deadline())
    except (AINotConfigured, AIFailed) as error:
        print(f"Modereringen misslyckades: {type(error).__name__}", file=sys.stderr)
        print("Kontrollera MODERATION_SPACE, HF_TOKEN och att Space:en är tillgänglig.", file=sys.stderr)
        return 1
    except Exception as error:
        print(f"Oväntat modereringsfel: {type(error).__name__}", file=sys.stderr)
        return 1

    print("\nModereringens svar:")
    print(json.dumps(result.model_dump(), ensure_ascii=False, indent=2))
    print("\nAnropet lyckades; svaret validerades som ett modereringsresultat.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
