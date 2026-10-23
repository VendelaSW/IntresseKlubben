"""Benchmark the local profanity filter against the remote Hugging Face classifier.

Run from ``backend/`` with:
    python -m app.scripts.benchmark_moderation

The manually assigned labels below are a small diagnostic set, not a general
estimate of moderation quality. Review the text and labels before pasting the
results into SCRUM-266.
"""

from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter

from app.core.profanity import contains_profanity
from app.services.ai_clients import Deadline, ToxicityResult, get_toxicity_classifier
from app.services.text_moderation import TOXICITY_THRESHOLD


@dataclass(frozen=True)
class Example:
    category: str
    text: str
    prohibited: bool


@dataclass(frozen=True)
class Result:
    example: Example
    local_flagged: bool
    ai_flagged: bool | None
    score: float | None
    latency_ms: float
    error: str | None = None


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


def _classify(classifier, text: str) -> tuple[ToxicityResult | None, float, str | None]:
    started = perf_counter()
    try:
        result = classifier.classify(text, Deadline())
    except Exception as error:
        return None, (perf_counter() - started) * 1000, type(error).__name__
    return result, (perf_counter() - started) * 1000, None


def _confusion(examples: list[Example], predictions: list[bool]) -> dict[str, int]:
    counts = {"TP": 0, "FP": 0, "FN": 0, "TN": 0}
    for example, flagged in zip(examples, predictions, strict=True):
        key = (
            "TP" if flagged else "FN"
        ) if example.prohibited else ("FP" if flagged else "TN")
        counts[key] += 1
    return counts


def _percent(numerator: int, denominator: int) -> str:
    return "n/a" if denominator == 0 else f"{numerator / denominator:.1%}"


def _print_metrics(name: str, examples: list[Example], predictions: list[bool]) -> None:
    counts = _confusion(examples, predictions)
    total = len(examples)
    print(f"\n{name} ({total}/{len(EXAMPLES)} bedömda)")
    print("Mått       Värde")
    print("---------- ------")
    print(f"Träffsäkerhet {_percent(counts['TP'] + counts['TN'], total)}")
    print(f"Precision     {_percent(counts['TP'], counts['TP'] + counts['FP'])}")
    print(f"Recall        {_percent(counts['TP'], counts['TP'] + counts['FN'])}")
    print(f"Missade       {counts['FN']}")
    print(f"Falsklarm     {counts['FP']}")


def run() -> int:
    classifier = get_toxicity_classifier()
    results: list[Result] = []
    for example in EXAMPLES:
        local_flagged = contains_profanity(example.text)
        ai_result, latency_ms, error = _classify(classifier, example.text)
        ai_flagged = None if ai_result is None else ai_result.flagged or ai_result.score >= TOXICITY_THRESHOLD
        results.append(Result(
            example=example,
            local_flagged=local_flagged,
            ai_flagged=ai_flagged,
            score=None if ai_result is None else ai_result.score,
            latency_ms=latency_ms,
            error=error,
        ))

    print("SCRUM-266: lokal ordkontroll jämfört med Hugging Face-moderering")
    print("Förfacit är manuellt; detta lilla urval är diagnostiskt, inte en generell kvalitetsmätning.\n")
    print("| # | Kategori | Facit | Lokalt | AI | Score | Latency ms | Text |")
    print("|---:|---|---|---|---|---:|---:|---|")
    for index, result in enumerate(results, start=1):
        example = result.example
        local = "FLAGG" if result.local_flagged else "OK"
        ai = "FEL" if result.error else "FLAGG" if result.ai_flagged else "OK"
        score = "-" if result.score is None else f"{result.score:.3f}"
        text = example.text.replace("|", "\\|")
        if result.error:
            text += f" (fel: {result.error})"
        print(
            f"| {index} | {example.category} | {'OTILLÅTEN' if example.prohibited else 'OK'} "
            f"| {local} | {ai} | {score} | {result.latency_ms:.0f} | {text} |"
        )

    local_predictions = [result.local_flagged for result in results]
    ai_results = [result for result in results if result.ai_flagged is not None]
    _print_metrics("Lokalt ordfilter", [result.example for result in results], local_predictions)
    _print_metrics(
        "HF-moderering",
        [result.example for result in ai_results],
        [result.ai_flagged for result in ai_results],
    )
    errors = sum(result.error is not None for result in results)
    latencies = [result.latency_ms for result in results]
    print(f"\nAI-fel: {errors}/{len(results)}")
    print(f"Genomsnittlig AI-latency: {sum(latencies) / len(latencies):.0f} ms")
    if errors:
        print("Mätningen är ofullständig eftersom vissa AI-anrop inte gav något resultat.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
