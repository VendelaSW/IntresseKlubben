"""
Matchningen: hur bra två personer passar ihop, som en poäng mellan 0 och 100.

Filtreringen (kommun, ålder, blockerade och så vidare) görs någon annanstans (crud/profile.py). Det här är det andra läget: de som
filtret släpper igenom får en poäng. Modulen är ren: den läser ingen databas och anropar ingen AI. Vektorerna finns redan
sparade (interest_embeddings och profile_embeddings), och den som anropar lämnar över dem.

Poängen består av tre delar, var och en ett värde x mellan 0 och 1:

  intressen   hur mycket personerna delar av sina intressen. Varje intresse ger också poäng uppåt i trädet, med
              avtagande vikt per steg, så ett delat smalt intresse väger mycket och en delad överkategori lite.
              Räknas som Dice: 2 · det de delar / (summan hos A + summan hos B).
  närliggande för varje intresse hos den ena, det närmaste hos den andra (cosinus mellan intressenas vektorer), åt båda
              hållen, och snittet. Fångar att Bouldering och Sportklättring ligger nära varandra utan att vara samma.
  text        cosinus mellan Om mig-texternas vektorer.

Cosinus är inte en procent: orelaterade ligger kring en nedre gräns och samma ämne kring en övre. Därför räknas de om till 0..1
med `*_lo` och `*_hi` ur MatchConfig. Gränserna är mätta på demoprofiler och handgjorda testpar (seed_test_match), inte på
riktiga användare, och ska ses över när det finns riktiga profiler (python -m app.match_probe visar de råa värdena).

Delarna vägs ihop så här:

    a_k = bas_k · tillförlitlighet_k · (1 + beta · x_k)
    poäng = 100 · Σ(a_k · x_k) / Σ(a_k)

 - bas_k är grundvikten för delen.
 - tillförlitlighet_k är lägre när någon av personerna har lite att gå på (få intressen, kort text). Den svagaste
   av de två avgör, så en tunn profil drar inte upp resultatet.
 - 1 + beta · x_k gör att en stark del väger lite mer än en svag.
 - Eftersom vi delar med summan blir poängen alltid mellan 0 och 100, vilka vikter som än används.
 - Saknas en del (till exempel textvektorn) hoppas den över, och de andra räknas om. Svaret markeras då som mindre säkert.

Matchning erbjuds bara den som har minst MIN_INTERESTS intressen och MIN_TEXT_CHARS tecken Om mig-text. Alla andra får
fortsätta använda filtret.
"""

from dataclasses import dataclass, field

from app.services.interest_embeddings import _cosine_similarity

MIN_INTERESTS = 3
MIN_TEXT_CHARS = 100

PART_NAMES = ("intressen", "narliggande", "text")


@dataclass(frozen=True)
class MatchConfig:
    # Grundvikter. Behöver inte summera till 1: poängen delas med summan.
    weight_interests: float = 0.35
    weight_near: float = 0.30
    weight_text: float = 0.35
    # Hur mycket extra en stark del väger. 0 = vanlig viktad summa.
    beta: float = 0.5
    # Vikten för intresset självt är 1, och för varje steg uppåt i trädet gånger så här mycket.
    tree_decay: float = 0.5
    # Cosinus som räknas som "orelaterat" (0) och "så lika det blir" (1). Orelaterade texter ligger kring 0,5 och en
    # tvillingtext kring 0,8-0,85, intressen kring 0,45 respektive 0,9.
    near_lo: float = 0.45
    near_hi: float = 0.90
    text_lo: float = 0.55
    text_hi: float = 0.85
    # Tillförlitlighet: hos hur många intressen / tecken den är full, och lägsta värdet den kan få.
    reliable_interests: int = 8
    reliable_chars: int = 500
    reliability_floor: float = 0.4


DEFAULT_CONFIG = MatchConfig()


@dataclass
class Person:
    """Det matchningen behöver veta om en person. `text_vector` är None när Om mig-texten saknar en aktuell vektor."""

    id: int
    interests: frozenset[int]
    text_chars: int
    text_vector: list[float] | None = None


@dataclass
class Match:
    percent: int
    parts: dict[str, float]  # x för varje del som räknades, 0..1
    weights: dict[str, float]  # hur mycket varje del vägde i slutet (summerar till 1)
    reliability: dict[str, float]
    shared: frozenset[int]  # intressen de båda har valt
    complete: bool  # False om någon del saknades och poängen därför är mindre säker
    raw: dict[str, float] = field(default_factory=dict)  # de råa cosinusvärdena, för att ställa in gränserna


@dataclass
class Readiness:
    ok: bool
    missing_interests: int
    missing_chars: int


def readiness(person: Person) -> Readiness:
    """Om personen har nog att gå på för att matchas, och annars hur mycket som saknas."""
    missing_interests = max(0, MIN_INTERESTS - len(person.interests))
    missing_chars = max(0, MIN_TEXT_CHARS - person.text_chars)
    return Readiness(not (missing_interests or missing_chars), missing_interests, missing_chars)


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _calibrate(cosine: float, lo: float, hi: float) -> float:
    return _clamp((cosine - lo) / (hi - lo))


def expand(interests: frozenset[int], parents: dict[int, int | None], decay: float) -> dict[int, float]:
    """Intressena och deras överintressen, med vikt 1 för intresset självt och `decay` per steg uppåt. Hamnar samma
    intresse med flera vikter gäller den största."""
    weights: dict[int, float] = {}
    for interest_id in interests:
        weight, node, seen = 1.0, interest_id, set()
        while node is not None and node not in seen:
            seen.add(node)
            if weights.get(node, 0.0) < weight:
                weights[node] = weight
            node = parents.get(node)
            weight *= decay
    return weights


def tree_overlap(a: frozenset[int], b: frozenset[int], parents: dict[int, int | None], decay: float) -> float:
    """Dice över de utvidgade intressena: 1 för samma intressen, 0 när de inte delar något, ens en överkategori."""
    wa, wb = expand(a, parents, decay), expand(b, parents, decay)
    total = sum(wa.values()) + sum(wb.values())
    if not total:
        return 0.0
    shared = sum(min(wa[i], wb[i]) for i in wa.keys() & wb.keys())
    return 2 * shared / total


def _best_match(ids: frozenset[int], others: frozenset[int], vectors: dict[int, list[float]]) -> float | None:
    """Snittet av det bästa cosinusvärdet hos `others` för varje intresse i `ids`. Intressen utan vektor räknas inte."""
    best = []
    for interest_id in ids:
        vector = vectors.get(interest_id)
        if vector is None:
            continue
        scores = [_cosine_similarity(vector, vectors[o]) for o in others if o in vectors]
        if scores:
            best.append(max(scores))
    return sum(best) / len(best) if best else None


def near_interests(a: frozenset[int], b: frozenset[int], vectors: dict[int, list[float]]) -> float | None:
    """Råa cosinus-snittet mellan personernas intressen, åt båda hållen. None om vektorer saknas."""
    forward, backward = _best_match(a, b, vectors), _best_match(b, a, vectors)
    found = [value for value in (forward, backward) if value is not None]
    return sum(found) / len(found) if found else None


def _reliability(have: int, full: int, floor: float) -> float:
    return _clamp(have / full, floor, 1.0)


def score(
    a: Person,
    b: Person,
    parents: dict[int, int | None],
    interest_vectors: dict[int, list[float]],
    config: MatchConfig = DEFAULT_CONFIG,
) -> Match | None:
    """Poängen för paret, eller None om ingen del gick att räkna. Kontrollerar inte minimikraven (se readiness)."""
    c = config
    parts: dict[str, float] = {"intressen": tree_overlap(a.interests, b.interests, parents, c.tree_decay)}
    raw: dict[str, float] = {}
    complete = True

    near = near_interests(a.interests, b.interests, interest_vectors)
    if near is None:
        complete = False
    else:
        raw["narliggande"] = near
        parts["narliggande"] = _calibrate(near, c.near_lo, c.near_hi)

    if a.text_vector is None or b.text_vector is None:
        complete = False
    else:
        raw["text"] = _cosine_similarity(a.text_vector, b.text_vector)
        parts["text"] = _calibrate(raw["text"], c.text_lo, c.text_hi)

    base = {"intressen": c.weight_interests, "narliggande": c.weight_near, "text": c.weight_text}
    interests_reliability = _reliability(min(len(a.interests), len(b.interests)), c.reliable_interests, c.reliability_floor)
    text_reliability = _reliability(min(a.text_chars, b.text_chars), c.reliable_chars, c.reliability_floor)
    reliability = {"intressen": interests_reliability, "narliggande": interests_reliability, "text": text_reliability}

    effective = {name: base[name] * reliability[name] * (1 + c.beta * x) for name, x in parts.items()}
    total = sum(effective.values())
    if not total:
        return None
    weights = {name: value / total for name, value in effective.items()}
    result = sum(weights[name] * parts[name] for name in parts)
    return Match(
        percent=round(100 * result),
        parts=parts,
        weights=weights,
        reliability={name: reliability[name] for name in parts},
        shared=a.interests & b.interests,
        complete=complete,
        raw=raw,
    )
