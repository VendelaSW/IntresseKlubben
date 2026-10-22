"""
/dev/...: testlägets adresser, för "Logga in som ..." och testpanelen. Finns bara när DEV_MODE är på (se main.py).
"""

from itertools import count

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.security import create_access_token, get_current_user
from app.db.session import get_db
from app.devtools import seed as data
from app.models.user import User
from app.schemas.user import LoginResponse

router = APIRouter(prefix="/dev", tags=["testläge"])

# Nya testpersoner i scenarierna heter Testperson 1, 2, 3 ... (räknas om när servern startar om).
_new_person = count(1)


class DevAccount(BaseModel):
    id: int
    username: str
    name: str | None
    about: str


class DevLogin(BaseModel):
    username: str


class ScenarioResult(BaseModel):
    message: str


def _user_by_username(db: Session, username: str) -> User | None:
    return db.query(User).filter(User.username == username).first()


@router.get("/accounts", response_model=list[DevAccount])
def list_accounts(db: Session = Depends(get_db)) -> list[DevAccount]:
    """Testkontona, för knapparna "Logga in som ..."."""
    accounts = []
    for account in data.ACCOUNTS:
        user = _user_by_username(db, account["username"])
        if user is not None:
            accounts.append(DevAccount(id=user.id, username=user.username, name=account["name"], about=account["about"]))
    return accounts


@router.post("/login", response_model=LoginResponse)
def login_as(body: DevLogin, db: Session = Depends(get_db)) -> LoginResponse:
    """Loggar in som ett konto utan lösenord."""
    user = _user_by_username(db, body.username)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Det finns inget sådant testkonto.")
    return LoginResponse(access_token=create_access_token(user.id), user=user)


@router.post("/reset", response_model=ScenarioResult)
def reset() -> ScenarioResult:
    """Börjar om: tömmer databasen och lägger in testdatan igen. Testkontona får samma id som förut, så den som
    är inloggad är det fortfarande (på samma konto)."""
    from app.devtools.database import rebuild
    from app.main import app

    rebuild(app)
    return ScenarioResult(message="Testdatan är återställd.")


def _new_contact(api: data.Api, user_id: int, accept: bool = True) -> tuple[int, str]:
    """En ny testperson med profil, som (om accept) redan är kontakt med användaren. Ger (id, namn)."""
    number = next(_new_person)
    name = f"Testperson {number}"
    person = data.create_account(
        api,
        {
            "username": f"testperson{number}",
            "name": name,
            "municipality": "1480",
            "interests": ["Brädspel"],
            "text": "Skapad av testpanelen.",
        },
    )
    data.make_contacts(api, person, user_id, accept=accept)
    return person, name


def _contact_request(api: data.Api, user_id: int) -> str:
    _, name = _new_contact(api, user_id, accept=False)
    return f"{name} har skickat en kontaktförfrågan."


def _letter(api: data.Api, user_id: int) -> str:
    person, name = _new_contact(api, user_id)
    api.call("POST", "/messages", person, json={"recipient_id": user_id, "text": f"Hej! Det här är {name}."})
    return f"{name} har skickat ett brev."


def _club_invitation(api: data.Api, user_id: int) -> str:
    person, name = _new_contact(api, user_id)
    club = data.create_club(api, person, f"{name}s klubb", "En privat klubb från testpanelen.", "Brädspel", True)
    api.call("POST", f"/groups/{club}/invitations", person, json={"user_ids": [user_id]})
    return f"{name} har bjudit in dig till en klubb."


def _event_invitation(api: data.Api, user_id: int) -> str:
    person, name = _new_contact(api, user_id)
    event = data.create_event(api, person, f"Spelkväll hos {name}", 2)
    api.call("POST", f"/events/{event}/invitations", person, json={"user_ids": [user_id], "group_ids": []})
    return f"{name} har bjudit in dig till ett event."


SCENARIOS = {
    "kontaktforfragan": ("Få en kontaktförfrågan", _contact_request),
    "brev": ("Få ett brev", _letter),
    "klubbinbjudan": ("Få en klubbinbjudan", _club_invitation),
    "eventinbjudan": ("Få en eventinbjudan", _event_invitation),
}


@router.get("/scenarios")
def list_scenarios() -> list[dict]:
    return [{"name": name, "label": label} for name, (label, _) in SCENARIOS.items()]


@router.post("/scenarios/{name}", response_model=ScenarioResult)
def run_scenario(name: str, user: User = Depends(get_current_user)) -> ScenarioResult:
    """Gör det scenariot beskriver för den inloggade, via appens eget API."""
    if name not in SCENARIOS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Det finns inget sådant scenario.")
    from app.main import app

    return ScenarioResult(message=SCENARIOS[name][1](data.Api(app), user.id))
