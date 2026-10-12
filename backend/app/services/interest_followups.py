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


def followups(matches: list[Match], index: LibraryIndex, labels: dict[str, str] | None = None) -> list[FollowUp]:
    """Följdfrågorna för förslagen (efter drop_covered), högst en per förslag. `labels` är aktiviteternas
    namn ("spela" -> "Spelar"), ur bibliotekets aktivitetslista. Saknas en etikett används sluggen."""
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
        interest_id = match.interest_id if match.kind == "same" else match.parent_id
        activities = index.effective_activities(interest_id)
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
