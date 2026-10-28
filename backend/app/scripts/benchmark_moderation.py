"""Benchmark the local profanity filter against a small, manually labeled set.

Run from ``backend/`` with:
    python -m app.scripts.benchmark_moderation

This diagnostic measures only the local word filter and makes no network calls.
"""

from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter

from app.core.profanity import contains_profanity


@dataclass(frozen=True)
class Example:
    category: str
    text: str
    prohibited: bool


@dataclass(frozen=True)
class Result:
    example: Example
    flagged: bool
    latency_ms: float


EXAMPLES = (
    Example("Tydligt otillåtna", "Jag ska leta upp tränaren och skada honom.", True),
    Example("Tydligt otillåtna", "Jag tänker hota arrangören tills han ställer in eventet.", True),
    Example("Tydligt otillåtna", "Vi borde slå våra nya medlemmar så att de lämnar klubben.", True),
    Example("Tydligt otillåtna", "Jag ska följa efter min granne och misshandla honom.", True),
    Example("Tydligt otillåtna", "Alla deltagare förtjänar att bli slagna.", True),
    Example("Tydligt otillåtna", "I kväll ska jag förstöra ledarens bil och vänta på honom.", True),
    Example("Maskerade/leetspeak", "Din f1ttan förstörde mötet.", True),
    Example("Maskerade/leetspeak", "H0ran ska lämna klubben.", True),
    Example("Maskerade/leetspeak", "Du är fuuuuck dum.", True),
    Example("Maskerade/leetspeak", "fuck_you", True),
    Example("Maskerade/leetspeak", "fuck123", True),
    Example("Maskerade/leetspeak", "f1ttan123", True),
    Example("Normala klubb-/eventtexter", "Vi ses vid entrén klockan 18 för löpning.", False),
    Example("Normala klubb-/eventtexter", "Klubben ordnar en öppen schackkväll på torsdag.", False),
    Example("Normala klubb-/eventtexter", "Anmälan till höstens musikträff är nu öppen.", False),
    Example("Normala klubb-/eventtexter", "Vi behöver fler volontärer till helgens lopp.", False),
    Example("Normala klubb-/eventtexter", "Ta med vattenflaska och bekväma skor till vandringen.", False),
    Example("Normala klubb-/eventtexter", "Eventet flyttas till samlingslokalen på grund av regn.", False),
    Example("Falsklarm-fällor", "Slut på lagret för kaffefilter; ny leverans kommer på fredag.", False),
    Example("Falsklarm-fällor", "Vi läser om nazismens historia och motståndsrörelsen.", False),
    Example("Falsklarm-fällor", "Fagottgruppen övar inför vårkonserten.", False),
    Example("Falsklarm-fällor", "Vi följer horisonten på kartan över vandringsleden.", False),
    Example("Falsklarm-fällor", "En föreläsning om hormoner och återhämtning efter träning.", False),
    Example("Falsklarm-fällor", "Vi diskuterar våldsskildringar i film och litteratur.", False),
)


def _confusion(results: tuple[Result, ...]) -> dict[str, int]:
    counts = {"TP": 0, "FP": 0, "FN": 0, "TN": 0}
    for result in results:
        key = (
            ("TP" if result.flagged else "FN")
            if result.example.prohibited
            else ("FP" if result.flagged else "TN")
        )
        counts[key] += 1
    return counts


def _percent(numerator: int, denominator: int) -> str:
    return "n/a" if denominator == 0 else f"{numerator / denominator:.1%}"


def run() -> tuple[Result, ...]:
    results = []
    for example in EXAMPLES:
        started = perf_counter()
        flagged = contains_profanity(example.text)
        results.append(Result(example, flagged, (perf_counter() - started) * 1000))

    measured = tuple(results)
    print("SCRUM-266: lokalt ordfilter (24 manuellt märkta meningar)")
    print("Diagnostiskt urval; resultaten är inte en generell kvalitetsmätning.\n")
    print("| # | Kategori | Facit | Lokalt | Latency ms | Text |")
    print("|---:|---|---|---|---:|---|")
    for index, result in enumerate(measured, start=1):
        example = result.example
        text = example.text.replace("|", "\\|")
        print(
            f"| {index} | {example.category} | {'OTILLÅTEN' if example.prohibited else 'OK'} "
            f"| {'FLAGG' if result.flagged else 'OK'} | {result.latency_ms:.3f} | {text} |"
        )

    counts = _confusion(measured)
    total = len(measured)
    print("\nMått                 Värde")
    print("-------------------- ------")
    print(f"Träffsäkerhet         {_percent(counts['TP'] + counts['TN'], total)}")
    print(f"Precision             {_percent(counts['TP'], counts['TP'] + counts['FP'])}")
    print(f"Recall                {_percent(counts['TP'], counts['TP'] + counts['FN'])}")
    print(f"Missade otillåtna     {counts['FN']}")
    print(f"Falsklarm             {counts['FP']}")
    print(f"Genomsnittlig latency {sum(row.latency_ms for row in measured) / total:.3f} ms")
    return measured


if __name__ == "__main__":
    run()
