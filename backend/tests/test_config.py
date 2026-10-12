"""Inställningarna (app/core/config.py): tomma värden och .env.example får aldrig krascha starten."""

from pathlib import Path

import pytest

from app.core.config import Settings

ENV_EXAMPLE = Path(__file__).resolve().parent.parent / ".env.example"


def test_an_empty_on_off_setting_does_not_crash_and_means_off(monkeypatch):
    monkeypatch.setenv("INTEREST_FOLLOWUPS", "")
    assert Settings(_env_file=None).interest_followups is False


@pytest.mark.parametrize(("value", "expected"), [("1", True), ("true", True), ("0", False), ("false", False)])
def test_the_on_off_setting_reads_the_usual_values(monkeypatch, value, expected):
    monkeypatch.setenv("INTEREST_FOLLOWUPS", value)
    assert Settings(_env_file=None).interest_followups is expected


def test_an_empty_text_setting_stays_empty_and_hides_the_value_in_env(monkeypatch, tmp_path):
    # Testerna (conftest.py) tömmer nycklar så att de riktiga i .env inte läses. Det måste fortsätta fungera.
    env = tmp_path / ".env"
    env.write_text("OPENAI_API_KEY=riktig-nyckel\n", encoding="utf-8")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    assert Settings(_env_file=env).openai_api_key == ""


def test_env_example_can_be_copied_to_env_without_crashing_the_start(tmp_path, monkeypatch):
    # Den som kopierar .env.example till .env ska kunna starta backend. Alla rader i filen läses in som de står.
    for name in list(__import__("os").environ):
        if name.isupper() and any(name.startswith(prefix) for prefix in ("INTEREST_", "OPENAI_", "S3_", "AWS_", "CORS_", "JWT_", "DATABASE_")):
            monkeypatch.delenv(name, raising=False)
    copy = tmp_path / ".env"
    copy.write_text(ENV_EXAMPLE.read_text(encoding="utf-8"), encoding="utf-8")
    settings = Settings(_env_file=copy)
    assert settings.interest_followups is False


def test_env_example_has_no_empty_on_off_setting():
    # Samma fel som i granskningen: en tom rad för en av/på-inställning. Med env_ignore_empty går det bra, men
    # exempelfilen ska visa ett riktigt värde.
    lines = [line.strip() for line in ENV_EXAMPLE.read_text(encoding="utf-8").splitlines()]
    assert "INTEREST_FOLLOWUPS=0" in lines
