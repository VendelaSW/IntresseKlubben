"""
Matchningen: hur bra en kandidat passar den som tittar, som en poäng mellan 0 och 100.

Poängen räknas från betraktarens håll (första personen, `a`): "hur mycket av det jag är och söker finns hos henne?". Den är därför
inte symmetrisk. Någon med tre intressen som alla finns hos en person med femton ser en stark match, medan personen med femton
ser samma par som svagare, eftersom det mesta av hens intressen saknas hos den andra.

Filtreringen (kommun, ålder, blockerade och så vidare) görs någon annanstans (crud/profile.py). Det här är det andra läget: de som
filtret släpper igenom får en poäng. Modulen är ren: den läser ingen databas och anropar ingen AI. Vektorerna finns redan
sparade (interest_embeddings och profile_embeddings), och den som anropar lämnar över dem.

Poängen består av tre delar, var och en ett värde x mellan 0 och 1:

  intressen   hur mycket personerna delar av sina intressen. Varje intresse ger också poäng uppåt i trädet, med
              avtagande vikt per steg, så ett delat smalt intresse väger mycket och en delad överkategori lite.
              En blandning av Dice (2 · det de delar / summan hos båda, symmetriskt) och täckning (det de delar / summan hos
              betraktaren: hur mycket av mina intressen finns hos henne). `coverage_share` säger hur stor del som är täckning.
  närliggande för varje intresse hos betraktaren, det närmaste hos kandidaten (cosinus mellan intressenas vektorer), och tvärtom,
              och en blandning av de två snitten där betraktarens håll väger tyngst (`near_viewer_share`). Fångar att Bouldering
              och Sportklättring ligger nära varandra utan att vara samma, även när intresseträdet inte säger det.
  text        cosinus mellan Om mig-texternas vektorer.

Cosinus är inte en procent: orelaterade ligger kring en nedre gräns och samma ämne kring en övre. Därför räknas de om till 0..1
med `*_lo` och `*_hi` ur MatchConfig. Gränserna är mätta på demoprofiler och handgjorda testpar (seed_test_match), inte på
riktiga användare, och ska ses över när det finns riktiga profiler (python -m app.match_probe visar de råa värdena).

Delarna vägs ihop så här:

    a_k = bas_k · tillförlitlighet_k
    poäng = 100 · Σ(a_k · x_k) / Σ(a_k)

 - bas_k är grundvikten för delen.
 - tillförlitlighet_k är lägre när någon av personerna har lite att gå på (få intressen, kort text). Den svagaste
   av de två avgör, så en tunn profil drar inte upp resultatet.
 - Eftersom vi delar med summan blir poängen alltid mellan 0 och 100, vilka vikter som än används.
 - Saknas en del (till exempel textvektorn) hoppas den över, och de andra räknas om. Svaret markeras då som mindre säkert.

Poängen ges också en nivå (se LEVELS): SUPERmatch, Stark match, Bra match eller Okej match. Under den lägsta visas inget förslag.

Matchning erbjuds bara den som har minst MIN_INTERESTS intressen och MIN_TEXT_CHARS tecken Om mig-text. Alla andra får
fortsätta använda filtret.
"""

import math
from dataclasses import dataclass, field, fields

from app.services.interest_embeddings import _cosine_similarity

MIN_INTERESTS = 3
MIN_TEXT_CHARS = 100

# Nivåerna, högst först: (lägsta poäng, nyckel). Appen översätter nyckeln till SUPERmatch, Stark match, Bra match och Okej match.
# Poängen kommer från demoprofiler och ska ses över när det finns riktiga profiler.
LEVELS = ((80, "super"), (60, "strong"), (35, "good"), (15, "okay"))
# Förslag under den lägsta nivån visas inte, så att listan tar slut hellre än fylls med svaga träffar.
MIN_SHOWN_PERCENT = LEVELS[-1][0]
# Under det här hos någon av de två är poängen mindre säker (low_confidence), och appen visar "baserat på lite information".
THIN_INTERESTS = 5
THIN_CHARS = 200

PART_NAMES = ("intressen", "narliggande", "text")


@dataclass(frozen=True)
class MatchConfig:
    # Grundvikter. Behöver inte summera till 1: poängen delas med summan.
    weight_interests: float = 0.35
    weight_near: float = 0.30
    weight_text: float = 0.35
    # Vikten för intresset självt är 1, och för varje steg uppåt i trädet gånger så här mycket.
    tree_decay: float = 0.5
    # Hur stor del av intressepoängen som är täckning av betraktarens intressen (resten är Dice), och hur mycket betraktarens håll
    # väger i närliggande-poängen (resten är kandidatens håll). 0 respektive 0,5 ger en symmetrisk poäng.
    coverage_share: float = 0.5
    near_viewer_share: float = 0.7
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

    def __post_init__(self) -> None:
        """En felaktig inställning ska stoppas här och inte ge tysta, konstiga poäng senare."""
        weights = (self.weight_interests, self.weight_near, self.weight_text)
        problems = []
        not_finite = [f.name for f in fields(self) if not math.isfinite(getattr(self, f.name))]
        if not_finite:
            # Utan den här kontrollen släpper till exempel near_hi=inf igenom och ger NaN, som _clamp gör till full poäng.
            problems.append("alla tal måste vara ändliga (" + ", ".join(not_finite) + ")")
        if any(w < 0 or not math.isfinite(w) for w in weights) or sum(weights) <= 0:
            problems.append("vikterna måste vara icke-negativa och inte alla noll")
        if not self.near_hi > self.near_lo:
            problems.append("near_hi måste vara större än near_lo")
        if not self.text_hi > self.text_lo:
            problems.append("text_hi måste vara större än text_lo")
        if not 0 <= self.tree_decay <= 1:
            problems.append("tree_decay måste ligga mellan 0 och 1")
        if not 0 <= self.coverage_share <= 1:
            problems.append("coverage_share måste ligga mellan 0 och 1")
        if not 0 <= self.near_viewer_share <= 1:
            problems.append("near_viewer_share måste ligga mellan 0 och 1")
        if self.reliable_interests <= 0 or self.reliable_chars <= 0:
            problems.append("reliable_interests och reliable_chars måste vara större än 0")
        if not 0 <= self.reliability_floor <= 1:
            problems.append("reliability_floor måste ligga mellan 0 och 1")
        if problems:
            raise ValueError("Ogiltig MatchConfig: " + "; ".join(problems))


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
    level: str | None  # nyckeln i LEVELS, eller None under den lägsta nivån
    parts: dict[str, float]  # x för varje del som räknades, 0..1
    weights: dict[str, float]  # hur mycket varje del vägde i slutet (summerar till 1)
    reliability: dict[str, float]
    shared: frozenset[int]  # intressen de båda har valt
    complete: bool  # False om någon del saknades och poängen därför är mindre säker
    low_confidence: bool  # True om någon del saknades eller någon av dem har få intressen eller kort text
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


def level_for(percent: int) -> str | None:
    """Nivån för en poäng (nyckeln i LEVELS), eller None om den är under den lägsta."""
    for lowest, key in LEVELS:
        if percent >= lowest:
            return key
    return None


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _calibrate(cosine: float, lo: float, hi: float) -> float:
    return _clamp((cosine - lo) / (hi - lo))


def _cosine(a: list[float], b: list[float]) -> float:
    """Cosinus mellan två vektorer, men med kontroll: olika längd ger annars en tyst fel (zip kortar av) och icke-ändliga tal ger
    NaN. En trasig vektor är ett fel i datan som ska synas, inte en poäng."""
    if len(a) != len(b):
        raise ValueError(f"Vektorerna har olika längd ({len(a)} och {len(b)})")
    value = _cosine_similarity(a, b)
    if not math.isfinite(value):
        raise ValueError("Vektorerna innehåller tal som inte är ändliga")
    return value


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


def tree_overlap(
    a: frozenset[int], b: frozenset[int], parents: dict[int, int | None], decay: float, coverage_share: float = 0.0
) -> float:
    """Hur mycket av intressena i trädet som personerna delar, 0..1. Dice (1 för samma intressen, 0 när de inte delar något, ens
    en överkategori) blandad med täckning: hur mycket av a:s utvidgade intressen som också finns hos b. `coverage_share` är
    andelen täckning; 0 ger ren Dice."""
    wa, wb = expand(a, parents, decay), expand(b, parents, decay)
    total = sum(wa.values()) + sum(wb.values())
    if not total:
        return 0.0
    shared = sum(min(wa[i], wb[i]) for i in wa.keys() & wb.keys())
    dice = 2 * shared / total
    coverage = shared / sum(wa.values()) if wa else 0.0
    return (1 - coverage_share) * dice + coverage_share * coverage


def _best_match(ids: frozenset[int], others: frozenset[int], vectors: dict[int, list[float]]) -> float | None:
    """Snittet av det bästa cosinusvärdet hos `others` för varje intresse i `ids`. Intressen utan vektor räknas inte."""
    best = []
    for interest_id in ids:
        vector = vectors.get(interest_id)
        if vector is None:
            continue
        scores = [_cosine(vector, vectors[o]) for o in others if o in vectors]
        if scores:
            best.append(max(scores))
    return sum(best) / len(best) if best else None


def blend_directions(forward: float | None, backward: float | None, forward_share: float) -> float | None:
    """De två hållens snitt blandade: `forward_share` av betraktarens håll och resten av kandidatens. Finns bara ett håll
    används det. Används också av services/match_suggestions.py när likheterna kommer från databasen."""
    if forward is None or backward is None:
        return forward if backward is None else backward
    return forward_share * forward + (1 - forward_share) * backward


def near_interests(a: frozenset[int], b: frozenset[int], vectors: dict[int, list[float]], forward_share: float = 0.5) -> float | None:
    """Råa cosinus-snittet mellan personernas intressen: hur nära kandidatens intressen ligger betraktarens (framåt, a till b) och
    tvärtom, blandat med `forward_share` på betraktarens håll. None om vektorer saknas."""
    return blend_directions(_best_match(a, b, vectors), _best_match(b, a, vectors), forward_share)


def _reliability(have: int, full: int, floor: float) -> float:
    return _clamp(have / full, floor, 1.0)


def score(
    a: Person,
    b: Person,
    parents: dict[int, int | None],
    interest_vectors: dict[int, list[float]],
    config: MatchConfig = DEFAULT_CONFIG,
) -> Match | None:
    """Poängen för b sett av a, ur personernas vektorer, eller None om ingen del gick att räkna. Kontrollerar inte minimikraven
    (se readiness)."""
    near = near_interests(a.interests, b.interests, interest_vectors, config.near_viewer_share)
    text = None if a.text_vector is None or b.text_vector is None else _cosine(a.text_vector, b.text_vector)
    return combine(a, b, parents, near, text, config)


def combine(
    a: Person,
    b: Person,
    parents: dict[int, int | None],
    near: float | None,
    text_cosine: float | None,
    config: MatchConfig = DEFAULT_CONFIG,
) -> Match | None:
    """Poängen för b sett av a, ur de råa cosinusvärdena `near` (närliggande intressen, se near_interests) och `text_cosine`,
    None när de saknas. Det här är sättet att räkna när likheterna kommer från databasen (services/match_suggestions.py) och
    inte från vektorer i minnet.

    Ett värde som inte är ett ändligt tal (NaN eller oändligt, till exempel från pgvector för en nollvektor) räknas som saknat:
    annars gör _clamp NaN till 1,0, alltså full delpoäng. Poängen blir då mindre säker (complete=False) men inte fel."""
    c = config
    if near is not None and not math.isfinite(near):
        near = None
    if text_cosine is not None and not math.isfinite(text_cosine):
        text_cosine = None
    parts: dict[str, float] = {"intressen": tree_overlap(a.interests, b.interests, parents, c.tree_decay, c.coverage_share)}
    raw: dict[str, float] = {}
    complete = True

    if near is None:
        complete = False
    else:
        raw["narliggande"] = near
        parts["narliggande"] = _calibrate(near, c.near_lo, c.near_hi)

    if text_cosine is None:
        complete = False
    else:
        raw["text"] = text_cosine
        parts["text"] = _calibrate(text_cosine, c.text_lo, c.text_hi)

    base = {"intressen": c.weight_interests, "narliggande": c.weight_near, "text": c.weight_text}
    interests_reliability = _reliability(min(len(a.interests), len(b.interests)), c.reliable_interests, c.reliability_floor)
    text_reliability = _reliability(min(a.text_chars, b.text_chars), c.reliable_chars, c.reliability_floor)
    reliability = {"intressen": interests_reliability, "narliggande": interests_reliability, "text": text_reliability}

    effective = {name: base[name] * reliability[name] for name in parts}
    total = sum(effective.values())
    if not total:
        return None
    weights = {name: value / total for name, value in effective.items()}
    percent = round(100 * sum(weights[name] * parts[name] for name in parts))
    return Match(
        percent=percent,
        level=level_for(percent),
        parts=parts,
        weights=weights,
        reliability={name: reliability[name] for name in parts},
        shared=a.interests & b.interests,
        complete=complete,
        low_confidence=(
            not complete
            or min(len(a.interests), len(b.interests)) < THIN_INTERESTS
            or min(a.text_chars, b.text_chars) < THIN_CHARS
        ),
        raw=raw,
    )
