"""
Lägger in påhittade användare, klubbar och events i Stockholm, så att den som
användartestar har något att hitta på kartan och under Personer. Kör från
backend/, på samma sätt som `python -m app.sync_interests` (se CONTRIBUTING.md):

    python -m app.seed_demo_users               visar vad som skulle läggas in, ändrar inget
    python -m app.seed_demo_users --skapa       lägger in det som saknas
    python -m app.seed_demo_users --ta-bort     tar bort allt igen

Användarna (högst 40) heter demo_<förnamn>, har ett slumpmässigt lösenord som
ingen känner till (de går inte att logga in som) och cirka 10 slumpmässiga
intressen var ur biblioteket. De får ingen e-post och ingen profilbild.

Klubbarna (12) och eventen (15) är handskrivna, med vanliga intressen och riktiga
platser i Stockholm. Koordinaterna är ungefärliga och bara till för att sprida ut
dem på kartan. Eventen ligger de närmaste veckorna efter att skriptet körs.
Medlemmar och svar på eventen är slumpade bland demoanvändarna.

--ta-bort raderar bara det som hör till skriptet: användarna i listan nedan,
klubbarna i listan som de har skapat (även om någon riktig har gått med i dem) och
deras events. Det rör aldrig något annat och kan köras om och om igen. --skapa
hoppar över det som redan finns.

Ändrar den gemensamma databasen (DATABASE_URL), så skriptet skriver ut vilken
databas det gäller innan det gör något. Kör det aldrig från en branch som inte
är mergad.
"""

import argparse
import random
import secrets
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.core.config import settings
from app.crud.event import create_event, set_answer
from app.crud.group import create_group, delete_group, join_group
from app.crud.interest import list_interests
from app.crud.profile import create_profile
from app.crud.user import delete_user, get_user_by_username
from app.db.session import SessionLocal
from app.models.event import Event, EventAnswer, EventVisibility
from app.models.group import Group
from app.models.interest import Interest
from app.models.profile import GenderEnum
from app.models.user import User
from app.schemas.event import EventCreate
from app.schemas.group import GroupCreate
from app.schemas.profile import ProfileCreate

STOCKHOLM = "0180"
INTERESTS_PER_USER = 10
USERNAME_PREFIX = "demo_"

# Påhittade namn. Användarnamnet blir demo_ + förnamnet i små bokstäver.
NAMES = [
    ("Alma", "Lindqvist"), ("Elias", "Bergström"), ("Maja", "Holmgren"), ("Noel", "Sjöberg"),
    ("Saga", "Wallin"), ("Hugo", "Engström"), ("Ines", "Nyberg"), ("Vilgot", "Åkesson"),
    ("Tuva", "Forsberg"), ("Leo", "Lundgren"), ("Freja", "Hedlund"), ("Oskar", "Blom"),
    ("Linnea", "Strand"), ("Melker", "Dahl"), ("Selma", "Ekholm"), ("Axel", "Persson"),
    ("Ebba", "Rosén"), ("Theo", "Olofsson"), ("Mira", "Sandberg"), ("Isak", "Vikström"),
    ("Nora", "Carlsson"), ("Viggo", "Hellström"), ("Lykke", "Berglund"), ("Folke", "Mårtensson"),
    ("Ronja", "Eklund"), ("Gustav", "Löfgren"), ("Wilma", "Sundberg"), ("Albin", "Näslund"),
    ("Stella", "Fredriksson"), ("Elof", "Hansson"), ("Agnes", "Wikström"), ("Sixten", "Palm"),
    ("Julia", "Lindholm"), ("Benjamin", "Åberg"), ("Livia", "Granath"), ("Måns", "Ström"),
    ("Cornelia", "Bäckman"), ("Anton", "Edlund"), ("Signe", "Östlund"), ("Rasmus", "Westin"),
]

DISTRICTS = [
    "Södermalm", "Vasastan", "Östermalm", "Kungsholmen", "Norrmalm", "Hägersten", "Bromma",
    "Årsta", "Hammarbyhöjden", "Älvsjö", "Farsta", "Gamla stan", "Aspudden", "Hägerstensåsen",
]

GENDERS = [GenderEnum.kvinna, GenderEnum.man, GenderEnum.ickebinar, GenderEnum.vill_inte_uppge]

TEXTS = [
    "Hej! Jag gillar {a}, {b} och {c}. Bor på {district} och är nyfiken på att hitta fler som tycker likadant.",
    "Fritiden går åt till {a} och {b}, och lite {c} när det blir tid över. Hör gärna av dig om du vill hitta på något.",
    "Ny i Intresseklubben! Det mesta jag gör handlar om {a}, {b} och {c}. Jag bor på {district}.",
    "Jag letar efter folk att dela {a} med. {b} och {c} är också något jag lägger mycket tid på.",
]


def username_for(first_name: str) -> str:
    return USERNAME_PREFIX + first_name.lower()


def demo_usernames() -> list[str]:
    return [username_for(first) for first, _ in NAMES]


def seed(db: Session, count: int, rng: random.Random | None = None, log=print) -> int:
    """Lägger in upp till `count` användare, med sina profiler. Ger hur många som skapades."""
    rng = rng or random.Random()
    pool = [i for i in list_interests(db) if i.slug is not None]
    if len(pool) < INTERESTS_PER_USER:
        raise SystemExit("Biblioteket är inte inläst. Kör först: python -m app.sync_interests")

    created = 0
    for first, last in NAMES[:count]:
        username = username_for(first)
        if get_user_by_username(db, username) is not None:
            log(f"  hoppar över {username} (finns redan)")
            continue

        chosen = rng.sample(pool, INTERESTS_PER_USER)
        district = rng.choice(DISTRICTS)
        names = [i.name for i in chosen]
        text = rng.choice(TEXTS).format(a=names[0], b=names[1], c=names[2], district=district)
        birth_date = date.today() - timedelta(days=rng.randint(18 * 365, 45 * 365))

        data = ProfileCreate(
            name=f"{first} {last}",
            birth_date=birth_date,
            gender=GENDERS[created % len(GENDERS)],
            municipality_code=STOCKHOLM,
            profile_text=text,
            district=district,
            interest_ids=[i.id for i in chosen],
        )
        # Slumpat lösenord som ingen får se, så att ingen kan logga in som användaren.
        user = User(username=username, email=None, password_hash=hash_password(secrets.token_urlsafe(32)))
        db.add(user)
        db.commit()
        try:
            create_profile(db, user.id, data)
        except Exception:
            # Ingen användare utan profil kvar i databasen.
            db.rollback()
            delete_user(db, user)
            raise
        created += 1
        log(f"  skapade {username} ({first} {last}, {district}): {', '.join(names)}")
    return created


# ---------- Klubbar och events ----------

TIMEZONE = ZoneInfo("Europe/Stockholm")

# Riktiga platser i Stockholms kommun. Koordinaterna är ungefärliga (WGS84).
# nyckel: (platsens namn, område, latitud, longitud)
PLACES = {
    "ralis": ("Rålambshovsparken", "Kungsholmen, Stockholm", 59.3262, 18.0030),
    "medborgarplatsen": ("Medborgarplatsen", "Södermalm, Stockholm", 59.3145, 18.0735),
    "vasaparken": ("Vasaparken", "Vasastan, Stockholm", 59.3395, 18.0415),
    "humlegarden": ("Humlegården", "Östermalm, Stockholm", 59.3374, 18.0750),
    "tantolunden": ("Tantolunden", "Södermalm, Stockholm", 59.3140, 18.0485),
    "vitabergsparken": ("Vitabergsparken", "Södermalm, Stockholm", 59.3128, 18.0795),
    "langholmen": ("Långholmen", "Södermalm, Stockholm", 59.3190, 18.0000),
    "stortorget": ("Stortorget", "Gamla stan, Stockholm", 59.3250, 18.0710),
    "djurgarden": ("Djurgården", "Djurgården, Stockholm", 59.3270, 18.1040),
    "mariatorget": ("Mariatorget", "Södermalm, Stockholm", 59.3170, 18.0635),
    "odenplan": ("Odenplan", "Vasastan, Stockholm", 59.3428, 18.0498),
    "alvik": ("Alviks strand", "Bromma, Stockholm", 59.3335, 17.9800),
    "hornstull": ("Hornstull strand", "Södermalm, Stockholm", 59.3158, 18.0340),
}

# Handskrivna klubbar: (namn, intressets slug i biblioteket, beskrivning, när och var, plats).
# Namnet får vara högst 30 tecken och beskrivningen högst 200.
CLUBS = [
    ("Brädspelsklubben Söder", "bradspel",
     "Vi spelar allt från Catan till nya favoriter. Nybörjare är lika välkomna som veteraner, och vi lär ut reglerna.",
     "Torsdagar kl. 18.30, vi hittar ett bord nära Medborgarplatsen", "medborgarplatsen"),
    ("Löparna vid Rålis", "lopning",
     "Lugna och sociala löprundor runt Kungsholmen, i ett tempo där man kan prata. Alla nivåer är med.",
     "Söndagar kl. 10.00 vid Rålambshovsparken", "ralis"),
    ("Yoga i parken", "yoga",
     "Mjuk yoga utomhus så länge vädret tillåter. Ta med egen matta och något varmt att ha på dig.",
     "Onsdagar kl. 18.00 i Tantolunden", "tantolunden"),
    ("Fotopromenaden", "fotografering",
     "Vi går runt i stan med kameran eller mobilen och delar tips. Perfekt om du vill lära dig se motiv.",
     "Lördagar kl. 11.00, olika platser i innerstan", "stortorget"),
    ("Bokcirkeln Vasastan", "bokcirkel",
     "Vi läser en bok i månaden och pratar om den över en kopp kaffe. Förslag på böcker tas emot gärna.",
     "Första tisdagen i månaden kl. 18.30, Vasastan", "vasaparken"),
    ("Matlagning med vänner", "matlagning",
     "Vi lagar mat tillsammans hemma hos någon av oss och äter sedan allt vi gjort. Alla ingår i kökskaoset.",
     "Varannan fredag kl. 18.00, olika kök på Södermalm", "mariatorget"),
    ("Klättrarna", "klattring",
     "Inomhusklättring för både nybörjare och vana. Vi hjälps åt att hitta leder och säkra varandra.",
     "Tisdagar och torsdagar kl. 18.00, Södermalm", "hornstull"),
    ("Padel för nybörjare", "padel",
     "Vi spelar padel i lugn takt och byter partner mellan matcherna. Racket kan lånas.",
     "Lördagar kl. 12.00, bana i Stockholm", "alvik"),
    ("Fikagänget", "fika",
     "Vi fikar och pratar, mest om allt och inget. Ett bra sätt att lära känna nya människor utan krav.",
     "Lördagar kl. 14.00, ett kafé på Östermalm", "humlegarden"),
    ("Kallbadarna", "kallbad",
     "Morgondopp i kallt vatten, följt av varm dryck. Vi går efter varandra och tar det i din takt.",
     "Söndagar kl. 08.00, Långholmen", "langholmen"),
    ("Quizkväll på Söder", "quiz",
     "Vi går ihop i lag och tävlar mot varandra i allmänbildning. Du behöver inte kunna något särskilt.",
     "Varannan onsdag kl. 19.00, Södermalm", "mariatorget"),
    ("Stickcafé Kungsholmen", "stickning",
     "Ta med ditt stickprojekt och sitt med oss. Vi hjälper till med fastlagda maskor och mönster.",
     "Måndagar kl. 17.30, ett kafé på Kungsholmen", "ralis"),
]

# Handskrivna events: (titel, intressets slug, beskrivning, plats, klubbens namn eller None, starttimme).
# Datumen slumpas bland de närmaste veckorna när skriptet körs.
EVENTS = [
    ("Brädspelskväll för nybörjare", "bradspel",
     "Vi lär ut spel som är lätta att komma igång med. Kom ensam eller ta med en vän.", "medborgarplatsen",
     "Brädspelsklubben Söder", 18),
    ("Söndagslöpning 5 km", "lopning",
     "En social runda i lugnt tempo, med fika efteråt för den som vill.", "ralis", "Löparna vid Rålis", 10),
    ("Yoga i solnedgången", "yoga",
     "Mjuk yoga på gräset. Ta med matta och en filt.", "tantolunden", "Yoga i parken", 17),
    ("Fotopromenad i Gamla stan", "fotografering",
     "Vi går genom gränderna och letar motiv. Tips och idéer delas på vägen.", "stortorget", "Fotopromenaden", 11),
    ("Bokcirkel: höstens bok", "bokcirkel",
     "Vi pratar om månadens bok. Du behöver inte ha läst alla sidor.", "vasaparken", "Bokcirkeln Vasastan", 18),
    ("Laga mat ihop: pasta från grunden", "matlagning",
     "Vi gör pasta och sås tillsammans och äter sedan allt. Skriv i svaret om du har allergier.", "mariatorget",
     "Matlagning med vänner", 18),
    ("Prova på klättring", "klattring",
     "Första gången är välkommen. Vi går igenom grunderna och klättrar enkla leder.", "hornstull", "Klättrarna", 18),
    ("Padel-dubbel för alla nivåer", "padel",
     "Vi blandar lagen så att alla får spela med alla. Racket finns att låna.", "alvik", "Padel för nybörjare", 12),
    ("Fika i Vitabergsparken", "fika",
     "Ta med termos och något gott. Vi sitter i gräset så länge det är fint väder.", "vitabergsparken",
     "Fikagänget", 14),
    ("Morgondopp på Långholmen", "kallbad",
     "Ett kort dopp och sedan varm dryck. Ta med handduk och varma kläder.", "langholmen", "Kallbadarna", 8),
    ("Quizkväll: allmänbildning", "quiz",
     "Lag om fyra, men vi sätter ihop dig med andra om du kommer ensam.", "mariatorget", "Quizkväll på Söder", 19),
    ("Stickträff med fika", "stickning",
     "Ta med ditt projekt, nybörjare får hjälp att komma igång.", "ralis", "Stickcafé Kungsholmen", 17),
    ("Kaffeprat på Mariatorget", "kaffe",
     "Ett öppet fikatillfälle för alla som gillar kaffe. Vi pratar om bönor, bryggning och allt annat.",
     "mariatorget", None, 15),
    ("Dagsvandring på Djurgården", "dagsvandring",
     "En lugn promenad på ett par timmar genom Djurgårdens stigar. Ta med fika.", "djurgarden", None, 11),
    ("Schack i parken", "schack",
     "Ta med ett schackspel om du har ett. Alla nivåer är välkomna, vi spelar vänskapsmatcher.", "humlegarden",
     None, 16),
]


def _demo_users(db: Session) -> list[User]:
    return [u for u in (get_user_by_username(db, name) for name in demo_usernames()) if u is not None]


def _interests_by_slug(db: Session) -> dict[str, Interest]:
    return {i.slug: i for i in list_interests(db) if i.slug}


def seed_clubs(db: Session, rng: random.Random | None = None, log=print) -> int:
    """Skapar klubbarna i listan, med en slumpad demoanvändare som ägare och 5–10 slumpade
    medlemmar. Klubbar som redan finns i Stockholm hoppas över. Ger hur många som skapades."""
    rng = rng or random.Random()
    users = _demo_users(db)
    if len(users) < 2:
        log("  inga klubbar: skapa användarna först")
        return 0
    interests = _interests_by_slug(db)

    created = 0
    for name, slug, description, meeting_info, place in CLUBS:
        taken = (
            db.query(Group.id)
            .filter(func.lower(Group.name) == name.lower(), Group.municipality_code == STOCKHOLM)
            .first()
        )
        if taken is not None:
            log(f"  hoppar över klubben {name} (finns redan)")
            continue
        interest = interests.get(slug)
        if interest is None:
            log(f"  hoppar över klubben {name}: intresset {slug} finns inte i databasen")
            continue

        place_name, address, latitude, longitude = PLACES[place]
        owner = rng.choice(users)
        group = create_group(
            db,
            owner,
            GroupCreate(
                name=name,
                description=description,
                meeting_info=meeting_info,
                place_name=place_name,
                address=address,
                latitude=latitude,
                longitude=longitude,
                interest_id=interest.id,
                municipality_code=STOCKHOLM,
            ),
        )
        others = [u for u in users if u.id != owner.id]
        for member in rng.sample(others, min(rng.randint(5, 10), len(others))):
            join_group(db, group, member)
        created += 1
        log(f"  skapade klubben {name} ({place_name}, {interest.name}) med ägare {owner.username}")
    return created


def seed_events(db: Session, rng: random.Random | None = None, log=print) -> int:
    """Skapar eventen i listan, de närmaste fyra veckorna. Ett event hör till en klubb om den finns, och
    skapas av klubbens ägare, annars av en slumpad demoanvändare. 3–7 demoanvändare svarar Ja eller
    Kanske. Event med samma titel som redan finns hoppas över. Ger hur många som skapades."""
    rng = rng or random.Random()
    users = _demo_users(db)
    if len(users) < 2:
        log("  inga events: skapa användarna först")
        return 0
    demo_ids = [u.id for u in users]
    interests = _interests_by_slug(db)
    groups = {
        g.name: g
        for g in db.query(Group).filter(Group.municipality_code == STOCKHOLM, Group.created_by.in_(demo_ids)).all()
    }
    today = datetime.now(TIMEZONE).date()
    days = rng.sample(range(2, 30), len(EVENTS))

    created = 0
    for (title, slug, description, place, club_name, hour), offset in zip(EVENTS, days):
        exists = db.query(Event.id).filter(Event.title == title, Event.created_by.in_(demo_ids)).first()
        if exists is not None:
            log(f"  hoppar över eventet {title} (finns redan)")
            continue
        interest = interests.get(slug)
        if interest is None:
            log(f"  hoppar över eventet {title}: intresset {slug} finns inte i databasen")
            continue

        group = groups.get(club_name) if club_name else None
        creator = db.get(User, group.created_by) if group is not None else rng.choice(users)
        place_name, address, latitude, longitude = PLACES[place]
        day = today + timedelta(days=offset)
        starts_at = datetime(day.year, day.month, day.day, hour, 0, tzinfo=TIMEZONE)

        event = create_event(
            db,
            creator.id,
            EventCreate(
                title=title,
                description=description,
                interest_id=interest.id,
                starts_at=starts_at,
                ends_at=starts_at + timedelta(hours=2),
                place_name=place_name,
                address=address,
                latitude=latitude,
                longitude=longitude,
                visibility=EventVisibility.open,
                group_id=group.id if group is not None else None,
            ),
        )
        others = [u for u in users if u.id != creator.id]
        for guest in rng.sample(others, min(rng.randint(3, 7), len(others))):
            set_answer(db, event, guest.id, EventAnswer.yes if rng.random() < 0.7 else EventAnswer.maybe)
        created += 1
        log(f"  skapade eventet {title} ({day}, kl. {hour}, {place_name})")
    return created


def remove(db: Session, log=print) -> tuple[int, int, int]:
    """Tar bort demoanvändarna, deras klubbar och events, och bara dem. Ger (användare,
    klubbar, events) som togs bort."""
    users = _demo_users(db)
    demo_ids = [u.id for u in users]

    # Klubbarna först och explicit: annars blir en klubb som en riktig användare har gått med i kvar,
    # med den personen som ny ägare, när demoanvändarna tas bort ur den.
    club_names = [c[0].lower() for c in CLUBS]
    clubs = (
        db.query(Group)
        .filter(
            func.lower(Group.name).in_(club_names),
            Group.municipality_code == STOCKHOLM,
            Group.created_by.in_(demo_ids),
        )
        .all()
        if demo_ids
        else []
    )
    for club in clubs:
        name = club.name
        delete_group(db, club)
        log(f"  tog bort klubben {name}")

    # Eventen följer med användaren (delete_user), så de räknas bara här.
    events = db.query(Event).filter(Event.created_by.in_(demo_ids)).count() if demo_ids else 0

    for user in users:
        username = user.username
        delete_user(db, user)
        log(f"  tog bort {username}")
    return len(users), len(clubs), events


def main() -> None:
    parser = argparse.ArgumentParser(description="Påhittade användare, klubbar och events i Stockholm för användartester.")
    parser.add_argument("--skapa", action="store_true", help="lägg in det som saknas (annars visas bara vad som skulle ske)")
    parser.add_argument("--ta-bort", action="store_true", help="ta bort demoanvändarna, deras klubbar och events")
    parser.add_argument(
        "--antal",
        type=int,
        default=len(NAMES),
        help=f"hur många användare det ska finnas, högst {len(NAMES)} (standard {len(NAMES)})",
    )
    args = parser.parse_args()
    if args.skapa and args.ta_bort:
        parser.error("Välj antingen --skapa eller --ta-bort.")
    if not 1 <= args.antal <= len(NAMES):
        parser.error(f"--antal måste vara mellan 1 och {len(NAMES)}.")

    url = make_url(settings.database_url)
    print(f"Databas: {url.host or url.database} ({url.get_backend_name()})")

    db = SessionLocal()
    try:
        if args.ta_bort:
            print(f"Tar bort demoanvändarna ({USERNAME_PREFIX}*), deras klubbar och events:")
            users, clubs, events = remove(db)
            print(f"Klart: {users} användare, {clubs} klubbar och {events} events borttagna.")
        elif args.skapa:
            print(f"Skapar användare i Stockholm (högst {args.antal}):")
            users = seed(db, args.antal)
            print("Skapar klubbar:")
            clubs = seed_clubs(db)
            print("Skapar events:")
            events = seed_events(db)
            print(f"Klart: {users} användare, {clubs} klubbar och {events} events skapade.")
        else:
            existing_users = [u for u in demo_usernames()[: args.antal] if get_user_by_username(db, u)]
            demo_ids = [u.id for u in _demo_users(db)]
            existing_clubs = (
                db.query(Group.id)
                .filter(func.lower(Group.name).in_([c[0].lower() for c in CLUBS]), Group.municipality_code == STOCKHOLM)
                .count()
            )
            existing_events = (
                db.query(Event.id).filter(Event.title.in_([e[0] for e in EVENTS]), Event.created_by.in_(demo_ids)).count()
                if demo_ids
                else 0
            )
            print(
                "Provkörning, inget ändras. Med --skapa skulle det skapas: "
                f"{args.antal - len(existing_users)} användare ({len(existing_users)} finns redan), "
                f"{len(CLUBS) - existing_clubs} klubbar ({existing_clubs} finns redan) och "
                f"{len(EVENTS) - existing_events} events ({existing_events} finns redan)."
            )
    finally:
        db.close()


if __name__ == "__main__":
    main()
