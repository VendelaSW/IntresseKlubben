"""
Analysen av användarens text: från fri text till förslag på intressen, med ett sigill över dem
(POST /interests/analyze, se app/api/routes/interest_analysis.py).

Stegen, med allt delad på en tidsgräns (se Deadline) så att analysen ryms i backendens funktionstid:
1. Utläsning (interest_extractor): modellen gör texten till ett träd av taggar, med skydden mot olämpligt innehåll.
2. Matchning (interest_matching): varje tagg blir ett intresse som finns, ett nytt intresse med en förälder, eller
   inget.
3. Aktivitet (interest_followups.plan): modellen läser ut hur användaren håller på med intresset, men bara om texten
   säger det. Gissas aldrig. Följdfrågor byggs men skickas bara om de är påslagna (settings.interest_followups).
4. Förslagen får nycklar (p1, p2...) och en kompakt form som sigillet täcker (analysis_token).

Inget sparas. Förslagen sparas i ett senare steg, och bara de som har ett giltigt sigill godtas där.
"""

from dataclasses import dataclass, field

from app.services.ai_clients import Deadline
from app.services.interest_extractor import extract_interests
from app.services.interest_followups import FollowUp, plan
from app.services.interest_matching import LibraryIndex, Match, match_tags, tags_from_tree


@dataclass
class Analysis:
    proposals: list[dict] = field(default_factory=list)  # förslagen som de visas för användaren
    followups: list[dict] = field(default_factory=list)  # följdfrågorna (tom om de inte är påslagna)
    sealed: list[dict] = field(default_factory=list)  # förslagen i den kompakta form sigillet täcker


def display_name(name: str) -> str:
    """Namnet på ett nytt intresse med stor första bokstav, som i biblioteket ("modellbygge" -> "Modellbygge").
    Resten lämnas som det står, så att "Call of Duty" och "PC-spel" inte ändras."""
    return name[:1].upper() + name[1:]


def _interest_ref(match: Match, index: LibraryIndex, keys: dict[str, str], built: dict[str, dict]) -> dict:
    """Intresset förslaget pekar på: id, namn, plats i trädet och om det är nytt."""
    if match.kind == "same":
        item = index.by_id[match.interest_id]
        return {"id": item.id, "name": item.name, "path": list(item.path), "is_new": False, "parent_key": None}
    name = display_name(match.name or match.tag.name)
    if match.parent_key is not None:  # en sub under ett annat nytt förslag i samma analys
        parent = built[keys[match.parent_key]]["interest"]
        return {"id": None, "name": name, "path": [*parent["path"], parent["name"]], "is_new": True, "parent_key": keys[match.parent_key]}
    parent_item = index.by_id[match.parent_id]
    return {"id": None, "name": name, "path": [*parent_item.path, parent_item.name], "is_new": True, "parent_key": None}


def _sealed(proposal: dict, match: Match, allowed: list[str], keys: dict[str, str]) -> dict:
    """Förslaget i kompakt form: det som behövs för att spara det, och det som är tillåtet att välja."""
    claim: dict = {"key": proposal["key"], "activity": proposal["activity"], "allowed": allowed}
    if match.kind == "same":
        claim["interest_id"] = match.interest_id
    else:
        new = {"name": proposal["interest"]["name"]}
        if match.parent_key is not None:
            new["parent_key"] = keys[match.parent_key]
        else:
            new["parent_id"] = match.parent_id
        claim["new"] = new
    return claim


def _followup(question: FollowUp, keys: dict[str, str]) -> dict | None:
    if question.key not in keys:
        return None
    return {
        "key": keys[question.key],
        "type": question.type,
        "question": question.question,
        "multiple": question.multiple,
        "applies_to": [keys[k] for k in question.applies_to if k in keys],
        "options": [{"value": o.value, "label": o.label, "kind": o.kind} for o in question.options],
    }


def analyze(text: str, index: LibraryIndex, catalog: dict[str, str], followups_enabled: bool = False) -> Analysis:
    """Förslagen på intressen i `text`, mot biblioteket i `index` och aktiviteterna i `catalog` (slug -> namn).
    Kastar AINotConfigured om AI-tjänsten inte är inställd, och AIFailed om ett steg misslyckas eller tiden tar slut."""
    deadline = Deadline()
    tags = tags_from_tree(extract_interests(text, deadline))
    if not tags:
        return Analysis()
    result = plan(match_tags(tags, index, deadline), index, catalog, deadline, text=text)

    live = [m for m in result.matches if m.kind != "none"]
    keys = {m.tag.key: f"p{number}" for number, m in enumerate(live, 1)}
    built: dict[str, dict] = {}
    sealed: list[dict] = []
    for match in live:  # överst i trädet först, så att en sub hittar sin förälder
        key = keys[match.tag.key]
        built[key] = {
            "key": key,
            "label": None,  # användarens egna ord om intresset: kommer när utläsningen ger dem
            "interest": _interest_ref(match, index, keys, built),
            "activity": match.activity,
        }
        sealed.append(_sealed(built[key], match, result.allowed.get(match.tag.key, []), keys))

    followups = []
    if followups_enabled:
        followups = [f for f in (_followup(q, keys) for q in result.followups) if f is not None]
    return Analysis(list(built.values()), followups, sealed)
