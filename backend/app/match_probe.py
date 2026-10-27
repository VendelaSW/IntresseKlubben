"""
Provar matchningen (services/matching.py) på riktiga profiler: väljer en person och visar vilka andra som matchar henne bäst och
sämst, med poängens delar, för att ställa in vikterna och gränserna.

Kör från backend/ med virtuella miljön aktiv:

    python -m app.match_probe demo_alma                    # de 15 bästa och 5 sämsta för demo_alma
    python -m app.match_probe demo_alma --antal 30
    python -m app.match_probe demo_alma --vikter 40,20,40 --beta 1.0    # prova andra vikter (intressen, närliggande, text)

Bara läsning: skriptet ändrar ingenting och anropar ingen AI, det läser de vektorer som redan är sparade. Det läser ur den databas
som DATABASE_URL pekar på (i vanliga fall den gemensamma Neon-databasen) och skriver ut vilken. Kör `python -m app.sync_embeddings`
först om profilerna saknar vektorer.

Kolumnerna: % är slutpoängen. int, när och txt är delarnas värden 0..1 (intressen i trädet, närliggande intressen, text), och
vikt-txt hur mycket texten vägde i slutet. cos-när och cos-txt är de råa cosinusvärdena före omräkningen till 0..1, som man
ställer in gränserna (near_lo/near_hi, text_lo/text_hi) efter. * efter procenten betyder att en del saknades.
"""

import argparse
import sys
from dataclasses import replace

from sqlalchemy.engine import make_url

from app.core.config import settings
from app.crud.interest_people import load_tree
from app.db.session import SessionLocal
from app.models.interest import Interest
from app.models.interest_embedding import InterestEmbedding
from app.models.profile import Profile
from app.models.profile_embedding import ProfileEmbedding
from app.models.user_interest import UserInterest
from app.services.interest_embeddings import text_hash
from app.services.matching import DEFAULT_CONFIG, MIN_INTERESTS, MIN_TEXT_CHARS, Person, readiness, score


def load(db):
    """Alla profiler som matchningens Person, med deras namn, plus intressenas träd, vektorer och namn."""
    interests_by_user: dict[int, set[int]] = {}
    for user_id, interest_id in db.query(UserInterest.user_id, UserInterest.interest_id):
        interests_by_user.setdefault(user_id, set()).add(interest_id)
    stored = {pid: (list(vec), digest) for pid, vec, digest in db.query(ProfileEmbedding.profile_id, ProfileEmbedding.embedding, ProfileEmbedding.embedding_hash)}

    people, names, usernames = {}, {}, {}
    for profile in db.query(Profile).all():
        text = (profile.profile_text or "").strip()
        vector, digest = stored.get(profile.id, (None, None))
        if digest != text_hash(text):  # som profile_vector: bara en vektor som hör till den nuvarande texten
            vector = None
        people[profile.user_id] = Person(
            id=profile.user_id,
            interests=frozenset(interests_by_user.get(profile.user_id, ())),
            text_chars=len(text),
            text_vector=vector,
        )
        names[profile.user_id] = profile.name
        usernames[profile.user_id] = profile.user.username
    interest_vectors = {iid: list(vec) for iid, vec in db.query(InterestEmbedding.interest_id, InterestEmbedding.embedding)}
    interest_names = dict(db.query(Interest.id, Interest.name))
    return people, names, usernames, load_tree(db).parents, interest_vectors, interest_names


def parse_weights(value: str) -> tuple[float, float, float]:
    parts = [float(part) for part in value.split(",")]
    if len(parts) != 3:
        raise argparse.ArgumentTypeError("--vikter ska vara tre tal, till exempel 35,25,40")
    return parts[0], parts[1], parts[2]


def main() -> None:
    parser = argparse.ArgumentParser(description="Visar vilka som matchar en profil bäst och sämst.")
    parser.add_argument("username", help="användarnamnet på profilen att matcha, till exempel demo_alma")
    parser.add_argument("--antal", type=int, default=15, help="hur många av de bästa som visas (standard 15)")
    parser.add_argument("--vikter", type=parse_weights, help="vikter för intressen, närliggande och text, till exempel 35,25,40")
    parser.add_argument("--beta", type=float, help="hur mycket extra en stark del väger (standard %s)" % DEFAULT_CONFIG.beta)
    args = parser.parse_args()

    config = DEFAULT_CONFIG
    if args.vikter:
        config = replace(config, weight_interests=args.vikter[0], weight_near=args.vikter[1], weight_text=args.vikter[2])
    if args.beta is not None:
        config = replace(config, beta=args.beta)

    url = make_url(settings.database_url)
    print(f"Databas: {url.host or url.database} ({url.get_backend_name()}), bara läsning")
    print(
        f"Vikter: intressen {config.weight_interests}, närliggande {config.weight_near}, text {config.weight_text}, beta {config.beta}"
    )

    db = SessionLocal()
    try:
        people, names, usernames, parents, interest_vectors, interest_names = load(db)
    finally:
        db.close()

    me_id = next((uid for uid, name in usernames.items() if name.lower() == args.username.lower()), None)
    if me_id is None:
        sys.exit(f"Hittar ingen profil med användarnamnet {args.username}.")
    me = people[me_id]
    ready = readiness(me)
    print(f"\n{names[me_id]} ({usernames[me_id]}): {len(me.interests)} intressen, {me.text_chars} tecken, vektor {'finns' if me.text_vector else 'SAKNAS'}")
    print("  intressen: " + ", ".join(sorted(interest_names.get(i, str(i)) for i in me.interests)))
    if not ready.ok:
        print(
            f"\nMatchning erbjuds inte: kräver minst {MIN_INTERESTS} intressen och {MIN_TEXT_CHARS} tecken "
            f"(saknar {ready.missing_interests} intressen och {ready.missing_chars} tecken)."
        )
        return

    ranked, skipped = [], 0
    for uid, other in people.items():
        if uid == me_id:
            continue
        if not readiness(other).ok:
            skipped += 1
            continue
        match = score(me, other, parents, interest_vectors, config)
        if match is not None:
            ranked.append((match, uid))
    ranked.sort(key=lambda item: (-item[0].percent, names[item[1]]))
    print(f"\n{len(ranked)} personer poängsatta, {skipped} hoppades över (för lite intressen eller text).\n")

    header = f"{'':>3} {'namn':<22} {'%':>5}  {'int':>4} {'när':>4} {'txt':>4} {'vikt-txt':>8} {'cos-när':>7} {'cos-txt':>7}  delade intressen"
    print(header)

    def row(rank: int, match, uid: int) -> str:
        parts, raw = match.parts, match.raw
        shared = ", ".join(sorted(interest_names.get(i, str(i)) for i in match.shared)) or "-"
        mark = "" if match.complete else "*"
        return (
            f"{rank:>3} {names[uid][:22]:<22} {str(match.percent) + mark:>5}  {parts['intressen']:>4.2f} "
            f"{parts.get('narliggande', float('nan')):>4.2f} {parts.get('text', float('nan')):>4.2f} {match.weights.get('text', 0):>8.2f} "
            f"{raw.get('narliggande', float('nan')):>7.2f} {raw.get('text', float('nan')):>7.2f}  {shared}"
        )

    for rank, (match, uid) in enumerate(ranked[: args.antal], start=1):
        print(row(rank, match, uid))
    if len(ranked) > args.antal:
        print("  ...")
        for offset, (match, uid) in enumerate(ranked[-5:]):
            print(row(len(ranked) - 4 + offset, match, uid))


if __name__ == "__main__":
    main()
