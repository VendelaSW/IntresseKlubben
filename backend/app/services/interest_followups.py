"""
Följdfrågor när AI:n är osäker på vad användaren menar.

Hela utläsningens träd sparas: ett intresse och dess subs ("musik" med "hårdrock"). De hör ihop som en
grupp, och högst EN följdfråga ställs per grupp, aldrig två i rad om samma intresse. Vilken fråga det blir
avgörs av vad som saknas:
- SPECIFY: användaren nämnde bara ett huvudområde ("Jag gillar musik") som har underintressen, och det
  kan utövas på minst två sätt. Frågan är "Vill du vara lite mer specifik ang genre eller hur du utövar
  ditt intresse för musik?". Alternativen är två sorter i samma fråga: områdets underintressen
  (Metal, Jazz...) och aktiviteterna (Lyssnar på, Spelar...), plus "Bara allmänt". Man kan välja flera, och
  ett svar kan vara det ena, det andra eller båda.
- NARROW: som SPECIFY, men det finns inget att fråga om i fråga om aktivitet (texten sa redan hur, eller
  intresset kan bara utövas på ett sätt). Då är det bara underintressena som är alternativ.
- ACTIVITY: användaren var redan specifik (en sub, eller ett intresse utan underintressen), texten har inte
  sagt hur man håller på med det och det finns minst två sätt. Frågan är "Hur håller du på med musik?".
  Svaret gäller hela gruppen: den som lyssnar på hårdrock lyssnar på både Musik och Metal.

Ingen fråga ställs när något i gruppen redan har en aktivitet (texten sa hur), eller när det inte finns något
att fråga om. Varje alternativ har en `kind` ("interest", "activity" eller "general"). Alternativen kommer ur
biblioteket, så svaret är alltid något som är tillåtet. Högst MAX_FOLLOWUPS frågor totalt, i den ordning
användaren nämnde intressena.

Aktiviteterna som är tillåtna för ett förslag är bibliotekets lista (egen eller ärvd). Saknas en lista,
varken egen eller ärvd, väljer modellen ur den fasta aktivitetslistan (interest_activities.py).
"""

from dataclasses import dataclass, replace

from app.services.ai_clients import Deadline
from app.services.interest_activities import Subject, suggest_activities
from app.services.interest_matching import LibraryIndex, Match

MAX_FOLLOWUPS = 3
SPECIFY = "specify"  # både underintresse och aktivitet i samma fråga
NARROW = "narrow"  # bara underintresse
ACTIVITY = "activity"  # bara aktivitet

# Vad ett alternativ är.
INTEREST = "interest"
ACTIVITY_KIND = "activity"
GENERAL_KIND = "general"


@dataclass(frozen=True)
class Option:
    value: str  # intressets id som text, aktivitetens slug, eller "" för allmänt
    label: str
    kind: str  # INTEREST, ACTIVITY_KIND eller GENERAL_KIND


@dataclass(frozen=True)
class FollowUp:
    key: str  # nyckeln på förslaget (överst i gruppen) frågan gäller
    type: str
    question: str
    options: tuple[Option, ...]
    multiple: bool = True  # man kan välja flera, och varje val blir ett eget intresse (narrow) eller en aktivitet
    # Nycklarna på alla förslag i gruppen som svaret gäller (en aktivitet sätts på hela gruppen).
    applies_to: tuple[str, ...] = ()


GENERAL = Option("", "Allmänt", GENERAL_KIND)
GENERAL_AREA = "Bara allmänt"
SPECIFY_QUESTION = "Vill du vara lite mer specifik ang genre eller hur du utövar ditt intresse för {name}?"


@dataclass
class Plan:
    matches: list[Match]  # förslagen, med sin aktivitet
    followups: list[FollowUp]
    # Aktiviteterna som är tillåtna för varje förslag (nyckel -> slugs): det som får väljas i frågan eller
    # sparas, och det sigillet ska täcka.
    allowed: dict[str, list[str]]


def _target_id(match: Match) -> int | None:
    return match.interest_id if match.kind == "same" else match.parent_id


def _groups(matches: list[Match]) -> list[list[Match]]:
    """Förslagen som grupper i den ordning de nämndes: ett intresse överst med sina subs. En sub vars
    överordnade inte blev ett förslag (none) står för sig själv."""
    live = {m.tag.key: m for m in matches if m.kind != "none"}
    groups: list[list[Match]] = []
    for match in matches:
        if match.kind == "none":
            continue
        parent = match.tag.parent_key
        if parent is not None and parent in live:
            continue  # kommer med sin överordnade
        groups.append([match, *[m for m in matches if m.kind != "none" and m.tag.parent_key == match.tag.key]])
    return groups


def _name_in_sentence(match: Match, index: LibraryIndex) -> str:
    """Namnet som det står i frågan: ett huvudområde med gemen ("musik"), allt annat som det står
    ("Metal", "Pokémon TCG")."""
    if match.kind == "same":
        item = index.by_id[match.interest_id]
        return item.name.lower() if item.level == 1 else item.name
    return match.name or ""


def followups(
    matches: list[Match],
    index: LibraryIndex,
    labels: dict[str, str] | None = None,
    allowed: dict[str, list[str]] | None = None,
) -> list[FollowUp]:
    """Följdfrågorna för förslagen, högst en per grupp. `labels` är aktiviteternas namn ("spela" ->
    "Spelar"), ur bibliotekets aktivitetslista. Saknas en etikett används sluggen. `allowed` är
    aktiviteterna som gäller för varje förslag (nyckel -> slugs), när de inte bara är bibliotekets (se plan)."""
    labels = labels or {}
    children: dict[int, list] = {}
    for item in index.items:
        if item.parent_id is not None:
            children.setdefault(item.parent_id, []).append(item)

    def activities_for(match: Match) -> list[str]:
        if allowed is not None and match.tag.key in allowed:
            return allowed[match.tag.key]
        return index.effective_activities(_target_id(match))

    questions: list[FollowUp] = []
    for group in _groups(matches):
        if len(questions) >= MAX_FOLLOWUPS:
            break
        top, subs = group[0], group[1:]
        applies_to = tuple(m.tag.key for m in group)
        activities = activities_for(top)
        activity_options = tuple(Option(slug, labels.get(slug, slug), ACTIVITY_KIND) for slug in activities)
        wants_activity = not any(m.activity for m in group) and len(activities) >= 2

        if not subs and top.kind == "same" and top.interest_id in index.by_id:
            area = index.by_id[top.interest_id]
            kids = sorted(children.get(area.id, []), key=lambda kid: kid.name)
            if area.level == 1 and kids:
                # Bara ett huvudområde med underintressen: en fråga som fångar både underintresse och aktivitet.
                kid_options = tuple(Option(str(kid.id), kid.name, INTEREST) for kid in kids)
                general = Option("", GENERAL_AREA, GENERAL_KIND)
                if wants_activity:
                    options = (*kid_options, *activity_options, general)
                    questions.append(
                        FollowUp(top.tag.key, SPECIFY, SPECIFY_QUESTION.format(name=area.name.lower()), options, applies_to=applies_to)
                    )
                else:
                    options = (*kid_options, general)
                    questions.append(
                        FollowUp(top.tag.key, NARROW, f"Något särskilt inom {area.name.lower()}?", options, applies_to=applies_to)
                    )
                continue

        if wants_activity:
            questions.append(
                FollowUp(
                    top.tag.key,
                    ACTIVITY,
                    f"Hur håller du på med {_name_in_sentence(top, index)}?",
                    (*activity_options, GENERAL),
                    applies_to=applies_to,
                )
            )
    return questions


def plan(
    matches: list[Match], index: LibraryIndex, catalog: dict[str, str], deadline: Deadline | None = None
) -> Plan:
    """Förslagen och frågorna till dem, med aktiviteter även för intressen där biblioteket saknar en lista: för
    dem väljer modellen ur `catalog` (slug -> namn), i ett enda anrop och bara om något behöver det.
    Biblioteket vinner när det har en lista. En aktivitet som texten sa för ett sådant intresse godtas om
    den finns i `catalog`, eftersom användaren själv sa den. Sades en aktivitet om något i en grupp (intresset
    och dess subs) gäller den hela gruppen, där den är tillåten."""
    live = [m for m in matches if m.kind != "none"]
    gaps = [m for m in live if not index.activities_defined(_target_id(m))]

    subjects = []
    for m in gaps:
        if m.kind == "same" and m.interest_id in index.by_id:
            item = index.by_id[m.interest_id]
            subjects.append(Subject(m.tag.key, item.name, item.path))
        elif m.kind == "new" and m.parent_id in index.by_id:
            parent = index.by_id[m.parent_id]
            subjects.append(Subject(m.tag.key, m.name or m.tag.name, (*parent.path, parent.name)))
        elif m.kind == "new":  # en sub under ett nytt intresse: samma lista som det intresset
            subjects.append(Subject(m.tag.key, m.name or m.tag.name, ()))
    suggestions = suggest_activities(subjects, catalog, deadline)

    allowed: dict[str, list[str]] = {}
    result = list(matches)
    positions = {m.tag.key: number for number, m in enumerate(matches)}
    for m in live:
        if index.activities_defined(_target_id(m)):
            allowed[m.tag.key] = index.effective_activities(_target_id(m))
            continue
        options = list(suggestions.get(m.tag.key, []))
        if m.tag.activity and m.tag.activity in catalog and m.tag.activity not in options:
            options.append(m.tag.activity)
        allowed[m.tag.key] = options
        result[positions[m.tag.key]] = replace(m, activity=m.tag.activity if m.tag.activity in options else m.activity)

    # Aktiviteten som sades om något i gruppen gäller hela gruppen, där den är tillåten.
    for group in _groups(result):
        said = next((m.activity for m in group if m.activity), "")
        if not said:
            continue
        for m in group:
            if not m.activity and said in allowed.get(m.tag.key, []):
                result[positions[m.tag.key]] = replace(m, activity=said)

    return Plan(result, followups(result, index, catalog, allowed), allowed)
