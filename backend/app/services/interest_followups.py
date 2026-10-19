"""
Följdfrågor när AI:n är osäker på vad användaren menar.

Hela utläsningens träd sparas: ett intresse och dess subs ("musik" med "hårdrock"). De hör ihop som en
grupp, och högst EN följdfråga ställs per grupp, aldrig två i rad om samma intresse. Vilken fråga det blir
avgörs av vad som saknas:
- SPECIFY: användaren nämnde bara ett huvudområde ("Jag gillar musik") som har underintressen, och det
  kan utövas på minst två sätt. Frågan är "Vill du vara lite mer specifik ang genre eller hur du utövar
  ditt intresse för musik?". Alternativen är två sorter i samma fråga: områdets underintressen
  (Metal, Jazz...) och aktiviteterna (Lyssnar på, Spelar...), plus "Bara allmänt". Man kan välja flera, och
  ett svar kan vara det ena, det andra eller båda.
- NARROW: som SPECIFY, men det finns inget att fråga om i fråga om aktivitet (texten sa redan hur, eller
  intresset kan bara utövas på ett sätt). Då är det bara underintressena som är alternativ.
- ACTIVITY: användaren var redan specifik (en sub, eller ett intresse utan underintressen), texten har inte
  sagt hur man håller på med det och det finns minst två sätt. Frågan är "Hur håller du på med musik?".
  Svaret gäller hela gruppen: den som lyssnar på hårdrock lyssnar på både Musik och Metal.

Ingen fråga ställs när något i gruppen redan har en aktivitet (texten sa hur), eller när det inte finns något
att fråga om. Varje alternativ har en `kind` ("interest", "activity" eller "general"). Alternativen kommer ur
biblioteket, så svaret är alltid något som är tillåtet. Högst MAX_FOLLOWUPS frågor totalt, i den ordning
användaren nämnde intressena.

Aktiviteterna som är tillåtna för ett förslag är bibliotekets lista (egen eller ärvd). Saknas en lista,
varken egen eller ärvd, väljer modellen ur den fasta aktivitetslistan.

Ges texten (plan(text=...)) läser modellen den och avgör vad som är oklart och hur frågan ska formuleras
(interest_clarify.py), så att frågor inte ställs om sådant texten redan säger och frågetexten passar
intresset. Koden kontrollerar allt modellen svarar: alternativen kommer bara ur biblioteket, ett ensamt
huvudområde får alltid sin fråga, och frågetexten kontrolleras och modereras, annars används mallen. Går
modellens anrop fel, eller ges ingen text, används reglerna ovan i stället.
"""

from dataclasses import dataclass, replace

from app.services.ai_clients import AIFailed, AINotConfigured, Deadline, get_moderator
from app.services.interest_activities import Subject, suggest_activities
from app.services.interest_clarify import Decision, ask_clarify, safe_question
from app.services.interest_matching import LibraryIndex, Match, normalize

MAX_FOLLOWUPS = 3
SPECIFY = "specify"  # både underintresse och aktivitet i samma fråga
NARROW = "narrow"  # bara underintresse
ACTIVITY = "activity"  # bara aktivitet

# Vad ett alternativ är.
INTEREST = "interest"
ACTIVITY_KIND = "activity"
GENERAL_KIND = "general"


@dataclass(frozen=True)
class Option:
    value: str  # intressets id som text, aktivitetens slug, eller "" för allmänt
    label: str
    kind: str  # INTEREST, ACTIVITY_KIND eller GENERAL_KIND


@dataclass(frozen=True)
class FollowUp:
    key: str  # nyckeln på förslaget (överst i gruppen) frågan gäller
    type: str
    question: str
    options: tuple[Option, ...]
    multiple: bool = True  # man kan välja flera, och varje val blir ett eget intresse (narrow) eller en aktivitet
    # Nycklarna på alla förslag i gruppen som svaret gäller (en aktivitet sätts på hela gruppen).
    applies_to: tuple[str, ...] = ()


GENERAL = Option("", "Allmänt", GENERAL_KIND)
GENERAL_AREA = "Bara allmänt"
SPECIFY_QUESTION = "Vill du vara lite mer specifik ang genre eller hur du utövar ditt intresse för {name}?"


@dataclass
class Plan:
    matches: list[Match]  # förslagen, med sin aktivitet
    followups: list[FollowUp]
    # Aktiviteterna som är tillåtna för varje förslag (nyckel -> slugs): det som får väljas i frågan eller
    # sparas, och det sigillet ska täcka.
    allowed: dict[str, list[str]]


def _target_id(match: Match) -> int | None:
    return match.interest_id if match.kind == "same" else match.parent_id


def _groups(matches: list[Match]) -> list[list[Match]]:
    """Förslagen som grupper i den ordning de nämndes: ett intresse överst med sina subs. En sub vars
    överordnade inte blev ett förslag (none) står för sig själv."""
    live = {m.tag.key: m for m in matches if m.kind != "none"}
    groups: list[list[Match]] = []
    for match in matches:
        if match.kind == "none":
            continue
        parent = match.tag.parent_key
        if parent is not None and parent in live:
            continue  # kommer med sin överordnade
        groups.append([match, *[m for m in matches if m.kind != "none" and m.tag.parent_key == match.tag.key]])
    return groups


def _name_in_sentence(match: Match, index: LibraryIndex) -> str:
    """Namnet som det står i frågan: ett huvudområde med gemen ("musik"), allt annat som det står
    ("Metal", "Pokémon TCG")."""
    if match.kind == "same":
        item = index.by_id[match.interest_id]
        return item.name.lower() if item.level == 1 else item.name
    return match.name or ""


def followups(
    matches: list[Match],
    index: LibraryIndex,
    labels: dict[str, str] | None = None,
    allowed: dict[str, list[str]] | None = None,
) -> list[FollowUp]:
    """Följdfrågorna för förslagen, högst en per grupp. `labels` är aktiviteternas namn ("spela" ->
    "Spelar"), ur bibliotekets aktivitetslista. Saknas en etikett används sluggen. `allowed` är
    aktiviteterna som gäller för varje förslag (nyckel -> slugs), när de inte bara är bibliotekets (se plan)."""
    labels = labels or {}
    children: dict[int, list] = {}
    for item in index.items:
        if item.parent_id is not None:
            children.setdefault(item.parent_id, []).append(item)

    def activities_for(match: Match) -> list[str]:
        if allowed is not None and match.tag.key in allowed:
            return allowed[match.tag.key]
        return index.effective_activities(_target_id(match))

    questions: list[FollowUp] = []
    for group in _groups(matches):
        if len(questions) >= MAX_FOLLOWUPS:
            break
        top, subs = group[0], group[1:]
        applies_to = tuple(m.tag.key for m in group)
        activities = activities_for(top)
        activity_options = tuple(Option(slug, labels.get(slug, slug), ACTIVITY_KIND) for slug in activities)
        wants_activity = not any(m.activity for m in group) and len(activities) >= 2

        if not subs and top.kind == "same" and top.interest_id in index.by_id:
            area = index.by_id[top.interest_id]
            kids = sorted(children.get(area.id, []), key=lambda kid: kid.name)
            if area.level == 1 and kids:
                # Bara ett huvudområde med underintressen: en fråga som fångar både underintresse och aktivitet.
                kid_options = tuple(Option(str(kid.id), kid.name, INTEREST) for kid in kids)
                general = Option("", GENERAL_AREA, GENERAL_KIND)
                if wants_activity:
                    options = (*kid_options, *activity_options, general)
                    questions.append(
                        FollowUp(top.tag.key, SPECIFY, SPECIFY_QUESTION.format(name=area.name.lower()), options, applies_to=applies_to)
                    )
                else:
                    options = (*kid_options, general)
                    questions.append(
                        FollowUp(top.tag.key, NARROW, f"Något särskilt inom {area.name.lower()}?", options, applies_to=applies_to)
                    )
                continue

        if wants_activity:
            questions.append(
                FollowUp(
                    top.tag.key,
                    ACTIVITY,
                    f"Hur håller du på med {_name_in_sentence(top, index)}?",
                    (*activity_options, GENERAL),
                    applies_to=applies_to,
                )
            )
    return questions


def _plan_with_rules(
    matches: list[Match],
    index: LibraryIndex,
    catalog: dict[str, str],
    deadline: Deadline | None = None,
    use_model: bool = True,
) -> Plan:
    """Förslagen och frågorna till dem, med aktiviteter även för intressen där biblioteket saknar en lista: för
    dem väljer modellen ur `catalog` (slug -> namn), i ett enda anrop och bara om något behöver det.
    Biblioteket vinner när det har en lista. En aktivitet som texten sa för ett sådant intresse godtas om
    den finns i `catalog`, eftersom användaren själv sa den. Sades en aktivitet om något i en grupp (intresset
    och dess subs) gäller den hela gruppen, där den är tillåten. Med `use_model` False görs inget anrop alls:
    intressen utan aktivitetslista får då inga aktiviteter."""
    live = [m for m in matches if m.kind != "none"]
    gaps = [m for m in live if not index.activities_defined(_target_id(m))]

    subjects = []
    for m in gaps:
        if m.kind == "same" and m.interest_id in index.by_id:
            item = index.by_id[m.interest_id]
            subjects.append(Subject(m.tag.key, item.name, item.path))
        elif m.kind == "new" and m.parent_id in index.by_id:
            parent = index.by_id[m.parent_id]
            subjects.append(Subject(m.tag.key, m.name or m.tag.name, (*parent.path, parent.name)))
        elif m.kind == "new":  # en sub under ett nytt intresse: samma lista som det intresset
            subjects.append(Subject(m.tag.key, m.name or m.tag.name, ()))
    suggestions = suggest_activities(subjects, catalog, deadline) if use_model else {}

    allowed: dict[str, list[str]] = {}
    result = list(matches)
    positions = {m.tag.key: number for number, m in enumerate(matches)}
    for m in live:
        if index.activities_defined(_target_id(m)):
            allowed[m.tag.key] = index.effective_activities(_target_id(m))
            continue
        options = list(suggestions.get(m.tag.key, []))
        if m.tag.activity and m.tag.activity in catalog and m.tag.activity not in options:
            options.append(m.tag.activity)
        allowed[m.tag.key] = options
        result[positions[m.tag.key]] = replace(m, activity=m.tag.activity if m.tag.activity in options else m.activity)

    # Aktiviteten som sades om något i gruppen gäller hela gruppen, där den är tillåten.
    for group in _groups(result):
        said = next((m.activity for m in group if m.activity), "")
        if not said:
            continue
        for m in group:
            if not m.activity and said in allowed.get(m.tag.key, []):
                result[positions[m.tag.key]] = replace(m, activity=said)

    return Plan(result, followups(result, index, catalog, allowed), allowed)


# ---------- Modellstyrda frågor ----------


def _children_of(index: LibraryIndex) -> dict[int, list]:
    children: dict[int, list] = {}
    for item in index.items:
        if item.parent_id is not None:
            children.setdefault(item.parent_id, []).append(item)
    return children


def _area_kids(group: list[Match], index: LibraryIndex, children: dict[int, list]) -> list:
    """Underintressena om gruppen bara är ett huvudområde som har några, annars ingenting."""
    top, subs = group[0], group[1:]
    if subs or top.kind != "same" or top.interest_id not in index.by_id:
        return []
    area = index.by_id[top.interest_id]
    return sorted(children.get(area.id, []), key=lambda kid: kid.name) if area.level == 1 else []


def _member_payload(match: Match, index: LibraryIndex) -> dict:
    if match.kind == "same" and match.interest_id in index.by_id:
        item = index.by_id[match.interest_id]
        name, path = item.name, list(item.path)
    elif match.kind == "new" and match.parent_id in index.by_id:
        parent = index.by_id[match.parent_id]
        name, path = match.name or match.tag.name, [*parent.path, parent.name]
    else:
        name, path = match.name or match.tag.name, []
    defined = index.activities_defined(_target_id(match))
    return {
        "key": match.tag.key,
        "name": name,
        "path": path,
        "activities": index.effective_activities(_target_id(match)) if defined else None,
    }


def _pick_kids(kids: list, chosen: tuple[int, ...]) -> list:
    """Underintressena att erbjuda: de modellen valde (i bibliotekets ordning) om det är minst två, annars alla."""
    picked = [kid for kid in kids if kid.id in chosen]
    return picked if len(picked) >= 2 else kids


def _pick_activities(activities: list[str], chosen: tuple[str, ...]) -> list[str]:
    """Aktiviteterna att erbjuda: de modellen valde (i bibliotekets ordning) om det är minst två, annars de första."""
    picked = [slug for slug in activities if slug in chosen]
    return picked if len(picked) >= 2 else activities[:MAX_OPTIONS]


MAX_OPTIONS = 6  # högst så här många aktiviteter i en fråga när modellen inte valt


def _plan_with_decisions(
    matches: list[Match],
    index: LibraryIndex,
    catalog: dict[str, str],
    decisions: dict[str, Decision],
    deadline: Deadline | None,
) -> Plan:
    live = [m for m in matches if m.kind != "none"]
    positions = {m.tag.key: number for number, m in enumerate(matches)}
    result = list(matches)
    allowed: dict[str, list[str]] = {}

    for m in live:
        decision = decisions.get(m.tag.key)
        if index.activities_defined(_target_id(m)):
            options = index.effective_activities(_target_id(m))
            said = next((a for a in (m.tag.activity, decision.activity if decision else "") if a in options), "")
        else:
            options = list(decision.suggested_activities) if decision else []
            said = next((a for a in (m.tag.activity, decision.activity if decision else "") if a and a in catalog), "")
            if said and said not in options:
                options.append(said)
        allowed[m.tag.key] = options
        result[positions[m.tag.key]] = replace(m, activity=said or m.activity)

    # Aktiviteten som sades om något i gruppen gäller hela gruppen, där den är tillåten.
    for group in _groups(result):
        said = next((m.activity for m in group if m.activity), "")
        if not said:
            continue
        for m in group:
            if not m.activity and said in allowed.get(m.tag.key, []):
                result[positions[m.tag.key]] = replace(m, activity=said)

    children = _children_of(index)
    drafts = []  # (grupp, typ, alternativ, mall, modellens fråga eller None)
    for group in _groups(result):
        if len(drafts) >= MAX_FOLLOWUPS:
            break
        top = group[0]
        decision = decisions.get(top.tag.key)
        activities = allowed.get(top.tag.key, [])
        kids = _area_kids(group, index, children)
        # Aktivitetsfrågan kräver att texten inte sagt hur, att det finns minst två sätt, och att modellen anser att
        # den behövs. Ett ensamt huvudområde med underintressen får alltid sin fråga om dem, vad modellen än säger.
        wants_activity = not any(m.activity for m in group) and len(activities) >= 2 and (decision is None or decision.ask in ("activity", "both"))
        if not kids and not wants_activity:
            continue
        kid_options = _pick_kids(kids, decision.interest_options if decision else ()) if kids else []
        activity_slugs = _pick_activities(activities, decision.activity_options if decision else ()) if wants_activity else []
        qtype = SPECIFY if kid_options and activity_slugs else NARROW if kid_options else ACTIVITY
        options = (
            *(Option(str(kid.id), kid.name, INTEREST) for kid in kid_options),
            *(Option(slug, catalog.get(slug, slug), ACTIVITY_KIND) for slug in activity_slugs),
            Option("", GENERAL_AREA, GENERAL_KIND) if kid_options else GENERAL,
        )
        if qtype == SPECIFY:
            template = SPECIFY_QUESTION.format(name=index.by_id[top.interest_id].name.lower())
        elif qtype == NARROW:
            template = f"Något särskilt inom {index.by_id[top.interest_id].name.lower()}?"
        else:
            template = f"Hur håller du på med {_name_in_sentence(top, index)}?"
        # Modellens fråga används bara om den hör till den sorts fråga vi faktiskt ställer, och är säker.
        fits = decision is not None and {"narrow": NARROW, "activity": ACTIVITY, "both": SPECIFY}.get(decision.ask) == qtype
        drafts.append((group, qtype, options, template, safe_question(decision.question) if fits else None))

    # Modereringen av frågetexterna, i ett anrop. Går den inte att köra används mallarna.
    model_questions = [draft[4] for draft in drafts if draft[4] is not None]
    flagged: dict[str, bool] = {}
    if model_questions:
        try:
            flags = get_moderator().flagged(model_questions, deadline)
            flagged = dict(zip(model_questions, flags))
        except (AIFailed, AINotConfigured):
            flagged = {question: True for question in model_questions}

    questions = []
    for group, qtype, options, template, model_question in drafts:
        text = model_question if model_question is not None and not flagged.get(model_question, True) else template
        questions.append(FollowUp(group[0].tag.key, qtype, text, options, applies_to=tuple(m.tag.key for m in group)))
    return Plan(result, questions, allowed)


def drop_unsaid_areas(matches: list[Match], index: LibraryIndex, text: str) -> list[Match]:
    """Ett huvudområde som är förälder till något i utläsningen sparas bara om användaren skrev det själv.
    Utläsningen hittar gärna på området som förälder ("jag spelar padel" ger Sport och träning > Padel), och
    ett område som ingen sa ska inte hamna på profilen. Ett område som står ensamt behålls alltid, och det
    gör ett område vars namn (eller alias) står i texten. Intressen längre ner i trädet påverkas inte."""
    spoken = normalize(text)
    has_subs = {m.tag.parent_key for m in matches if m.kind != "none" and m.tag.parent_key is not None}
    kept = []
    for m in matches:
        is_area = m.kind == "same" and m.interest_id in index.by_id and index.by_id[m.interest_id].level == 1
        said = any(normalize(name) in spoken for name in m.tag.all_names() if normalize(name))
        kept.append(Match(m.tag, "none") if is_area and m.tag.key in has_subs and not said else m)
    return kept


def plan(
    matches: list[Match],
    index: LibraryIndex,
    catalog: dict[str, str],
    deadline: Deadline | None = None,
    text: str = "",
    use_model: bool = True,
) -> Plan:
    """Förslagen och frågorna till dem. Ges `text` (det användaren skrev) läser modellen den och avgör vad som är
    oklart, läser ut aktiviteter och formulerar frågorna, med allt kontrollerat i kod. Går anropet fel, eller
    ges ingen text, gäller reglerna (se _plan_with_rules). Med `use_model` False (följdfrågorna är av) anropas
    modellen aldrig: bara reglerna gäller, och aktiviteter kommer bara från biblioteket."""
    if not use_model:
        return _plan_with_rules(matches, index, catalog, deadline, use_model=False)
    if text.strip():
        matches = drop_unsaid_areas(matches, index, text)
    live = [m for m in matches if m.kind != "none"]
    if text.strip() and live:
        groups = [
            {
                "members": [_member_payload(m, index) for m in group],
                "interest_options": [{"id": kid.id, "name": kid.name} for kid in _area_kids(group, index, _children_of(index))],
            }
            for group in _groups(matches)
        ]
        try:
            decisions = ask_clarify(text, groups, catalog, deadline)
        except (AIFailed, AINotConfigured):
            decisions = None
        if decisions is not None:
            return _plan_with_decisions(matches, index, catalog, decisions, deadline)
    return _plan_with_rules(matches, index, catalog, deadline)
