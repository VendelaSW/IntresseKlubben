"""
Följdfrågor när användaren bara nämnde ett huvudområde ("Jag gillar musik"), och vilka förslag som blir
kvar när ett mer specifikt förslag täcker ett bredare.

Reglerna (se ticketen om analys av intressen):
- Ett förslag som ligger över ett annat förslag i trädet tas bort: skriver någon "musik och hårdrock" är
  det Metal som sparas, inte Musik också. Ett område eller intresse läggs bara till om användaren sagt
  det själv och inget mer specifikt under det.
- En följdfråga ställs bara om förslaget är ett huvudområde och det inte finns något mer specifikt under
  det bland förslagen. Frågan är "Något speciellt inom musik?", och alternativen är områdets
  underintressen ur biblioteket, plus "Bara allmänt". Därför behövs inget modellanrop för frågorna.
- Högst MAX_FOLLOWUPS frågor, i den ordning användaren nämnde intressena.

Följdfrågor om hur man utövar intresset (spelar, samlar) ställs inte än, eftersom profilen inte visar
aktivitet.
"""

from dataclasses import dataclass

from app.services.interest_matching import LibraryIndex, Match

MAX_FOLLOWUPS = 3
NARROW = "narrow"


@dataclass(frozen=True)
class Option:
    value: str  # intressets id som text, eller "" för "Bara allmänt"
    label: str


@dataclass(frozen=True)
class FollowUp:
    key: str  # nyckeln på taggen (och förslaget) frågan gäller
    type: str
    question: str
    options: tuple[Option, ...]


GENERAL = Option("", "Bara allmänt")


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
    ordningen och nycklarna är kvar."""
    ancestors = [_ancestor_ids(match, index) for match in matches]
    covered = set().union(*ancestors) if ancestors else set()
    kept = []
    for match in matches:
        if match.kind == "same" and match.interest_id in covered:
            kept.append(Match(match.tag, "none"))
        else:
            kept.append(match)
    return kept


def followups(matches: list[Match], index: LibraryIndex) -> list[FollowUp]:
    """Följdfrågorna för förslagen (efter drop_covered): en för varje förslag som bara är ett huvudområde
    som har underintressen."""
    children: dict[int, list] = {}
    for item in index.items:
        if item.parent_id is not None:
            children.setdefault(item.parent_id, []).append(item)

    questions: list[FollowUp] = []
    for match in matches:
        if len(questions) >= MAX_FOLLOWUPS:
            break
        if match.kind != "same" or match.interest_id not in index.by_id:
            continue
        area = index.by_id[match.interest_id]
        kids = children.get(area.id, [])
        if area.level != 1 or not kids:
            continue
        options = tuple(Option(str(kid.id), kid.name) for kid in sorted(kids, key=lambda kid: kid.name))
        questions.append(FollowUp(match.tag.key, NARROW, f"Något speciellt inom {area.name.lower()}?", (*options, GENERAL)))
    return questions


def settle(matches: list[Match], index: LibraryIndex) -> tuple[list[Match], list[FollowUp]]:
    """Förslagen som blir kvar, och följdfrågorna till dem."""
    kept = drop_covered(matches, index)
    return kept, followups(kept, index)
