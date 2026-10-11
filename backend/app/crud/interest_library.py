"""
Intressebiblioteket: app/data/interests.json är källan till alla intressen.

load_library läser filen och kontrollerar den (unika slugs, föräldrar som
finns, inga cirklar), så att ett trasigt bibliotek stoppas i testerna redan i
PR:en. sync_library för in biblioteket i databasen:

- nya intressen läggs till, befintliga uppdateras (matchas på slug, så att
  namnet kan ändras utan att kopplingarna försvinner)
- ingenting raderas: ett intresse från biblioteket som inte längre finns i
  filen markeras som inaktivt, så att användare, klubbar och events som pekar
  på det inte går sönder
- intressen som inte kommer från biblioteket (source user_suggestion eller ai)
  rörs inte

Körs efter merge med python -m app.sync_interests (se app/sync_interests.py).
"""

import json
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.interest import Interest, InterestSource, InterestStatus

LIBRARY_PATH = Path(__file__).resolve().parent.parent / "data" / "interests.json"


class LibraryError(Exception):
    """Biblioteksfilen är trasig. Meddelandet listar alla fel."""


@dataclass
class LibraryEntry:
    slug: str
    name: str
    parent: str | None = None
    description: str | None = None
    aliases: list[str] = field(default_factory=list)


def slugify(name: str) -> str:
    """'Klättring' -> 'klattring', 'Tv-spel' -> 'tv-spel'. Samma regel som
    migrationen d2f8a6c41b07 använde för dagens intressen."""
    text = unicodedata.normalize("NFKD", name.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def parse_library(data: dict) -> list[LibraryEntry]:
    """Kontrollerar bibliotekets innehåll och returnerar posterna med
    föräldrarna före sina barn. Kastar LibraryError med alla fel på en gång."""
    errors = []
    entries = []
    for i, raw in enumerate(data.get("interests", [])):
        slug, name = raw.get("slug"), raw.get("name")
        if not slug or not name:
            errors.append(f"Post {i + 1} saknar slug eller name.")
            continue
        if slug != slugify(slug):
            errors.append(f"Ogiltig slug {slug!r}: bara a-z, 0-9 och bindestreck.")
        entries.append(LibraryEntry(
            slug=slug,
            name=name.strip(),
            parent=raw.get("parent"),
            description=raw.get("description"),
            aliases=[a.strip() for a in raw.get("aliases", []) if a.strip()],
        ))

    by_slug = {}
    for entry in entries:
        if entry.slug in by_slug:
            errors.append(f"Slug {entry.slug!r} finns flera gånger.")
        by_slug[entry.slug] = entry
    for entry in entries:
        if entry.parent is not None and entry.parent not in by_slug:
            errors.append(f"{entry.slug!r} har förälder {entry.parent!r}, som inte finns.")

    # Cirklar: följ föräldrarna uppåt; kommer vi tillbaka till en post är det en cirkel.
    for entry in entries:
        seen = {entry.slug}
        parent = entry.parent
        while parent is not None and parent in by_slug:
            if parent in seen:
                errors.append(f"{entry.slug!r} ingår i en cirkel av föräldrar.")
                break
            seen.add(parent)
            parent = by_slug[parent].parent

    if errors:
        raise LibraryError("Intressebiblioteket är trasigt:\n- " + "\n- ".join(errors))

    def depth(entry):
        d = 0
        while entry.parent is not None:
            entry = by_slug[entry.parent]
            d += 1
        return d

    return sorted(entries, key=depth)


def load_library(path: Path = LIBRARY_PATH) -> list[LibraryEntry]:
    return parse_library(json.loads(path.read_text(encoding="utf-8")))


@dataclass
class SyncResult:
    added: int = 0
    updated: int = 0
    deactivated: int = 0


def sync_library(db: Session, entries: list[LibraryEntry]) -> SyncResult:
    """För in biblioteket i databasen. Kan köras hur många gånger som helst:
    utan ändringar i filen ändras ingenting."""
    result = SyncResult()
    existing = {i.slug: i for i in db.query(Interest).filter(Interest.slug.isnot(None)).all()}

    for entry in entries:  # föräldrar före barn, så att föräldern finns
        interest = existing.get(entry.slug)
        values = {
            "name": entry.name,
            "parent_id": existing[entry.parent].id if entry.parent else None,
            "description": entry.description,
            "aliases": "\n".join(entry.aliases) or None,
            "status": InterestStatus.active.value,
            "source": InterestSource.library.value,
        }
        if interest is None:
            interest = Interest(slug=entry.slug, **values)
            db.add(interest)
            db.flush()  # ger id, som barnen behöver
            existing[entry.slug] = interest
            result.added += 1
        elif any(getattr(interest, key) != value for key, value in values.items()):
            for key, value in values.items():
                setattr(interest, key, value)
            result.updated += 1

    in_file = {entry.slug for entry in entries}
    for interest in existing.values():
        if (
            interest.slug not in in_file
            and interest.source == InterestSource.library.value
            and interest.status == InterestStatus.active.value
        ):
            interest.status = InterestStatus.inactive.value
            result.deactivated += 1

    db.commit()
    return result
