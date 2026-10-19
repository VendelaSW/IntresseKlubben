"""Fejkade versioner av OpenAI-klienterna (app/services/ai_clients.py), så att inga tester anropar
OpenAI. Sätt in dem med set_clients(FakeLLM(...), FakeModerator(...)). conftest.py återställer dem efter
varje test."""

import hashlib
import math
from dataclasses import dataclass, field

from app.models.interest_embedding import EMBEDDING_DIMENSIONS
from app.services.ai_clients import AIFailed, Deadline
from app.services.email import EmailFailed
from app.services.geocoding import GeocodingFailed, Place


@dataclass
class LLMCall:
    system: str
    user: str
    name: str
    schema: dict
    deadline: Deadline | None = None


class FakeLLM:
    """Svarar på anrop efter schemats namn: answers = {"interests": {...}, "judge": {...}}. Ett svar är
    ett tolkat JSON-svar (dict), ett undantag som kastas (t.ex. AIFailed, som den riktiga klienten
    kastar för ett svar som inte är JSON), eller en funktion som får anropet och ger något av det."""

    def __init__(self, answers: dict | None = None):
        self.answers = dict(answers or {})
        self.calls: list[LLMCall] = []

    def calls_named(self, name: str) -> list[LLMCall]:
        return [call for call in self.calls if call.name == name]

    def complete_json(self, *, system, user, name, schema, deadline=None):
        call = LLMCall(system, user, name, schema, deadline)
        self.calls.append(call)
        if name not in self.answers:
            raise AIFailed(f"FakeLLM har inget svar för {name!r}")
        answer = self.answers[name]
        if callable(answer):
            answer = answer(call)
        if isinstance(answer, BaseException):
            raise answer
        return answer


@dataclass
class FakeModerator:
    """Flaggar texterna i `flagged_texts` (eller alla om `flag_all`) och inget annat. `batches` får
    varje anrops texter."""

    flagged_texts: set[str] = field(default_factory=set)
    flag_all: bool = False
    error: BaseException | None = None
    batches: list[list[str]] = field(default_factory=list)

    def flagged(self, texts, deadline=None):
        self.batches.append(list(texts))
        if self.error is not None:
            raise self.error
        return [self.flag_all or text in self.flagged_texts for text in texts]


@dataclass
class FakeEmailSender:
    """Fejkat mejlutskick (app/services/email.py): sparar varje mejl i `sent` som (till, ämne, text, html), eller
    kastar EmailFailed om `fail` är satt."""

    sent: list[tuple[str, str, str, str]] = field(default_factory=list)
    fail: bool = False

    def send(self, to, subject, text, html):
        if self.fail:
            raise EmailFailed("fejkat fel")
        self.sent.append((to, subject, text, html))


@dataclass
class FakeGeocoder:
    """Fejkad adressökning (app/services/geocoding.py): svarar med `places` för varje sökning, eller
    kastar GeocodingFailed om `fail` är satt. `queries` får varje söktext."""

    places: list[Place] = field(default_factory=list)
    fail: bool = False
    queries: list[str] = field(default_factory=list)

    def search(self, query):
        self.queries.append(query)
        if self.fail:
            raise GeocodingFailed("fejkat fel")
        return list(self.places)


def fake_vector(text: str) -> list[float]:
    """En fast, normaliserad vektor för en text: samma text ger samma vektor, olika texter olika."""
    seed = hashlib.sha256(text.encode("utf-8")).digest()
    raw = [seed[i % len(seed)] - 127.5 + (i % 7) for i in range(EMBEDDING_DIMENSIONS)]
    norm = math.sqrt(sum(x * x for x in raw))
    return [x / norm for x in raw]


@dataclass
class FakeEmbedder:
    """Fejkad embeddings (app/services/ai_clients.py). `vectors` ger en bestämd vektor för vissa texter, annars
    används fake_vector. `error` kastas vid varje anrop (t.ex. AIFailed). `calls` får varje anrops texter."""

    vectors: dict[str, list[float]] = field(default_factory=dict)
    error: BaseException | None = None
    calls: list[list[str]] = field(default_factory=list)

    def embed(self, texts, deadline=None):
        self.calls.append(list(texts))
        if self.error is not None:
            raise self.error
        return [self.vectors.get(text) or fake_vector(text) for text in texts]
