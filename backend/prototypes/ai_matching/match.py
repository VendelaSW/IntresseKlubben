"""
PROTOTYP: matchning av användare på intressen. Rör inte appen. Se README.md.

Jämför sätt att ta fram vänförslag för de påhittade användarna i
fake_users.json:

  Dagens:        antal exakt samma intressen.
  A: Kopplingar: poäng för samma underintresse, intressen som hör ihop enligt
                 related.json (förslag från AI, granskade av människor) och
                 samma huvudintresse. Ingen AI när den körs.
  AI (--ai):     som A, men "hör ihop" avgörs av AI-likhet (embeddings från
                 Hugging Face). Gav för mycket brus, se README.md.

Med --fritext föreslår AI ett underintresse för det användarna skrivit själva
(t.ex. Elden Ring -> Rollspel). Vektorerna från Hugging Face sparas i
embeddings_cache.json, så API:t bara anropas för nya texter.

Bara Pythons standardbibliotek, inga extra paket.

Kör från backend/ (AI-valen kräver din Hugging Face-token i HF_TOKEN):
    python prototypes/ai_matching/match.py                  # några utvalda användare
    python prototypes/ai_matching/match.py klatter_kalle    # en viss användare
    python prototypes/ai_matching/match.py --alla           # alla användare
    python prototypes/ai_matching/match.py --fritext        # AI-förslag för fritext
    python prototypes/ai_matching/match.py --ai             # även AI-varianten
    python prototypes/ai_matching/match.py --modell large   # den större modellen
    python prototypes/ai_matching/match.py --jamfor         # båda modellerna sida vid sida
    python prototypes/ai_matching/match.py --par            # de mest lika paren enligt AI
    python prototypes/ai_matching/match.py --par Klättring  # par med ett visst intresse
    python prototypes/ai_matching/match.py --korta          # bara namnen, utan beskrivningar
"""

import argparse
import json
import math
import os
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
CACHE_FILE = HERE / "embeddings_cache.json"
MODELS = {
    "small": "intfloat/multilingual-e5-small",  # liten och snabb, kan svenska
    "large": "intfloat/multilingual-e5-large",  # större, bör skilja bättre
}

# Poäng i den nya matchningen.
POINTS_SAME_SUB = 3  # exakt samma underintresse (eller fritext)
POINTS_SIMILAR = 2  # AI:n tycker att två olika intressen liknar varandra
POINTS_SAME_MAIN = 1  # samma huvudintresse, men underintressena liknar inte varandra

# Hur lika två texter måste vara för att räknas som "liknar varandra".
# Modellerna ger nästan alla par en hög likhet, så gränsen räknas ut från
# datan: de SIMILAR_PERCENTILE procent mest lika paren bland alla intressen.
# Se var gränsen hamnar med --par.
SIMILAR_PERCENTILE = 3

# Användare som visas om man inte anger någon: några med medvetet "nästan
# lika" intressen hos andra.
SHOWCASE = ["klatter_kalle", "metal_mattias", "rpg_rasmus", "mysig_maja", "swing_simon", "musik_mona"]
TOP = 5
TOP_PAIRS = 25

# Huvudintressenas namn och beskrivningarna ur interests.json (nyckel: texten
# som visas, t.ex. "Metal (Musik)"). Fylls i av load_data().
MAIN_NAMES = set()
DESCRIPTIONS = {}
# Kopplingar mellan underintressen ur related.json, åt båda hållen:
# "Friluftsliv/Klättring" -> {"Friluftsliv/Bouldering", ...}. Fylls i av load_data().
RELATED = {}
# Skicka beskrivningarna till modellen (True) eller bara namnen (--korta).
USE_DESCRIPTIONS = True


# --- Data ---


def load_data():
    taxonomy = json.loads((HERE / "interests.json").read_text(encoding="utf-8"))
    users = json.loads((HERE / "fake_users.json").read_text(encoding="utf-8"))["users"]

    MAIN_NAMES.update(category["name"] for category in taxonomy["categories"])
    valid = set()
    for category in taxonomy["categories"]:
        valid.add(category["name"])
        valid.update(f"{category['name']}/{sub}" for sub in category["subinterests"])
        DESCRIPTIONS[category["name"]] = category.get("description")
        for sub, text in category.get("descriptions", {}).items():
            DESCRIPTIONS[label(f"{category['name']}/{sub}")] = text
    for user in users:
        for interest in user["interests"]:
            if interest not in valid:
                sys.exit(f"Okänt intresse hos {user['username']}: {interest!r}. Finns det i interests.json?")

    related = json.loads((HERE / "related.json").read_text(encoding="utf-8"))["related"]
    for key, others in related.items():
        for other in [key, *others]:
            if other not in valid:
                sys.exit(f"Okänt intresse i related.json: {other!r}. Finns det i interests.json?")
        for other in others:
            RELATED.setdefault(key, set()).add(other)
            RELATED.setdefault(other, set()).add(key)
    return users


def is_freetext(key):
    return key.startswith("fritext:")


def main_of(key):
    return key.split("/")[0]


def label(interest):
    """Texten som visas: 'Metal (Musik)' eller 'Musik'."""
    if "/" not in interest:
        return interest
    main, sub = interest.split("/", 1)
    return f"{sub} ({main})"


def normalize_freetext(text):
    """Samma fritext ska räknas som samma oavsett hur den skrivits: " ghost"
    och "Ghost" blir lika. Unicode-normaliseringen (NFC) gör att "å" alltid
    lagras likadant, även om texten klistrats in från t.ex. en Mac."""
    text = unicodedata.normalize("NFC", text)
    return " ".join(text.split()).casefold()


def items_of(user):
    """Allt en användare gillar: valda intressen och fritext, som (nyckel, text)."""
    items = [(interest, label(interest)) for interest in user["interests"]]
    items += [(f"fritext:{normalize_freetext(text)}", text) for text in user["freetext"]]
    return items


def model_text(text):
    """Texten som skickas till modellen: intressets beskrivning ur interests.json,
    t.ex. "Bouldering: klättring på låga väggar ... utan rep". Korta namn ensamma
    ger modellen för lite att gå på, och nästan alla par blir lika.

    Med --korta, eller om beskrivning saknas: bara själva intresset, utan
    huvudintresset inom parentes (annars jämför modellen mest huvudintresset).
    Fritext skickas som den är."""
    if USE_DESCRIPTIONS and DESCRIPTIONS.get(text):
        return DESCRIPTIONS[text]
    for main in MAIN_NAMES:
        if text.endswith(f" ({main})"):
            return text[: -len(f" ({main})")]
    return text


def all_texts(users):
    return sorted({model_text(text) for user in users for _, text in items_of(user)})


# --- Vektorer från Hugging Face ---


def fetch_embeddings(model, texts, token):
    url = f"https://router.huggingface.co/hf-inference/models/{model}/pipeline/feature-extraction"
    # e5-modellerna vill ha "query: " framför texten när två texter ska jämföras.
    body = json.dumps({"inputs": [f"query: {t}" for t in texts]}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Wait-For-Model": "true",
        },
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return [pool(vector) for vector in json.loads(response.read())]
        except urllib.error.HTTPError as error:
            if error.code in (401, 403):
                sys.exit("Hugging Face nekade anropet. Kontrollera att HF_TOKEN är rätt (en Read-token).")
            if error.code == 503 and attempt < 2:
                print("Modellen startar hos Hugging Face, väntar 20 s...")
                time.sleep(20)
                continue
            sys.exit(f"Hugging Face svarade {error.code}: {error.read().decode('utf-8', 'replace')[:300]}")
        except urllib.error.URLError as error:
            sys.exit(f"Kunde inte nå Hugging Face: {error.reason}")
    sys.exit("Hugging Face svarade inte. Försök igen om en stund.")


def pool(vector):
    """Ibland kommer en vektor per ord i stället för en per text. Då tas medelvärdet."""
    if vector and isinstance(vector[0], list):
        return [sum(column) / len(vector) for column in zip(*vector)]
    return vector


def normalize(vector):
    length = math.sqrt(sum(x * x for x in vector)) or 1.0
    return [x / length for x in vector]


def load_cache():
    if not CACHE_FILE.exists():
        return {}
    cache = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    # Första versionen sparade bara en modell: {"model": ..., "vectors": {...}}.
    if "model" in cache:
        return {cache["model"]: cache["vectors"]}
    return cache


def embeddings_for(model, texts):
    cache = load_cache()
    vectors = cache.setdefault(model, {})
    missing = sorted({t for t in texts if t not in vectors})
    if missing:
        token = os.environ.get("HF_TOKEN")
        if not token:
            sys.exit(
                'Miljövariabeln HF_TOKEN saknas. Kör först: export HF_TOKEN="din-token" (Git Bash) '
                'eller $env:HF_TOKEN = "din-token" (PowerShell)'
            )
        print(f"Hämtar vektorer för {len(missing)} texter från {model}...")
        for start in range(0, len(missing), 32):
            batch = missing[start : start + 32]
            for text, vector in zip(batch, fetch_embeddings(model, batch, token)):
                vectors[text] = normalize(vector)
        CACHE_FILE.write_text(json.dumps(cache), encoding="utf-8")
    return vectors


def similarity(a, b):
    return sum(x * y for x, y in zip(a, b))


# --- Matchning ---


class Matcher:
    """Allt som behövs för den nya matchningen med en viss modell."""

    def __init__(self, name, users):
        self.name = name
        self.vectors = embeddings_for(MODELS[name], all_texts(users))
        self.threshold = self._threshold(users)

    def sim(self, text_a, text_b):
        return similarity(self.vectors[model_text(text_a)], self.vectors[model_text(text_b)])

    def _threshold(self, users):
        """Likheten som bara de SIMILAR_PERCENTILE procent mest lika paren når upp till."""
        texts = all_texts(users)
        pairs = sorted(self.sim(a, b) for i, a in enumerate(texts) for b in texts[i + 1 :])
        return pairs[int(len(pairs) * (1 - SIMILAR_PERCENTILE / 100))]

    def user_vector(self, user):
        """Användarens intressen i stort: medelvärdet av alla hens vektorer."""
        vectors = [self.vectors[model_text(text)] for _, text in items_of(user)]
        return normalize([sum(column) / len(vectors) for column in zip(*vectors)])

    def best_pair(self, mine, theirs):
        """Det mest lika paret (likhet, min text, deras nyckel, deras text), eller None."""
        pairs = [(self.sim(t1, t2), t1, k2, t2) for _, t1 in mine for k2, t2 in theirs]
        return max(pairs) if pairs else None

    def score(self, me, other):
        score = 0
        reasons = []
        mine = items_of(me)
        theirs = items_of(other)
        their_keys = {key for key, _ in theirs}
        used = set()  # deras intressen som redan gett poäng
        done = set()  # mina intressen som redan gett poäng

        # 1. Exakt samma underintresse eller fritext.
        for key, text in mine:
            if key in their_keys:
                score += POINTS_SAME_SUB
                reasons.append(f"Ni gillar båda {text}")
                used.add(key)
                done.add(key)

        # 2. Samma huvudintresse (en gång per huvudintresse, och inte om det
        # redan finns ett exakt gemensamt underintresse där). Liknar
        # underintressena varandra blir det fler poäng, annars färre.
        def in_main(items, main):
            return [(k, t) for k, t in items if not is_freetext(k) and main_of(k) == main]

        def mains(items):
            return {main_of(k) for k, _ in items if not is_freetext(k)}

        already = {main_of(k) for k in done if not is_freetext(k)}
        for main in sorted((mains(mine) & mains(theirs)) - already):
            my_items = in_main(mine, main)
            their_items = in_main(theirs, main)
            best = self.best_pair(
                [(k, t) for k, t in my_items if "/" in k], [(k, t) for k, t in their_items if "/" in k]
            )
            if best and best[0] >= self.threshold:
                score += POINTS_SIMILAR
                reasons.append(f"{best[1]} liknar {best[3]} ({best[0]:.2f})")
            else:
                score += POINTS_SAME_MAIN
                reasons.append(f"Ni gillar båda {main.lower()}")
            used.update(k for k, _ in their_items)
            done.update(k for k, _ in my_items)

        # 3. AI-likhet för resten: det mest lika av deras intressen, om det är
        # tillräckligt likt.
        for key, text in mine:
            if key in done:
                continue
            best = self.best_pair([(key, text)], [(k, t) for k, t in theirs if k not in used])
            if best and best[0] >= self.threshold:
                score += POINTS_SIMILAR
                reasons.append(f"{text} liknar {best[3]} ({best[0]:.2f})")
                used.add(best[2])
        return score, reasons

    def overall(self, me, other):
        """Hur lika två personers intressen är i stort, för att skilja lika poäng åt."""
        return similarity(self.user_vector(me), self.user_vector(other))


def related_score(me, other):
    """Variant A: matchning på kopplingarna i related.json. Ingen AI när den körs,
    bara kopplingar som AI föreslagit och människor granskat i förväg."""
    score = 0
    reasons = []
    mine = items_of(me)
    theirs = items_of(other)
    their_keys = {key for key, _ in theirs}
    used = set()  # deras intressen som redan gett poäng
    done = set()  # mina intressen som redan gett poäng

    # 1. Exakt samma underintresse eller fritext.
    for key, text in mine:
        if key in their_keys:
            score += POINTS_SAME_SUB
            reasons.append(f"Ni gillar båda {text}")
            used.add(key)
            done.add(key)

    # 2. Intressen som hör ihop enligt related.json.
    for key, text in mine:
        if key in done:
            continue
        for their_key, their_text in theirs:
            if their_key not in used and their_key in RELATED.get(key, ()):
                score += POINTS_SIMILAR
                reasons.append(f"{text} hör ihop med {their_text}")
                used.add(their_key)
                done.add(key)
                break

    # 3. Samma huvudintresse, en gång per huvudintresse, om inget annat redan
    # gett poäng där.
    def mains(items, skip):
        return {main_of(k) for k, _ in items if not is_freetext(k) and k not in skip}

    covered = {main_of(k) for k in done | used if not is_freetext(k)}
    for main in sorted((mains(mine, done) & mains(theirs, used)) - covered):
        score += POINTS_SAME_MAIN
        reasons.append(f"Ni gillar båda {main.lower()}")
    return score, reasons


def user_overlap(me, other):
    """Hur stor del av intressena två personer delar (exakt eller via koppling),
    för att skilja lika poäng åt utan AI."""
    mine = set(me["interests"])
    theirs = set(other["interests"])
    linked = sum(1 for k in mine if k in theirs or RELATED.get(k, set()) & theirs)
    return linked / (len(mine | theirs) or 1)


def old_score(me, other):
    shared = sorted(set(me["interests"]) & set(other["interests"]))
    return len(shared), [f"Ni gillar båda {label(i)}" for i in shared]


def top_matches(me, users, scorer, tiebreak=None):
    results = []
    for other in users:
        if other is me:
            continue
        score, reasons = scorer(me, other)
        if score > 0:
            results.append((score, tiebreak(me, other) if tiebreak else 0, other["username"], reasons))
    # Flest poäng först; vid lika poäng mest lika intressen i stort.
    results.sort(key=lambda r: (-r[0], -r[1], r[2]))
    return results[:TOP]


# --- Utskrift ---


def print_matches(title, matches):
    print(title)
    if not matches:
        print("  (inga förslag)")
    for score, _, username, reasons in matches:
        print(f"  {score:>2} p  {username:<16} {'; '.join(reasons)}")
    print()


def print_user(me, users, matchers):
    print("=" * 78)
    liked = ", ".join([label(i) for i in me["interests"]] + me["freetext"])
    print(f"{me['username']}  gillar: {liked}")
    print("-" * 78)
    print_matches("DAGENS (exakt samma intresse)", top_matches(me, users, old_score))
    print_matches("A: KOPPLINGAR (related.json)", top_matches(me, users, related_score, user_overlap))
    for m in matchers:
        print_matches(f"NYTT, {m.name} (poäng + AI-likhet)", top_matches(me, users, m.score, m.overall))


def print_pairs(matcher, users, word):
    # Namnen som visas (t.ex. "Metal (Musik)"), inte beskrivningarna.
    texts = sorted({text for user in users for _, text in items_of(user)})
    pairs = [(matcher.sim(a, b), a, b) for i, a in enumerate(texts) for b in texts[i + 1 :]]
    if word:
        pairs = [p for p in pairs if word.lower() in p[1].lower() or word.lower() in p[2].lower()]
        if not pairs:
            sys.exit(f"Inget intresse eller fritext innehåller {word!r}.")
    pairs.sort(reverse=True)
    print(f"Mest lika par med {matcher.name} (gräns för 'liknar varandra': {matcher.threshold:.3f})")
    print("-" * 78)
    for sim, a, b in pairs[:TOP_PAIRS]:
        mark = "✓" if sim >= matcher.threshold else " "
        print(f"  {mark} {sim:.3f}  {a}  –  {b}")
    print()


def print_freetext_suggestions(matcher, users):
    """Var AI faktiskt hjälper: föreslå underintressen när någon skriver fritext.
    Användaren bekräftar själv ("Menar du Rollspel?"), så ett fel gör ingen skada."""
    freetexts = sorted({text for user in users for text in user["freetext"]})
    subs = sorted(t for t in DESCRIPTIONS if " (" in t and DESCRIPTIONS[t])
    matcher.vectors.update(embeddings_for(MODELS[matcher.name], [model_text(t) for t in subs] + freetexts))
    print(f"Förslag på underintresse för fritext, med {matcher.name}")
    print("-" * 78)
    for text in freetexts:
        best = sorted(((matcher.sim(text, sub), sub) for sub in subs), reverse=True)[:3]
        print(f"  {text:<20} -> " + ", ".join(f"{sub} ({sim:.2f})" for sim, sub in best))
    print()


def main():
    # Så att å, ä och ö blir rätt även i terminaler som inte använder UTF-8.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Prototyp: AI-matchning på intressen.")
    parser.add_argument("users", nargs="*", help="användarnamn att visa (standard: några utvalda)")
    parser.add_argument("--alla", action="store_true", help="visa alla användare")
    parser.add_argument("--modell", choices=MODELS, default="small", help="vilken modell (standard: small)")
    parser.add_argument("--jamfor", action="store_true", help="visa båda modellerna sida vid sida")
    parser.add_argument("--par", nargs="?", const="", metavar="ORD", help="visa de mest lika paren")
    parser.add_argument("--korta", action="store_true", help="skicka bara namnen till modellen, inte beskrivningarna")
    parser.add_argument("--ai", action="store_true", help="visa även AI-varianten (embeddings) bredvid A")
    parser.add_argument("--fritext", action="store_true", help="visa AI-förslag på underintresse för fritexten")
    args = parser.parse_args()

    global USE_DESCRIPTIONS
    USE_DESCRIPTIONS = not args.korta

    users = load_data()
    # AI-modellen (och HF_TOKEN) behövs bara för --ai, --par, --jamfor och --fritext.
    needs_ai = args.ai or args.jamfor or args.fritext or args.par is not None
    names = list(MODELS) if args.jamfor else [args.modell]
    matchers = [Matcher(name, users) for name in names] if needs_ai else []
    if matchers:
        print("Modellen får:", "bara namnen (--korta)" if args.korta else "beskrivningarna ur interests.json")
        for m in matchers:
            print(f"Gräns för 'liknar varandra' med {m.name}: {m.threshold:.3f}")
        print()

    if args.par is not None:
        for m in matchers:
            print_pairs(m, users, args.par)
        return
    if args.fritext:
        for m in matchers:
            print_freetext_suggestions(m, users)
        return

    by_name = {u["username"]: u for u in users}
    if args.alla:
        chosen = users
    elif args.users:
        unknown = [name for name in args.users if name not in by_name]
        if unknown:
            sys.exit(f"Okänd användare: {', '.join(unknown)}. Se fake_users.json.")
        chosen = [by_name[name] for name in args.users]
    else:
        chosen = [by_name[name] for name in SHOWCASE]

    for me in chosen:
        print_user(me, users, matchers if (args.ai or args.jamfor) else [])


if __name__ == "__main__":
    main()
