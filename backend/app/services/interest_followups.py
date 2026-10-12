"""
Följdfrågor om hur man håller på med ett intresse, och vilka förslag som blir kvar när ett mer specifikt
förslag täcker ett bredare.

Poängen med följdfrågan är aktiviteten: "Jag gillar musik" säger inte om man lyssnar, spelar eller
skapar, och det avgör vem man passar ihop med. Reglerna:
- En fråga ställs för ett förslag bara när texten inte redan sagt hur man håller på med det (förslaget
  har ingen aktivitet) och intresset kan utövas på minst två sätt. Kan det bara utövas på ett sätt, eller
  inte alls, finns inget att fråga om.
- Alternativen är intressets aktiviteter ur biblioteket (spelar, lyssnar på...), plus "Allmänt". Man kan
  välja flera, och varje val blir en aktivitet på intresset. Därför behövs inget modellanrop för
  frågorna, och svaret är alltid en aktivitet som är tillåten för intresset.
- Högst MAX_FOLLOWUPS frågor, i den ordning användaren nämnde intressena.
- Ett förslag som ligger över ett annat förslag i trädet tas bort: skriver någon "musik och hårdrock" är
  det Metal som sparas, inte Musik också. Aktiviteten som sades om det bredare ("jag lyssnar på musik,
  särskilt hårdrock") följer med till det specifika.
"""

from dataclasses import dataclass, replace

from app.services.interest_matching import LibraryIndex, Match

MAX_FOLLOWUPS = 3
ACTIVITY = "activity"


@dataclass(frozen=True)
class Option:
    value: str  # aktivitetens slug, eller "" för "Allmänt"
    label: str


@dataclass(frozen=True)
class FollowUp:
    key: str  # nyckeln på taggen (och förslaget) frågan gäller
    type: str
    question: str
    options: tuple[Option, ...]
    multiple: bool = True  # man kan välja flera aktiviteter, och varje blir en egen rad på profilen


GENERAL = Option("", "Allmänt")


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
    questions: list[FollowUp] = []
    for match in matches:
        if len(questions) >= MAX_FOLLOWUPS:
            break
        if match.kind == "none" or match.activity:
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
