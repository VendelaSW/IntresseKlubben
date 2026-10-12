"""
Följdfrågor när AI:n är osäker på vad användaren menar, och vilka förslag som blir kvar när ett mer
specifikt förslag täcker ett bredare.

Högst EN följdfråga per förslag, och den ska fånga allt som är oklart. Det är aldrig två frågor i rad om
samma intresse. Vilken fråga det blir avgörs av vad som saknas:
- SPECIFY: användaren nämnde bara ett huvudområde ("Jag gillar musik") som har underintressen, och det
  kan utövas på minst två sätt. Frågan är "Vill du vara lite mer specifik ang genre eller hur du utövar
  ditt intresse för musik?". Alternativen är två sorter i samma fråga: områdets underintressen
  (Metal, Jazz...) och aktiviteterna (Lyssnar på, Spelar...), plus "Bara allmänt". Man kan välja flera, och
  ett svar kan vara det ena, det andra eller båda: Metal och Lyssnar på ger Metal med aktiviteten lyssna,
  bara Lyssnar på ger Musik med aktiviteten lyssna, och "Bara allmänt" ger Musik utan aktivitet.
- NARROW: som SPECIFY, men det finns inget att fråga om i fråga om aktivitet (texten sa redan hur, eller
  intresset kan bara utövas på ett sätt). Då är det bara underintressena som är alternativ.
- ACTIVITY: ett mer specifikt intresse, eller ett område utan underintressen, där texten inte sagt hur man
  håller på med det och det finns minst två sätt. Frågan är "Hur håller du på med Metal?".

Varje alternativ har en `kind` ("interest", "activity" eller "general"), så att den som visar frågan och
den som sparar svaret vet vad som valdes. Alternativen kommer ur biblioteket, så inget modellanrop behövs
och svaret är alltid något som är tillåtet. Högst MAX_FOLLOWUPS frågor totalt, i den ordning användaren
nämnde intressena.

Ett förslag som ligger över ett annat förslag i trädet tas bort: skriver någon "musik och hårdrock" är det
Metal som sparas, inte Musik också, och då ställs ingen fråga om musik. Aktiviteten som sades om det
bredare ("jag lyssnar på musik, särskilt hårdrock") följer med till det specifika.
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
    key: str  # nyckeln på taggen (och förslaget) frågan gäller
    type: str
    question: str
    options: tuple[Option, ...]
    multiple: bool = True  # man kan välja flera, och varje val blir ett eget intresse (narrow) eller en aktivitet


GENERAL = Option("", "Allmänt", GENERAL_KIND)
GENERAL_AREA = "Bara allmänt"
SPECIFY_QUESTION = "Vill du vara lite mer specifik ang genre eller hur du utövar ditt intresse för {name}?"


def _ancestor_ids(match: Match, index: LibraryIndex) -> set[int]:
    """Id:n ovanför förslaget i trädet. För ett nytt intresse är det dess förälder och allt ovanför den."""
    start = match.parent_id if match.kind == "new" else (
        index.by_id[match.interest_id].parent_id if match.interest_id in index.by_id else None
    )
    ids: set[int] = set()
    while start is not None and start in index.by_id and start not in ids:
        ids.add(start)
        start = index.by_id[start].parent_id
    return ids


def drop_covered(matches: list[Match], index: LibraryIndex) -> list[Match]:
    """Förslagen utan de som ett mer specifikt förslag täcker. De som tas bort blir none, så att
    ordningen och nycklarna är kvar. Hade det bredare förslaget en aktivitet och det specifika ingen,
    får det specifika den, om den är tillåten för det."""
    ancestors = [_ancestor_ids(match, index) for match in matches]
    result = list(matches)
    for number, match in enumerate(matches):
        if match.kind != "same":
            continue
        coverers = [i for i, other in enumerate(matches) if i != number and match.interest_id in ancestors[i]]
        if not coverers:
            continue
        result[number] = Match(match.tag, "none")
        if match.activity:
            for i in coverers:
                target = result[i]
                interest_id = target.interest_id if target.kind == "same" else target.parent_id
                if not target.activity and match.activity in index.effective_activities(interest_id):
                    result[i] = replace(target, activity=match.activity)
                    break
    return result


def _name_in_sentence(match: Match, index: LibraryIndex) -> str:
    """Namnet som det står i frågan: ett huvudområde med gemen ("musik"), allt annat som det står
    ("Metal", "Pokémon TCG")."""
    if match.kind == "same":
        item = index.by_id[match.interest_id]
        return item.name.lower() if item.level == 1 else item.name
    return match.name or ""


def _target_id(match: Match) -> int | None:
    return match.interest_id if match.kind == "same" else match.parent_id


def followups(
    matches: list[Match],
    index: LibraryIndex,
    labels: dict[str, str] | None = None,
    allowed: dict[str, list[str]] | None = None,
) -> list[FollowUp]:
    """Följdfrågorna för förslagen (efter drop_covered), högst en per förslag. `labels` är aktiviteternas
    namn ("spela" -> "Spelar"), ur bibliotekets aktivitetslista. Saknas en etikett används sluggen.
    `allowed` är aktiviteterna som gäller för varje förslag (nyckel -> slugs), när de inte bara är
    bibliotekets (se plan). Utan den används bibliotekets lista."""
    labels = labels or {}
    children: dict[int, list] = {}
    for item in index.items:
        if item.parent_id is not None:
            children.setdefault(item.parent_id, []).append(item)

    questions: list[FollowUp] = []
    for match in matches:
        if len(questions) >= MAX_FOLLOWUPS:
            break
        if match.kind == "none":
            continue
        activities = allowed[match.tag.key] if allowed is not None and match.tag.key in allowed else index.effective_activities(_target_id(match))
        activity_options = tuple(Option(slug, labels.get(slug, slug), ACTIVITY_KIND) for slug in activities)
        wants_activity = not match.activity and len(activities) >= 2

        if match.kind == "same" and match.interest_id in index.by_id:
            area = index.by_id[match.interest_id]
            kids = sorted(children.get(area.id, []), key=lambda kid: kid.name)
            if area.level == 1 and kids:
                # Bara ett huvudområde med underintressen: en fråga som fångar både underintresse och aktivitet.
                kid_options = tuple(Option(str(kid.id), kid.name, INTEREST) for kid in kids)
                general = Option("", GENERAL_AREA, GENERAL_KIND)
                if wants_activity:
                    questions.append(
                        FollowUp(match.tag.key, SPECIFY, SPECIFY_QUESTION.format(name=area.name.lower()), (*kid_options, *activity_options, general))
                    )
                else:
                    questions.append(FollowUp(match.tag.key, NARROW, f"Något särskilt inom {area.name.lower()}?", (*kid_options, general)))
                continue

        if wants_activity:
            questions.append(
                FollowUp(match.tag.key, ACTIVITY, f"Hur håller du på med {_name_in_sentence(match, index)}?", (*activity_options, GENERAL))
            )
    return questions


def settle(
    matches: list[Match], index: LibraryIndex, labels: dict[str, str] | None = None
) -> tuple[list[Match], list[FollowUp]]:
    """Förslagen som blir kvar, och följdfrågorna till dem."""
    kept = drop_covered(matches, index)
    return kept, followups(kept, index, labels)


@dataclass
class Plan:
    matches: list[Match]  # förslagen som blir kvar, med sin aktivitet
    followups: list[FollowUp]
    # Aktiviteterna som är tillåtna för varje förslag (nyckel -> slugs): det som får väljas i frågan eller
    # sparas, och det sigillet ska täcka.
    allowed: dict[str, list[str]]


def plan(
    matches: list[Match], index: LibraryIndex, catalog: dict[str, str], deadline: Deadline | None = None
) -> Plan:
    """Förslagen som blir kvar och frågorna till dem, med aktiviteter även för intressen där biblioteket
    saknar en lista: för dem väljer modellen ur `catalog` (slug -> namn), i ett enda anrop och bara om något
    behöver det. Biblioteket vinner när det har en lista. En aktivitet som texten sa för ett sådant intresse
    godtas om den finns i `catalog`, eftersom användaren själv sa den."""
    kept = drop_covered(matches, index)
    live = [m for m in kept if m.kind != "none"]
    gaps = [m for m in live if not index.activities_defined(_target_id(m))]

    subjects = []
    for m in gaps:
        if m.kind == "same" and m.interest_id in index.by_id:
            item = index.by_id[m.interest_id]
            subjects.append(Subject(m.tag.key, item.name, item.path))
        elif m.kind == "new" and m.parent_id in index.by_id:
            parent = index.by_id[m.parent_id]
            subjects.append(Subject(m.tag.key, m.name or m.tag.name, (*parent.path, parent.name)))
    suggestions = suggest_activities(subjects, catalog, deadline)

    allowed: dict[str, list[str]] = {}
    result = list(kept)
    for number, m in enumerate(kept):
        if m.kind == "none":
            continue
        if index.activities_defined(_target_id(m)):
            allowed[m.tag.key] = index.effective_activities(_target_id(m))
            continue
        options = list(suggestions.get(m.tag.key, []))
        if m.tag.activity and m.tag.activity in catalog and m.tag.activity not in options:
            options.append(m.tag.activity)
        allowed[m.tag.key] = options
        result[number] = replace(m, activity=m.tag.activity if m.tag.activity in options else m.activity)
    return Plan(result, followups(result, index, catalog, allowed), allowed)
