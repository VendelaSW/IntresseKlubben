"""
Analysen av användarens text: från fri text till förslag på intressen, med ett sigill över dem
(POST /interests/analyze, se app/api/routes/interest_analysis.py).

Stegen, med allt delad på en tidsgräns (se Deadline) så att analysen ryms i backendens funktionstid:
0. Alias först (interest_shortcut): är hela texten en lista av intressen som finns i biblioteket görs inga anrop
   alls i steg 1 och 2. Och hittar utläsningen ingen tagg alls letar vi namn och alias i texten som skyddsnät.
1. Utläsning (interest_extractor): modellen gör texten till ett träd av taggar, med skydden mot olämpligt innehåll.
2. Matchning (interest_matching): varje tagg blir ett intresse som finns, ett nytt intresse med en förälder, eller
   inget. Är taggen inte en exakt träff visas bara kandidaterna för modellen (interest_candidates), inte hela biblioteket.
3. Aktivitet och följdfrågor (interest_followups.plan): bara om följdfrågorna är påslagna (settings.interest_followups)
   läser modellen ut hur användaren håller på med intresset (bara om texten säger det, aldrig gissat) och formulerar
   frågorna. Är de av görs inget anrop här, och aktiviteter kommer bara från biblioteket.
4. Förslagen får nycklar (p1, p2...) och en kompakt form som sigillet täcker (analysis_token).

Inget sparas. Förslagen sparas i ett senare steg, och bara de som har ett giltigt sigill godtas där.
"""

from dataclasses import dataclass, field

from app.services.ai_clients import Deadline
from app.services.interest_confirm import MIN_NAME_LENGTH
from app.services.interest_extractor import clean_tag, drop_tags, extract_interests, judge_tags, remove_flagged
from app.services.interest_followups import FollowUp, plan
from app.services.interest_matching import LibraryIndex, Match, Tag, exact_match, match_tags, tags_from_tree
from app.services.interest_shortcut import local_tree, shortcut_tree


@dataclass
class Analysis:
    proposals: list[dict] = field(default_factory=list)  # förslagen som de visas för användaren
    followups: list[dict] = field(default_factory=list)  # följdfrågorna (tom om de inte är påslagna)
    sealed: list[dict] = field(default_factory=list)  # förslagen i den kompakta form sigillet täcker


def display_name(name: str) -> str:
    """Namnet på ett nytt intresse med stor första bokstav, som i biblioteket ("modellbygge" -> "Modellbygge").
    Resten lämnas som det står, så att "Call of Duty" och "PC-spel" inte ändras."""
    return name[:1].upper() + name[1:]


def _interest_ref(match: Match, index: LibraryIndex, keys: dict[str, str], built: dict[str, dict]) -> dict:
    """Intresset förslaget pekar på: id, namn, plats i trädet och om det är nytt."""
    if match.kind == "same":
        item = index.by_id[match.interest_id]
        return {"id": item.id, "name": item.name, "path": list(item.path), "is_new": False, "parent_key": None}
    name = display_name(match.name or match.tag.name)
    if match.parent_key is not None:  # en sub under ett annat nytt förslag i samma analys
        parent = built[keys[match.parent_key]]["interest"]
        return {"id": None, "name": name, "path": [*parent["path"], parent["name"]], "is_new": True, "parent_key": keys[match.parent_key]}
    parent_item = index.by_id[match.parent_id]
    return {"id": None, "name": name, "path": [*parent_item.path, parent_item.name], "is_new": True, "parent_key": None}


def _sealed(proposal: dict, match: Match, allowed: list[str], keys: dict[str, str]) -> dict:
    """Förslaget i kompakt form: det som behövs för att spara det, och det som är tillåtet att välja."""
    claim: dict = {"key": proposal["key"], "activity": proposal["activity"], "allowed": allowed}
    if match.kind == "same":
        claim["interest_id"] = match.interest_id
    else:
        new = {"name": proposal["interest"]["name"]}
        if match.parent_key is not None:
            new["parent_key"] = keys[match.parent_key]
        else:
            new["parent_id"] = match.parent_id
        claim["new"] = new
    return claim


def _followup(question: FollowUp, keys: dict[str, str]) -> dict | None:
    if question.key not in keys:
        return None
    return {
        "key": keys[question.key],
        "type": question.type,
        "question": question.question,
        "multiple": question.multiple,
        "applies_to": [keys[k] for k in question.applies_to if k in keys],
        "options": [{"value": o.value, "label": o.label, "kind": o.kind} for o in question.options],
    }


def analyze(
    text: str, index: LibraryIndex, catalog: dict[str, str], followups_enabled: bool = False, finder=None
) -> Analysis:
    """Förslagen på intressen i `text`, mot biblioteket i `index` och aktiviteterna i `catalog` (slug -> namn).
    Kastar AINotConfigured om AI-tjänsten inte är inställd, och AIFailed om ett steg misslyckas eller tiden tar slut."""
    deadline = Deadline()
    tree = shortcut_tree(text, index)  # hela texten är kända intressen: inga anrop alls
    if tree is None:
        # Skyddsnät: hittar modellen ingen tagg alls letar vi namn och alias i texten (och modererar träffarna).
        # Har granskningen eller moderationen tagit bort något gäller deras beslut, då används inget skyddsnät.
        tree = extract_interests(text, deadline, on_nothing=lambda: remove_flagged(local_tree(text, index), deadline))
    tags = tags_from_tree(tree)
    if not tags:
        return Analysis()
    # Med en kandidatfunktion (interest_candidates.CandidateFinder) ser matchningens modell bara de intressen som kan vara
    # rätt, i stället för hela biblioteket.
    candidates = None if finder is None else lambda unresolved: finder(unresolved, text, index, deadline)
    result = plan(match_tags(tags, index, deadline, candidates), index, catalog, deadline, text=text, use_model=followups_enabled)
    return _assemble(result, index, followups_enabled)


def _assemble(result, index: LibraryIndex, followups_enabled: bool) -> Analysis:
    """Förslagen, med sigillets innehåll och eventuella följdfrågor, ur matchningens och planens resultat."""
    live = [m for m in result.matches if m.kind != "none"]
    keys = {m.tag.key: f"p{number}" for number, m in enumerate(live, 1)}
    built: dict[str, dict] = {}
    sealed: list[dict] = []
    for match in live:  # överst i trädet först, så att en sub hittar sin förälder
        key = keys[match.tag.key]
        built[key] = {
            "key": key,
            "label": None,  # användarens egna ord om intresset: kommer när utläsningen ger dem
            "interest": _interest_ref(match, index, keys, built),
            "activity": match.activity,
        }
        sealed.append(_sealed(built[key], match, result.allowed.get(match.tag.key, []), keys))

    followups = []
    if followups_enabled:
        followups = [f for f in (_followup(q, keys) for q in result.followups) if f is not None]
    return Analysis(list(built.values()), followups, sealed)


class PhraseNotAllowed(Exception):
    """Intresset godkänns inte: orden är otillåtna, moderationen eller granskningen stoppar det, eller det är inget
    intresse. Användaren får ett och samma meddelande oavsett vilket, så att det inte avslöjar vad som slog till."""


def analyze_phrase(text: str, index: LibraryIndex, catalog: dict[str, str], finder=None) -> Analysis:
    """Förslaget för ETT intresse som användaren skrivit med egna ord (POST /interests/suggest). Texten är själva taggen:
    ingen utläsning, så den kan inte skrivas om eller försvinna. Steg: ordfilter och känsliga ord, moderation och
    granskning (hoppas över för ett känt intresse, som redan är granskat), och sedan matchningen, som kopplar ett
    intresse som finns eller väljer en förälder till ett nytt, med kandidatfiltret. Inga följdfrågor. Kastar
    PhraseNotAllowed om det inte godkänns (också när modellen säger att det inte är ett intresse), och AIFailed eller
    AINotConfigured om en kontroll inte går att köra, så att inget släpps igenom ogranskat."""
    deadline = Deadline()
    name = clean_tag(text)  # None om det är grovt, känsligt, för långt eller tomt
    if name is None or len(name) < MIN_NAME_LENGTH:
        raise PhraseNotAllowed()
    tree = [{"name": name, "aliases": [], "subtags": []}]
    if exact_match(Tag("t1", name), index) is None:  # ett känt intresse behöver varken kontroll eller modell
        tree = remove_flagged(tree, deadline)
        if tree:
            tree = drop_tags(tree, judge_tags(name, [name], deadline))
        if not tree:
            raise PhraseNotAllowed()
    candidates = None if finder is None else lambda unresolved: finder(unresolved, name, index, deadline)
    matches = match_tags(tags_from_tree(tree), index, deadline, candidates)
    if all(m.kind == "none" for m in matches):  # modellen avgjorde att det inte är ett intresse
        raise PhraseNotAllowed()
    return _assemble(plan(matches, index, catalog, deadline, text="", use_model=False), index, followups_enabled=False)


class UnknownInterest(Exception):
    """Intresset finns inte (eller är inte aktivt)."""


def analyze_interest(interest_id: int, index: LibraryIndex, catalog: dict[str, str]) -> Analysis:
    """Förslaget för ett befintligt intresse som användaren valt ur sökningen (POST /interests/suggest med interest_id). Det får
    ett sigill utan några anrop eller kontroller, eftersom intresset redan är granskat. Det väljs på id och inte på namn, så
    att ett av flera intressen med samma namn (Fantasy under både Film och Böcker) aldrig blir ett annat. Intervjun
    behöver det, eftersom den bara sparar förslag med sigill. Kastar UnknownInterest om det inte finns."""
    item = index.by_id.get(interest_id)
    if item is None:
        raise UnknownInterest()
    match = Match(Tag("t1", item.name), "same", interest_id=item.id, via="exact")
    return _assemble(plan([match], index, catalog, Deadline(), text="", use_model=False), index, followups_enabled=False)

