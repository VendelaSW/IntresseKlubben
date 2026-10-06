"""Svenska felmeddelanden som hör till "obligatoriska profilfält".

Bara texterna för den ticketen ligger här: validering av profilfälten, de
profil- och intressemeddelanden som ticketen införde, och översättningen av
Pydantics/FastAPIs standardfel. Övriga meddelanden i appen ligger kvar där
reglerna sitter, tills teamet bestämt om alla ska samlas.

Längst ner finns också hanteraren som ger alla endpoints svenska valideringsfel:
FastAPI/Pydantic skickar annars sina standardfel på engelska ("Field required").
Formen på svaret är oförändrad (`detail` är en lista där varje post har `loc`
och `msg`), bara texten är ny. Våra egna svenska validatormeddelanden lämnas
som de är.
"""

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# ---------- Validering av profilfält (schemas/profile.py) ----------
NAME_EMPTY = "Namn får inte vara tomt"
NAME_TOO_LONG = "Namn får max vara 50 tecken"
BIRTH_DATE_IN_FUTURE = "Födelsedatum kan inte vara i framtiden"
MUNICIPALITY_REQUIRED = "Välj en kommun"
DISTRICT_EMPTY = "Stadsdel får inte vara tom"
DISTRICT_TOO_LONG = "Stadsdel får max vara 100 tecken"
PROFILE_TEXT_EMPTY = "Om mig-texten får inte vara tom"
PROFILE_TEXT_TOO_LONG = "Om mig-texten får max vara 800 tecken"
INTERESTS_REQUIRED = "Välj minst ett intresse"

# ---------- Profil och intressen (routes/profile.py, routes/interests.py) ----------
PROFILE_NOT_FOUND = "Ingen profil hittad"
PROFILE_ALREADY_EXISTS = "Du har redan en profil"
UNKNOWN_MUNICIPALITY = "Okänd kommun"
UNKNOWN_INTEREST = "Okänt intresse"
LAST_INTEREST_CANNOT_BE_REMOVED = "Minst ett intresse krävs"

# ---------- Texter för standardfel (används längst ner) ----------
FIELD_REQUIRED = "Fältet är obligatoriskt"
INVALID_VALUE = "Ogiltigt värde"
MUST_BE_TEXT = "Fältet måste vara text"
MUST_BE_INTEGER = "Fältet måste vara ett heltal"
MUST_BE_LIST = "Fältet måste vara en lista"
INVALID_DATE = "Ogiltigt datum"
INVALID_JSON = "Ogiltig JSON"


def too_short(min_length: int) -> str:
    return f"Måste vara minst {min_length} tecken"


def too_long(max_length: int) -> str:
    return f"Får vara högst {max_length} tecken"


# ---------- Översättning av valideringsfel ----------
_STANDARD_ERRORS = {
    "missing": FIELD_REQUIRED,
    "enum": INVALID_VALUE,
    "string_type": MUST_BE_TEXT,
    "int_type": MUST_BE_INTEGER,
    "int_parsing": MUST_BE_INTEGER,
    "list_type": MUST_BE_LIST,
    "date_type": INVALID_DATE,
    "date_parsing": INVALID_DATE,
    "date_from_datetime_parsing": INVALID_DATE,
    "json_invalid": INVALID_JSON,
}


def swedish_message(error: dict) -> str:
    kind = error["type"]
    ctx = error.get("ctx") or {}
    if kind == "string_too_short" and "min_length" in ctx:
        return too_short(ctx["min_length"])
    if kind == "string_too_long" and "max_length" in ctx:
        return too_long(ctx["max_length"])
    return _STANDARD_ERRORS.get(kind, error["msg"])


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = [{**error, "msg": swedish_message(error)} for error in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(errors)})
