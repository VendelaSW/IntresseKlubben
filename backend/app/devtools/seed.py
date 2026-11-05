"""
Testdatan i testläget: testkonton med profiler, kontakter, klubbar, events och brev, gjorda via appens eget API
(så att allt går genom samma regler som på riktigt). Även jobbiga fall: ett långt namn, långa texter, maxlånga
titlar, ett konto där allt är tomt och ett konto utan profil (för intervjun).

Lägg gärna till det din nya feature behöver här, i samma PR, så att alla kan testa den direkt.
"""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.security import create_access_token
from app.models.user import User
from app.services import email

# Lösenordet för alla testkonton, om man vill logga in den vanliga vägen.
PASSWORD = "testlage123"

# Testkontona, i den ordning de visas under "Logga in som". `about` visas på knappen.
ACCOUNTS = [
    {
        "username": "anna",
        "name": "Anna Lindberg",
        "about": "Har det mesta: kontakter, klubbar, events, brev och förfrågningar",
        "municipality": "1480",
        "interests": ["Löpning", "Brädspel", "Fotografering"],
        "text": (
            "Springer gärna på morgonen och spelar brädspel på kvällarna. Letar efter fler att fotografera med. "
            "Jag tar gärna initiativ och vill helst träffa folk i Göteborg som också gillar att göra saker ihop."
        ),
    },
    {
        "username": "bertil",
        "name": "Bertil Ek",
        "about": "Annas kontakt, äger Brädspelsklubben och är moderator (Moderering)",
        "municipality": "1480",
        "interests": ["Brädspel", "Schack", "Matlagning"],
        "text": (
            "Pensionär som älskar strategispel och att laga mat till många. Jag söker nya spelkompisar till "
            "torsdagskvällarna och tar gärna med mig en gryta eller en paj."
        ),
    },
    {
        "username": "cecilia",
        "name": "Cecilia Karlsson",
        "about": "Har skickat en kontaktförfrågan till Anna",
        "municipality": "1481",
        "interests": ["Löpning", "Yoga"],
        "text": "Ny i Mölndal och vill hitta någon att springa med.",
    },
    {
        "username": "maximiliana",
        "name": "Maximiliana Augusta von Ekenstam-Lindqvist",
        "about": "Långt namn och långa texter, för att se att inget klipps",
        "municipality": "0180",
        "interests": ["Fotografering", "Brädspel", "Löpning", "Yoga", "Schack", "Matlagning", "Katter", "Bouldering"],
        "text": (
            "Hej! Jag heter Maximiliana men alla kallar mig Max. Jag bor i Stockholm sedan fem år tillbaka och "
            "jobbar som illustratör, vilket gör att jag ofta sitter ensam hemma vid ritbordet. Därför letar jag "
            "efter sammanhang där jag kan träffa nya människor som delar mina intressen: fotografering (helst "
            "analogt, jag framkallar själv i badrummet), brädspel av alla de slag (gärna långa strategispel som "
            "tar en hel kväll), löpning i lugnt tempo, yoga på helgerna, schack på nätet och i verkligheten, "
            "matlagning för många och mina två katter Sigge och Majken, som tyvärr inte gillar besök. Jag har "
            "också börjat klättra på bouldergym och letar efter någon att följa med. Hör av dig!"
        ),
    },
    {
        "username": "nils",
        "name": "Nils Nyström",
        # Bor inte i Göteborg, så att de öppna eventen där (för Anna) inte hamnar på hans Att göra.
        "about": "Har en profil men inget annat: tomma listor (öppna events syns ändå under Förslag)",
        "municipality": "0180",
        "interests": ["Katter"],
        "text": "Precis gått med.",
    },
    {
        "username": "utanprofil",
        "name": None,
        "about": "Har inte gjort intervjun än",
    },
]

# Fler personer att matcha mot (Matcha och Sök), utan egna knappar under "Logga in som": utan dem har bara ett konto en
# profil som räcker för matchningen (minst tre intressen och 100 tecken). Som Anna och Bertil ser dem får de olika
# nivåer: Tove är Annas tvilling (samma intressen och exakt samma text), Agnes är Bertils, Alva och Bengt har samma text
# men bara ett gemensamt intresse (en stark match), och resten har mer eller mindre gemensamt. Testläget har fejkade
# vektorer, och inga vektorer för intressena, så bara exakt samma text räknas som lika text (och närliggande intressen
# saknas); i övrigt styr antalet gemensamma intressen. De har olika kön (valbart att synas på), födelseår och kommun, så att filtren går att prova.
# Valfria fält: gender, birth_date och searchable (om de går att hitta på kön).
_ANNA_TEXT = ACCOUNTS[0]["text"]
_BERTIL_TEXT = ACCOUNTS[1]["text"]
FIGURANTS = [
    {"username": "tove", "name": "Tove Aronsson", "municipality": "1480", "gender": "kvinna", "birth_date": "1991-03-02", "searchable": True,
     "interests": ["Löpning", "Brädspel", "Fotografering"], "text": _ANNA_TEXT},
    {"username": "alva", "name": "Alva Östberg", "municipality": "1480", "gender": "kvinna", "birth_date": "1995-08-18", "searchable": True,
     "interests": ["Löpning", "Yoga", "Cykling"], "text": _ANNA_TEXT},
    {"username": "bengt", "name": "Bengt Cederlund", "municipality": "1480", "gender": "man", "birth_date": "1955-01-29", "searchable": True,
     "interests": ["Brädspel", "Yoga", "Bakning"], "text": _BERTIL_TEXT},
    {"username": "gustav", "name": "Gustav Hall", "municipality": "1480", "gender": "man", "birth_date": "1988-09-21", "searchable": True,
     "interests": ["Löpning", "Brädspel", "Fotografering", "Kaffe"],
     "text": "Jag springer, fotograferar och älskar en bra spelkväll. Kaffe är en livsstil. Söker någon som gärna hittar på saker spontant."},
    {"username": "ida", "name": "Ida Sjöberg", "municipality": "1481", "gender": "kvinna", "birth_date": "1996-12-11", "searchable": True,
     "interests": ["Löpning", "Brädspel", "Yoga", "Cykling"],
     "text": "Rörelse är mitt sätt att varva ner. Jag springer, cyklar och gör yoga, och på kvällen vill jag gärna ha ett spel på bordet."},
    {"username": "oskar", "name": "Oskar Bergman", "municipality": "1480", "gender": "man", "birth_date": "1984-05-30", "searchable": True,
     "interests": ["Brädspel", "Fotografering", "Schack"],
     "text": "Jag tar bilder när jag är ute och spelar schack på nätet. Letar efter någon att spela brädspel med på riktigt."},
    {"username": "maja", "name": "Maja Wallin", "municipality": "0180", "gender": "kvinna", "birth_date": "2000-07-08", "searchable": True,
     "interests": ["Löpning", "Cykling", "Simning"],
     "text": "Triathlon är målet, men just nu mest löpning och cykling. Vill gärna ha någon som pushar mig vid morgonpassen."},
    {"username": "david", "name": "David Ek", "municipality": "0180", "gender": "man", "birth_date": "1979-01-17", "searchable": False,
     "interests": ["Brädspel", "Pussel", "Tv-spel"],
     "text": "Spelar allt som går att spela: bräde, pussel eller tv-spel. Helst i grupp och helst med snacks. Jag bjuder gärna hem."},
    {"username": "lena", "name": "Lena Åkesson", "municipality": "1481", "gender": "kvinna", "birth_date": "1965-10-04", "searchable": True,
     "interests": ["Fotografering", "Keramik", "Stickning"],
     "text": "Skapar mycket med händerna: lera, garn och kamera. Letar efter någon att gå på utställningar och fotopromenader med."},
    {"username": "erik", "name": "Erik Lund", "municipality": "1480", "gender": "man", "birth_date": "1993-04-25", "searchable": True,
     "interests": ["Löpning", "Padel", "Tennis"],
     "text": "Racketsport och löpning, mest för att jag gillar att tävla lite. Det vore kul med en fast padelkväll och någon att köra intervaller med."},
    {"username": "sofia", "name": "Sofia Nilsson", "municipality": "1481", "gender": "ickebinär", "birth_date": "1998-02-14", "searchable": True,
     "interests": ["Yoga", "Dans", "Bakning"],
     "text": "Jag dansar, bakar och gör yoga på söndagarna. Söker folk som vill ha mjuka helger med mycket kardemumma och musik."},
    {"username": "karl", "name": "Karl Dahl", "municipality": "0180", "gender": "man", "birth_date": "1972-08-19", "searchable": True,
     "interests": ["Fiske", "Segling", "Camping"],
     "text": "Ute så fort vädret tillåter: fiske, segling och camping. Jag söker sällskap till längre turer i skärgården."},
    {"username": "hanna", "name": "Hanna Berg", "municipality": "0180", "gender": "kvinna", "birth_date": "1994-06-03", "searchable": True,
     "interests": ["Programmering", "Tv-spel", "Katter"],
     "text": "Jobbar med kod, spelar på fritiden och har två katter som styr hemmet. Söker någon att bygga små projekt och spela med."},
    {"username": "mats", "name": "Mats Holm", "municipality": "1481", "gender": "man", "birth_date": "1969-11-27", "searchable": True,
     "interests": ["Vin", "Matlagning", "Bakning"],
     "text": "Matlagning är min stora grej, med ett glas vin till. Jag bjuder gärna på middag och vill lära mig mer om surdeg."},
    {"username": "nora", "name": "Nora Lindqvist", "municipality": "1480", "gender": "kvinna", "birth_date": "2002-09-09", "searchable": True,
     "interests": ["Löpning", "Brädspel", "Hundar"],
     "text": "Ny i Göteborg och söker nya vänner. Jag springer med min hund varje morgon och gillar att spela brädspel på kvällarna."},
    {"username": "viktor", "name": "Viktor Strand", "municipality": "1481", "gender": "man", "birth_date": "1986-03-31", "searchable": True,
     "interests": ["Fotografering", "Löpning", "Jazz"],
     "text": "Fotograferar konserter och springer för att hålla igång. Det vore kul att hitta någon att gå på jazzklubb med."},
    {"username": "elin", "name": "Elin Forsberg", "municipality": "0180", "gender": "kvinna", "birth_date": "1990-12-22", "searchable": True,
     "interests": ["Teater", "Jazz", "Dans"],
     "text": "Kultur är mitt liv: teater, jazz och dans. Jag har säsongskort på två scener och söker någon att dela dem med."},
    {"username": "pelle", "name": "Pelle Sandberg", "municipality": "0180", "gender": "man", "birth_date": "1981-07-15", "searchable": False,
     "interests": ["Fotboll", "Skidåkning", "Cykling"],
     "text": "Fotboll på sommaren, skidor på vintern och cykel däremellan. Jag gillar lagsporter och vill gärna ha ett gäng att träna med."},
    {"username": "agnes", "name": "Agnes Persson", "municipality": "1480", "gender": "kvinna", "birth_date": "1958-05-12", "searchable": True,
     "interests": ["Brädspel", "Schack", "Matlagning"], "text": _BERTIL_TEXT},
    {"username": "lars", "name": "Lars Nyberg", "municipality": "1481", "gender": "man", "birth_date": "1975-02-06", "searchable": True,
     "interests": ["Bokcirkel", "Trädgård", "Katter"],
     "text": "Jag läser mycket, odlar grönsaker och har tre katter. Söker en bokcirkel där man hinner prata om annat än boken också."},
]

LONG_LETTER = (
    "Hej Anna! Jag såg att du också gillar fotografering och brädspel, och tänkte skriva några rader. "
    "Jag är i Göteborg nästa månad för jobb och skulle gärna gå en fotopromenad längs älven eller i Haga om du "
    "har tid. Jag har en gammal Hasselblad som jag gärna visar, och om vädret är dåligt kan vi ju alltid spela "
    "något i stället. Vad har du för kamera själv? Jag har märkt att det är lättare att våga fotografera "
    "människor på stan när man är två, så det vore roligt att prova tillsammans. Säg till vilka dagar som "
    "passar så ordnar jag resten! Hälsningar Max (som egentligen heter Maximiliana, men det är så långt)."
)


class _NoEmails:
    def send(self, to, subject, text, html):
        pass


@contextmanager
def _no_emails():
    """Testkontona får inga mejl (bekräftelsen vid registreringen), så att terminalen inte fylls av dem."""
    previous = email._override
    email.set_email_sender(_NoEmails())
    try:
        yield
    finally:
        email.set_email_sender(previous)


class Api:
    """Anrop mot appens eget API i samma process, som en viss användare. Ett fel stoppar med ett tydligt
    meddelande, så att testdatan inte tyst blir halv när appen ändras."""

    def __init__(self, app):
        self._client = TestClient(app)

    def call(self, method: str, path: str, user_id: int | None = None, json=None):
        headers = {"Authorization": f"Bearer {create_access_token(user_id)}"} if user_id else {}
        with _no_emails():
            response = self._client.request(method, path, headers=headers, json=json)
        if response.status_code >= 400:
            raise RuntimeError(f"Testdatan: {method} {path} gav {response.status_code}: {response.text[:300]}")
        return response.json() if response.content else None


def _future(days: int, hour: int = 16) -> str:
    # I UTC: kl 16 är kl 17 eller 18 svensk tid.
    start = datetime.now(timezone.utc) + timedelta(days=days)
    return start.replace(hour=hour, minute=0, second=0, microsecond=0).isoformat()


def interest_ids(api: Api, names: list[str]) -> list[int]:
    """Id:n för de intressen i biblioteket som har de här namnen. Saknas alla blir det det första intresset."""
    library = api.call("GET", "/interests/")
    by_name = {item["name"].lower(): item["id"] for item in library}
    ids = [by_name[name.lower()] for name in names if name.lower() in by_name]
    return ids or [library[0]["id"]]


def create_account(api: Api, account: dict) -> int:
    """Registrerar kontot och gör dess profil (om det ska ha en). Ger användarens id."""
    username = account["username"]
    user = api.call(
        "POST", "/users/register", json={"username": username, "email": f"{username}@example.com", "password": PASSWORD}
    )
    if account.get("name"):
        api.call(
            "POST",
            "/profile/",
            user["id"],
            json={
                "name": account["name"],
                "birth_date": account.get("birth_date", "1992-06-15"),
                "gender": account.get("gender", "vill inte uppge"),
                "gender_searchable": account.get("searchable", False),
                "municipality_code": account["municipality"],
                "profile_text": account["text"],
                "interest_ids": interest_ids(api, account["interests"]),
            },
        )
    return user["id"]


def make_contacts(api: Api, requester: int, addressee: int, accept: bool = True) -> None:
    request = api.call("POST", "/contacts/request", requester, json={"addressee_id": addressee})
    if accept:
        api.call("PATCH", f"/contacts/requests/{request['id']}", addressee, json={"action": "accept"})


def create_club(
    api: Api, owner: int, name: str, description: str, interest: str, private: bool = False, **extra
) -> int:
    """En klubb i Göteborg, eller med `extra` t.ex. ett annat område (scope, scope_code), ansökan
    (visibility="application"), nivå (skill_level) eller max antal medlemmar (max_members)."""
    club = api.call(
        "POST",
        "/groups/",
        owner,
        json={
            "name": name,
            "description": description,
            "interest_id": interest_ids(api, [interest])[0],
            "municipality_code": "1480",
            "visibility": "private" if private else "public",
            **extra,
        },
    )
    return club["id"]


def create_event(api: Api, owner: int, title: str, days: int, **extra) -> int:
    body = {
        "title": title,
        "description": extra.pop("description", "Välkomna!"),
        "interest_id": interest_ids(api, [extra.pop("interest", "Brädspel")])[0],
        "starts_at": _future(days),
        "place_name": extra.pop("place_name", "Stadsbiblioteket"),
        "address": extra.pop("address", "Götaplatsen 3"),
    }
    body.update(extra)
    return api.call("POST", "/events/", owner, json=body)["id"]


def seed(app, db: Session) -> dict[str, int]:
    """Fyller en tom databas med testdatan. Ger {användarnamn: id}."""
    api = Api(app)
    ids = {account["username"]: create_account(api, account) for account in ACCOUNTS}
    anna, bertil, cecilia, max_, nils = (ids[n] for n in ("anna", "bertil", "cecilia", "maximiliana", "nils"))
    for account in FIGURANTS:
        create_account(api, account)  # ingen kontakt eller något annat; bara någon att matcha mot

    # Kontakter: Anna och Bertil är kontakter, Cecilia väntar på Annas svar, Anna väntar på Nils svar.
    make_contacts(api, anna, bertil)
    make_contacts(api, anna, max_)
    make_contacts(api, cecilia, anna, accept=False)
    make_contacts(api, anna, nils, accept=False)

    # Brev: en kort konversation med Bertil och ett långt, oläst brev från Max.
    api.call("POST", "/messages", bertil, json={"recipient_id": anna, "text": "Hej! Kommer du på brädspelskvällen?"})
    api.call("POST", "/messages", anna, json={"recipient_id": bertil, "text": "Ja, jag tar med Catan!"})
    api.call("POST", "/messages", bertil, json={"recipient_id": anna, "text": "Toppen, vi ses!"})
    api.call("POST", "/messages", max_, json={"recipient_id": anna, "text": LONG_LETTER})

    # Klubbar: Anna är med i Bertils, och har en inbjudan till en privat klubb. Max klubb har maxlångt namn.
    board_games = create_club(api, bertil, "Brädspelsklubben Göteborg", "Vi spelar varannan torsdag.", "Brädspel")
    api.call("PUT", f"/groups/{board_games}/members/me", anna)
    # Anna är administratör i Brädspelsklubben (SCRUM-160), så att det går att prova som admin.
    api.call("PUT", f"/groups/{board_games}/members/{anna}/role", bertil, json={"role": "admin"})
    create_club(api, anna, "Morgonlöparna", "Vi springer 5 km varje lördag kl 8.", "Löpning")
    chess = create_club(api, bertil, "Schackcirkeln", "En liten privat klubb.", "Schack", private=True)
    api.call("POST", f"/groups/{chess}/invitations", bertil, json={"user_ids": [anna]})
    create_club(
        api,
        max_,
        "Fotografiska vänner i Stockhol",  # 30 tecken, maxlängden
        "Vi går fotopromenader, framkallar tillsammans, pratar om kameror och objektiv och ses ibland på "
        "utställningar. Alla nivåer är välkomna, från mobilkamera till storformat. Ta med fika!"[:200],
        "Fotografering",
    )
    # Klubbar för större områden, ansökan, nivå och max antal (SCRUM-282, 159 och 216). Anna äger en klubb man
    # ansöker till, och Cecilia har ansökt med ett meddelande. Stickcirkeln är full.
    book_club = create_club(
        api, anna, "Bokcirkeln Väst", "Vi läser en bok i månaden och ses digitalt.", "Bokcirkel",
        scope="lan", scope_code="14", visibility="application", skill_level="all_levels", max_members=12,
    )
    api.call("PUT", f"/groups/{book_club}/requests/me", cecilia, json={"message": "Jag läser allt av Kerstin Ekman!"})
    create_club(
        api, bertil, "Fjällvandrare i Norrland", "Turer i fjällen varje sommar.", "Fjällvandring",
        scope="landsdel", scope_code="norrland", skill_level="experienced",
    )
    create_club(
        api, max_, "Nätschack Sverige", "Vi spelar schack på nätet, från hela landet.", "Schack",
        scope="country", visibility="application",
    )
    knitting = create_club(api, bertil, "Lilla stickcirkeln", "Vi stickar på café.", "Stickning", max_members=2)
    api.call("PUT", f"/groups/{knitting}/members/me", max_)
    api.call("POST", f"/groups/{board_games}/messages", bertil, json={"content": "Välkomna till klubben!"})

    # Events: Annas eget med svar, en inbjudan från Bertil, ett i klubben och ett med maxlång titel.
    run = create_event(
        api, anna, "Löprunda i Slottsskogen", 3, interest="Löpning", place_name="Slottsskogen",
        address="Slottsskogsvallen 1", latitude=57.684, longitude=11.945,
    )
    api.call("POST", f"/events/{run}/invitations", anna, json={"user_ids": [bertil, max_], "group_ids": []})
    api.call("PUT", f"/events/{run}/response", bertil, json={"answer": "yes"})
    api.call("PUT", f"/events/{run}/response", max_, json={"answer": "maybe"})
    # Bertil är medarrangör för löprundan (SCRUM-296), som har max 4 och nivån Nybörjare (SCRUM-293).
    api.call("PUT", f"/events/{run}/hosts/{bertil}", anna)
    api.call("PATCH", f"/events/{run}", anna, json={"max_attendees": 4, "skill_level": "beginner"})
    # Ett event man ansöker till, med en ansökan från Cecilia, och ett digitalt event för hela Norrland (SCRUM-295).
    tasting = create_event(
        api, anna, "Ostprovning hemma hos Anna", 6, visibility="application", max_attendees=6,
        description="Vi provar sex ostar. Det får plats sex, så skriv gärna några rader om dig.",
        place_name="Hemma hos Anna", address="Linnégatan 5",
    )
    api.call("PUT", f"/events/{tasting}/requests/me", cecilia, json={"message": "Jag älskar ost!"})
    create_event(
        api, bertil, "Digital fjällplanering", 4, visibility="open", scope="landsdel", scope_code="norrland",
        interest="Fjällvandring", description="Vi planerar sommarens turer över video.", place_name="Online",
        address="Länk skickas ut",
    )
    game_night = create_event(api, bertil, "Brädspelskväll", 5)
    api.call("POST", f"/events/{game_night}/invitations", bertil, json={"user_ids": [anna], "group_ids": []})
    create_event(api, bertil, "Klubbträff: nya spel", 9, group_id=board_games)
    long_title = create_event(
        api, max_, "Fotopromenad genom Gamla stan i höstens bästa ljus", 12,  # 50 tecken, maxlängden
        interest="Fotografering", place_name="Stortorget", address="Stortorget 1, Stockholm",
        description=LONG_LETTER[:800],
    )
    api.call("POST", f"/events/{long_title}/invitations", max_, json={"user_ids": [anna], "group_ids": []})
    # Öppna events i Annas kommun (Göteborg) den här veckan, som hon inte är inbjuden till: de syns under
    # Förslag och under "I närheten den här veckan" på Att göra, Fotopromenaden först eftersom Anna gillar
    # fotografering. Kommunen står i adressen, som kartan och Att göra läser den.
    create_event(
        api, cecilia, "Fotopromenad i Haga", 2, interest="Fotografering", place_name="Haga",
        address="Haga Nygata 1, Göteborg", visibility="open",
    )
    create_event(
        api, bertil, "Schackkväll på biblioteket", 1, interest="Schack", address="Götaplatsen 3, Göteborg",
        visibility="open",
    )

    # Moderering: Bertil är moderator. Maximiliana är anmäld två gånger, och har redan fått en varning för den
    # första (SCRUM-268), så att historiken och förvalet efter en varning syns på den nya anmälan.
    db.get(User, bertil).is_moderator = True
    db.commit()
    first = api.call(
        "POST", "/reports", cecilia,
        json={"target_type": "profile", "target_id": max_, "reason": "spam", "comment": "Skickar reklam till alla."},
    )
    api.call(
        "POST", f"/moderation/reports/{first['id']}/warning", bertil,
        json={"reason": "spam", "message": "Reklam är inte tillåten i Intresseklubben."},
    )
    api.call(
        "POST", "/reports", anna,
        json={"target_type": "profile", "target_id": max_, "reason": "harassment", "comment": "Otrevlig i brev."},
    )

    # Alla testkonton har bekräftad e-post, så att inget mejl behövs.
    now = datetime.now(timezone.utc)
    for user in db.query(User).all():
        user.email_verified_at = now
    db.commit()
    return ids
