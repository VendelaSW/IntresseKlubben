"""
Följdfrågor när AI:n är osäker på vad användaren menar, och vilka förslag som blir kvar när ett mer
specifikt förslag täcker ett bredare.

Två sorters frågor, och de kommer i den här ordningen för ett intresse:
1. NARROW: användaren nämnde bara ett huvudområde ("Jag gillar musik") som har underintressen. Frågan är
   "Något särskilt inom musik?", med områdets underintressen som alternativ plus "Bara allmänt". Svarar
   man allmänt är det området självt som sparas och visas på profilen, och väljer man något är det det
   som sparas, utan området ovanför.
2. ACTIVITY: texten har inte sagt hur man håller på med intresset, och intresset kan utövas på minst två
   sätt. Frågan är "Hur håller du på med Metal?", med intressets aktiviteter (spelar, lyssnar på...) plus
   "Allmänt". Man kan välja flera, och varje val blir en aktivitet.

För ett huvudområde med underintressen ställs bara den första frågan. Aktivitetsfrågan om det man valde
kommer efter den, och för att den ska gå att ställa utan ett nytt anrop bär varje alternativ i den första
frågan sina aktiviteter (Option.activities), eftersom ett underintresse kan ha en annan lista än området.

Alternativen kommer ur biblioteket, så inget modellanrop behövs och svaret är alltid något som är tillåtet.
Högst MAX_FOLLOWUPS frågor, i den ordning användaren nämnde intressena.

Ett förslag som ligger över ett annat förslag i trädet tas bort: skriver någon "musik och hårdrock" är det
Metal som sparas, inte Musik också, och då ställs ingen fråga om musik. Aktiviteten som sades om det
bredare ("jag lyssnar på musik, särskilt hårdrock") följer med till det specifika.
"""

from dataclasses import dataclass, replace

from app.services.interest_matching import LibraryIndex, Match

MAX_FOLLOWUPS = 3
NARROW = "narrow"
ACTIVITY = "activity"


@dataclass(frozen=True)
class Option:
    value: str  # intressets id som text (narrow) eller aktivitetens slug (activity), eller "" för allmänt
    label: str
    # Bara för narrow: aktiviteterna som gäller om man väljer alternativet, så att nästa fråga går att
    # ställa direkt. För "Bara allmänt" är det områdets egna.
    activities: tuple[str, ...] = ()


@dataclass(frozen=True)
class FollowUp:
    key: str  # nyckeln på taggen (och förslaget) frågan gäller
    type: str
    question: str
    options: tuple[Option, ...]
    multiple: bool = True  # man kan välja flera, och varje val blir ett eget intresse (narrow) eller en aktivitet


GENERAL = Option("", "Allmänt")
GENERAL_AREA = "Bara allmänt"


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
    """Följdfrågorna för förslagen (efter drop_covered). `labels` är aktiviteternas namn ("spela" ->
    "Spelar"), ur bibliotekets aktivitetslista. Saknas en etikett används sluggen."""
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

        # 1. Bara ett huvudområde med underintressen: fråga om något särskilt inom det.
        if match.kind == "same" and match.interest_id in index.by_id:
            area = index.by_id[match.interest_id]
            kids = sorted(children.get(area.id, []), key=lambda kid: kid.name)
            if area.level == 1 and kids:
                options = tuple(Option(str(kid.id), kid.name, tuple(index.effective_activities(kid.id))) for kid in kids)
                general = Option("", GENERAL_AREA, tuple(index.effective_activities(area.id)))
                questions.append(FollowUp(match.tag.key, NARROW, f"Något särskilt inom {area.name.lower()}?", (*options, general)))
                continue

        # 2. Texten sa inte hur man håller på med det, och det finns flera sätt: fråga om aktiviteten.
        if match.activity:
            continue
        interest_id = match.interest_id if match.kind == "same" else match.parent_id
        activities = index.effective_activities(interest_id)
        if len(activities) < 2:
            continue
        options = tuple(Option(slug, labels.get(slug, slug)) for slug in activities)
        questions.append(FollowUp(match.tag.key, ACTIVITY, f"Hur håller du på med {_name_in_sentence(match, index)}?", (*options, GENERAL)))
    return questions


def settle(
    matches: list[Match], index: LibraryIndex, labels: dict[str, str] | None = None
) -> tuple[list[Match], list[FollowUp]]:
    """Förslagen som blir kvar, och följdfrågorna till dem."""
    kept = drop_covered(matches, index)
    return kept, followups(kept, index, labels)
