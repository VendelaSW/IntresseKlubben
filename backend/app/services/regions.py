"""
Sveriges områden för klubbarnas räckvidd (SCRUM-282, se GroupScope i models/group.py): landsdelar,
landskap, län och vilket län och landskap varje kommun hör till.

Datan i data/regions.json är byggd ur kartans egna filer (frontend/src/pages/mapPrototype*.json), så att
klubbarna hamnar i samma områden som kartan visar. En kommuns landskap är det landskap där störst del av
kommunen ligger, utom där kartans förenklade landskapsytor ger fel: Stockholm räknas till Uppland, och
Göteborg och Mölndal till Västergötland. Kommunernas namn finns i tabellen municipalities.
"""

import json
from functools import cache
from pathlib import Path

from app.models.group import GroupScope

REGIONS_FILE = Path(__file__).resolve().parent.parent / "data" / "regions.json"
COUNTRY_CODE = "SE"
COUNTRY_NAME = "Hela Sverige"


@cache
def regions() -> dict:
    """Hela datan: {landsdelar, landskap, lan, kommuner}. Läses en gång."""
    return json.loads(REGIONS_FILE.read_text(encoding="utf-8"))


@cache
def _names() -> dict[str, dict[str, str]]:
    data = regions()
    return {
        GroupScope.landsdel.value: {r["kod"]: r["namn"] for r in data["landsdelar"]},
        GroupScope.landskap.value: {r["kod"]: r["namn"] for r in data["landskap"]},
        GroupScope.lan.value: {r["kod"]: r["namn"] for r in data["lan"]},
    }


def is_known_area(scope: GroupScope, code: str) -> bool:
    """Finns området? Kommunerna kollas mot databasen av den som anropar (de finns inte alla här)."""
    if scope == GroupScope.country:
        return code == COUNTRY_CODE
    if scope == GroupScope.kommun:
        return code in regions()["kommuner"]
    return code in _names()[scope.value]


def area_name(scope: str, code: str, municipality_name: str | None = None) -> str:
    """Områdets namn att visa: "Hela Sverige", "Norrland", "Lappland", "Västerbottens län" eller kommunens namn."""
    if scope == GroupScope.country.value:
        return COUNTRY_NAME
    if scope == GroupScope.kommun.value:
        return municipality_name or code
    return _names()[scope].get(code, code)


def areas_of_kommun(kommun_code: str) -> list[tuple[str, str]]:
    """Alla områden en kommun ligger i, som (räckvidd, kod): kommunen, länet, landskapet, landsdelen och
    hela Sverige. En klubb gäller kommunen om den har någon av dem (t.ex. en Norrlandsklubb för Umeå)."""
    areas = [(GroupScope.kommun.value, kommun_code), (GroupScope.country.value, COUNTRY_CODE)]
    place = regions()["kommuner"].get(kommun_code)
    if place is not None:
        landskap = next(r for r in regions()["landskap"] if r["kod"] == place["landskap"])
        areas += [
            (GroupScope.lan.value, place["lan"]),
            (GroupScope.landskap.value, place["landskap"]),
            (GroupScope.landsdel.value, landskap["landsdel"]),
        ]
    return areas
