"""
Fejkade AI-klienter för testläget, så att intervjun och textkontrollen fungerar utan OpenAI (och utan kostnad).

Utläsningen hittar intressen ur biblioteket vars namn står i texten ("Jag gillar löpning och brädspel" ger
Löpning och Brädspel), så att förslagen går att förutse. Ett intresse som inte finns i biblioteket (t.ex. ett eget
i "Lägg till ett intresse") godkänns och läggs under NEW_INTEREST_AREA. Inga följdfrågor.

Står REJECT_WORD i texten säger kontrollerna nej (granskningen av intressen och kontrollen av profiltexten), så att
det fallet också går att testa. Allt annat godkänns.
"""

import hashlib
import json
import math
import re

from app.models.interest_embedding import EMBEDDING_DIMENSIONS
from app.services.ai_clients import AIFailed, set_clients

# Skriv det här ordet i ett intresse eller i profiltexten för att se hur appen gör när kontrollen säger nej.
REJECT_WORD = "nekas"
# Området nya intressen hamnar under (ett av bibliotekets översta).
NEW_INTEREST_AREA = "Övrigt och nischat"

# En rad i bibliotekslistan som matchningen får: "123: Område > Intresse (även: alias)".
_LISTING_LINE = re.compile(r"^(\d+): (.+?)(?: \(även: .*\))?$")


# Ord som i testläget betyder att man själv håller på med intresset.
_PRACTISING_WORDS = ("spelar", "tränar", "utövar", "håller på med")


class FakeLLM:
    def __init__(self, interest_names: list[str]):
        # Längst först, så att "Trail running" hittas före "running".
        names = sorted(set(interest_names), key=len, reverse=True)
        self._patterns = [(name, re.compile(rf"\b{re.escape(name.lower())}\b")) for name in names]

    def _interests(self, text: str) -> dict:
        lowered, found = text.lower(), []
        for name, pattern in self._patterns:
            if pattern.search(lowered) and not any(name.lower() in other.lower() for other in found):
                found.append(name)
        # Utövar (SCRUM-271) om meningen har ett verb där man själv håller på, annars bara intresserad.
        practices = any(word in lowered for word in _PRACTISING_WORDS)
        return {
            "interests": [{"name": name, "aliases": [], "practices": practices, "subtags": []} for name in found]
        }

    @staticmethod
    def _judge(user: str) -> dict:
        # Meddelandet slutar med taggarna som JSON (se judge_message i services/interest_extractor.py).
        tags = json.loads(user.rpartition("Taggar:\n")[2])
        return {"remove": tags if REJECT_WORD in user.lower() else []}

    @staticmethod
    def _match(user: str) -> dict:
        # Biblioteket rad för rad och sedan taggarna som JSON (se match_message i services/interest_matching.py).
        # Varje tagg blir ett nytt intresse: under NEW_INTEREST_AREA, eller under sin överordnade tagg.
        listing, _, payload = user.partition("\n\nTaggar:\n")
        areas = {}
        for line in listing.splitlines():
            found = _LISTING_LINE.match(line)
            if found and " > " not in found.group(2):
                areas[found.group(2)] = int(found.group(1))
        area = areas.get(NEW_INTEREST_AREA, next(iter(areas.values()), None))
        decisions = [
            {
                "key": tag["key"],
                "decision": "new",
                "interest_id": None,
                "parent_id": None if tag.get("parent_key") else area,
                "new_name": None,
            }
            for tag in json.loads(payload)
        ]
        return {"decisions": decisions}

    def complete_json(self, *, system, user, name, schema, deadline=None):
        answers = {
            "interests": lambda: self._interests(user),
            "judge": lambda: self._judge(user),
            # Kontrollen av skyddsnätet (check_safety_net): alla träffar behålls.
            "check": lambda: {"keep": json.loads(user.rpartition("Intressen:\n")[2])},
            "match": lambda: self._match(user),
            "clarify": lambda: {"decisions": []},
            "activities": lambda: {"suggestions": []},
            "text_policy": lambda: {"allowed": REJECT_WORD not in user.lower()},
        }
        if name not in answers:
            raise AIFailed(f"Testläget har inget fejkat svar för {name!r}")
        return answers[name]()


class FakeModerator:
    def flagged(self, texts, deadline=None):
        return [False for _ in texts]


class FakeEmbedder:
    """En fast vektor per text (samma text ger samma vektor)."""

    def embed(self, texts, deadline=None):
        return [_vector(text) for text in texts]


def _vector(text: str) -> list[float]:
    seed = hashlib.sha256(text.encode("utf-8")).digest()
    raw = [seed[i % len(seed)] - 127.5 + (i % 7) for i in range(EMBEDDING_DIMENSIONS)]
    norm = math.sqrt(sum(x * x for x in raw))
    return [x / norm for x in raw]


def install(interest_names: list[str]) -> None:
    set_clients(llm=FakeLLM(interest_names), moderator=FakeModerator(), embedder=FakeEmbedder())
