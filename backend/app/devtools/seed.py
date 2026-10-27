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
        "text": "Springer gärna på morgonen och spelar brädspel på kvällarna. Letar efter fler att fotografera med.",
    },
    {
        "username": "bertil",
        "name": "Bertil Ek",
        "about": "Annas kontakt, äger Brädspelsklubben",
        "municipality": "1480",
        "interests": ["Brädspel", "Schack", "Matlagning"],
        "text": "Pensionär som älskar strategispel och att laga mat till många.",
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
                "birth_date": "1992-06-15",
                "gender": "vill inte uppge",
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

    # Alla testkonton har bekräftad e-post, så att inget mejl behövs.
    now = datetime.now(timezone.utc)
    for user in db.query(User).all():
        user.email_verified_at = now
    db.commit()
    return ids
