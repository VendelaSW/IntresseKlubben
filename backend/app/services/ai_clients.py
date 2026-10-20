"""
Klienter mot OpenAI och Hugging Face, bakom utbytbara gränssnitt.

LLM och Moderator använder OpenAI; ToxicityClassifier använder den fristående HF-spacen via
gradio_client. Tester kan ersätta alla tre via set_clients. OpenAI-anropen använder urllib.
Nycklar läses ur inställningarna och hamnar aldrig i fel, loggar eller svar.

Tidsgränser: backendens funktion får köra i högst 30 sekunder (maxDuration i backend/vercel.json),
så inget anrop får överleva den. Varje anrop väntar högst PER_CALL_TIMEOUT_SECONDS, och ett
arbete som består av flera anrop i rad delar på en Deadline, så att de tillsammans ryms.
"""

import json
import time
import urllib.error
import urllib.request
from functools import lru_cache
from typing import Protocol

from pydantic import BaseModel, Field, StrictBool, StrictStr

from app.core.config import settings

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
MODERATION_URL = "https://api.openai.com/v1/moderations"
MODERATION_MODEL = "omni-moderation-latest"
MODERATION_BATCH = 30  # så många texter skickas till modereringen åt gången

# Funktionen får köra i 30 sekunder. Ett enskilt anrop får ta högst så här länge, och ett arbete med
# flera anrop i rad får ta högst så här länge tillsammans (se Deadline). Lämnar marginal för resten.
PER_CALL_TIMEOUT_SECONDS = 10
WORK_BUDGET_SECONDS = 25


class AINotConfigured(Exception):
    """Nyckel eller modell saknas i inställningarna."""


class AIFailed(Exception):
    """Anropet misslyckades eller svaret gick inte att använda. Texten innehåller aldrig
    nyckeln eller något från svaret."""


class Deadline:
    """En gemensam tidsgräns för flera anrop i rad."""

    def __init__(self, seconds: float = WORK_BUDGET_SECONDS):
        self._end = time.monotonic() + seconds

    def remaining(self) -> float:
        return max(0.0, self._end - time.monotonic())


def _timeout(deadline: Deadline | None) -> float:
    """Hur länge nästa anrop får vänta: högst PER_CALL_TIMEOUT_SECONDS, och aldrig längre än det som
    är kvar av tidsgränsen. Är den slut kastas AIFailed utan att något anrop görs."""
    seconds = PER_CALL_TIMEOUT_SECONDS if deadline is None else min(PER_CALL_TIMEOUT_SECONDS, deadline.remaining())
    if seconds <= 0:
        raise AIFailed("Tiden tog slut")
    return seconds


class LLM(Protocol):
    def complete_json(
        self, *, system: str, user: str, name: str, schema: dict, deadline: Deadline | None = None
    ) -> dict:
        """Ber modellen svara med JSON enligt `schema` (ett JSON-schema, tvingat av modellen) på
        meddelandet `user` med instruktionen `system`. Returnerar det tolkade svaret. `name` namnger
        schemat. Kastar AIFailed om anropet misslyckas eller svaret inte är JSON."""


class Moderator(Protocol):
    def flagged(self, texts: list[str], deadline: Deadline | None = None) -> list[bool]:
        """Om varje text flaggas (hat, våld, sexuellt, självskada osv.), i samma ordning som
        `texts`. Kastar AIFailed om anropet misslyckas eller svaret inte går att använda."""


class ToxicityResult(BaseModel):
    flagged: StrictBool
    translated_text: StrictStr
    score: float = Field(ge=0, le=1, strict=True, allow_inf_nan=False)


class ToxicityClassifier(Protocol):
    def classify(self, text: str, deadline: Deadline | None = None) -> ToxicityResult:
        ...


@lru_cache(maxsize=1)
def _get_hf_client():
    from gradio_client import Client

    if not settings.moderation_space.strip():
        raise AINotConfigured()
    return Client(
        settings.moderation_space, token=settings.hf_token or None,
        verbose=False, analytics_enabled=False,
        httpx_kwargs={"timeout": PER_CALL_TIMEOUT_SECONDS},
    )


class HuggingFaceClassifier:
    def classify(self, text: str, deadline: Deadline | None = None) -> ToxicityResult:
        job = None
        try:
            _timeout(deadline)
            job = _get_hf_client().submit(text, api_name="/moderate")
            return ToxicityResult.model_validate(job.result(timeout=_timeout(deadline)))
        except AINotConfigured:
            raise
        except Exception:
            if job is not None:
                try:
                    job.cancel()
                except Exception:
                    pass
            raise AIFailed("Textkontrollen misslyckades") from None


def _post_json(url: str, payload: dict, timeout: float) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {settings.openai_api_key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except (urllib.error.URLError, TimeoutError, ValueError) as err:
        # Texten får inte innehålla nyckeln eller svaret, så bara typen av fel tas med.
        raise AIFailed(type(err).__name__) from None


class OpenAILLM:
    def complete_json(
        self, *, system: str, user: str, name: str, schema: dict, deadline: Deadline | None = None
    ) -> dict:
        payload = {
            "model": settings.openai_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "response_format": {"type": "json_schema", "json_schema": {"name": name, "strict": True, "schema": schema}},
        }
        response = _post_json(OPENAI_URL, payload, _timeout(deadline))
        try:
            return json.loads(response["choices"][0]["message"]["content"])
        except (KeyError, IndexError, TypeError, ValueError):
            raise AIFailed("Oväntat svar") from None


class OpenAIModerator:
    def flagged(self, texts: list[str], deadline: Deadline | None = None) -> list[bool]:
        flags: list[bool] = []
        for start in range(0, len(texts), MODERATION_BATCH):
            batch = texts[start : start + MODERATION_BATCH]
            response = _post_json(MODERATION_URL, {"model": MODERATION_MODEL, "input": batch}, _timeout(deadline))
            try:
                batch_flags = [bool(result["flagged"]) for result in response["results"]]
            except (KeyError, TypeError):
                raise AIFailed("Oväntat svar från moderering") from None
            if len(batch_flags) != len(batch):
                raise AIFailed("Oväntat svar från moderering")
            flags.extend(batch_flags)
        return flags


# Fejkade versioner som testerna sätter in med set_clients.
_llm_override: LLM | None = None
_moderator_override: Moderator | None = None
_toxicity_override: ToxicityClassifier | None = None


def set_clients(
    llm: LLM | None = None, moderator: Moderator | None = None, toxicity: ToxicityClassifier | None = None
) -> None:
    """Byter ut klienterna (bara för tester). Utan argument återställs de."""
    global _llm_override, _moderator_override, _toxicity_override
    _llm_override, _moderator_override = llm, moderator
    _toxicity_override = toxicity


def get_toxicity_classifier() -> ToxicityClassifier:
    return _toxicity_override if _toxicity_override is not None else HuggingFaceClassifier()


def ai_configured() -> bool:
    """Går det att anropa AI-tjänsten? Ja om nyckel och modell är satta, eller om en fejkad klient
    har satts in i ett test."""
    return _llm_override is not None or bool(settings.openai_api_key and settings.openai_model)


def get_llm() -> LLM:
    """Språkmodellen. Kastar AINotConfigured om nyckel eller modell saknas."""
    if _llm_override is not None:
        return _llm_override
    if not (settings.openai_api_key and settings.openai_model):
        raise AINotConfigured()
    return OpenAILLM()


def get_moderator() -> Moderator:
    """Modereringen. Kastar AINotConfigured om nyckeln saknas."""
    if _moderator_override is not None:
        return _moderator_override
    if not settings.openai_api_key:
        raise AINotConfigured()
    return OpenAIModerator()
