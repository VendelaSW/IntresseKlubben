"""Diagnose Hugging Face Space metadata auth and Gradio host response.

Run from backend/:
    python -m app.scripts.diag_space
"""

import json
import os
import sys
from pathlib import Path
from urllib.parse import quote, quote_plus

import requests
from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=BACKEND_ROOT / ".env", override=False)

SPACE_ID = os.getenv("MODERATION_SPACE", "").strip()
HF_TOKEN = os.getenv("HF_TOKEN", "").strip()
DEFAULT_SPACE_ID = "Mrbanhammer/filter"
SPACE_ID = SPACE_ID or DEFAULT_SPACE_ID


def redact(value: str) -> str:
    if not HF_TOKEN:
        return value
    for secret in {HF_TOKEN, quote(HF_TOKEN, safe=""), quote_plus(HF_TOKEN)} - {""}:
        value = value.replace(secret, "[REDACTED]")
    return value


def print_json_response(response: requests.Response) -> None:
    print(f"HTTP status: {response.status_code}")
    try:
        payload = response.json()
        rendered = json.dumps(payload, ensure_ascii=False, indent=2)
        print(redact(rendered))
    except ValueError:
        print("Response body (not JSON):")
        print(redact(response.text))


def main() -> int:
    print(f"MODERATION_SPACE: {SPACE_ID}")
    print(f"HF_TOKEN hittades: {'ja' if HF_TOKEN else 'nej'}")
    headers = {"Authorization": f"Bearer {HF_TOKEN}"} if HF_TOKEN else {}
    failed = False

    metadata_url = f"https://huggingface.co/api/spaces/{SPACE_ID}"
    print(f"\nGET {metadata_url}")
    try:
        response = requests.get(metadata_url, headers=headers, timeout=20)
        print_json_response(response)
        failed |= not response.ok
    except requests.RequestException as error:
        print(f"Request failed: {type(error).__name__}: {redact(str(error))}")
        failed = True

    host = "https://mrbanhammer-filter.hf.space"
    print(f"\nGET {host}")
    try:
        response = requests.get(host, timeout=20)
        print(f"HTTP status: {response.status_code}")
        print("Raw response body:")
        print(redact(response.text))
        failed |= not response.ok
    except requests.RequestException as error:
        print(f"Request failed: {type(error).__name__}: {redact(str(error))}")
        failed = True

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
