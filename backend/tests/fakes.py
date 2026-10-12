"""Fejkade versioner av OpenAI-klienterna (app/services/ai_clients.py), så att inga tester anropar
OpenAI. Sätt in dem med set_clients(FakeLLM(...), FakeModerator(...)). conftest.py återställer dem efter
varje test."""

from dataclasses import dataclass, field

from app.services.ai_clients import AIFailed, Deadline


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
