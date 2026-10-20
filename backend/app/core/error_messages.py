"""Svenska felmeddelanden för "obligatoriska profilfält" och för events.

Bara texterna för de funktionerna ligger här: validering av profilfälten, de
profil- och intressemeddelanden som de införde, felen för events, och
översättningen av Pydantics/FastAPIs standardfel. Övriga meddelanden i appen
ligger kvar där reglerna sitter, tills teamet bestämt om alla ska samlas.

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
PROFILE_TEXT_NOT_ALLOWED = "Texten verkar innehålla något som inte får finnas här. Skriv om den"
TEXT_CHECK_UNAVAILABLE = "Vi kunde inte kontrollera texten just nu. Försök igen om en stund"
INTERESTS_REQUIRED = "Välj minst ett intresse"
# Resten av appen är låst tills profilen är klar (se require_profile).
PROFILE_REQUIRED = "Skapa din profil först."

# ---------- Profil och intressen (routes/profile.py, routes/interests.py) ----------
PROFILE_NOT_FOUND = "Ingen profil hittad"
PROFILE_ALREADY_EXISTS = "Du har redan en profil"
UNKNOWN_MUNICIPALITY = "Okänd kommun"
UNKNOWN_INTEREST = "Okänt intresse"
LAST_INTEREST_CANNOT_BE_REMOVED = "Minst ett intresse krävs"

# ---------- Validering av events (schemas/event.py) ----------
EVENT_TITLE_EMPTY = "Titel får inte vara tom"
EVENT_TITLE_TOO_LONG = "Titel får max vara 50 tecken"
EVENT_DESCRIPTION_EMPTY = "Beskrivning får inte vara tom"
EVENT_DESCRIPTION_TOO_LONG = "Beskrivning får max vara 800 tecken"
EVENT_PLACE_NAME_EMPTY = "Platsnamn får inte vara tomt"
EVENT_PLACE_NAME_TOO_LONG = "Platsnamn får max vara 100 tecken"
EVENT_ADDRESS_EMPTY = "Gatuadress får inte vara tom"
EVENT_ADDRESS_TOO_LONG = "Gatuadress får max vara 100 tecken"
EVENT_INTEREST_REQUIRED = "Välj ett intresse"
EVENT_START_EMPTY = "Starttiden får inte vara tom"
EVENT_START_IN_PAST = "Starttiden måste vara i framtiden"
EVENT_END_BEFORE_START = "Sluttiden måste vara efter starttiden"
EVENT_TIME_NEEDS_TIMEZONE = "Ange tiden med tidszon"
EVENT_INVITE_NOBODY = "Välj minst en person eller klubb att bjuda in"
EVENT_GUESTS_CAN_INVITE_EMPTY = "Välj om gäster får bjuda in"

# ---------- Position på kartan (schemas/position.py, routes/geocode.py) ----------
POSITION_INCOMPLETE = "Ange både latitud och longitud, eller ingen av dem"
POSITION_OUTSIDE_SWEDEN = "Platsen måste ligga i Sverige"
GEOCODE_QUERY_TOO_SHORT = "Skriv minst tre tecken"
GEOCODE_QUERY_TOO_LONG = "Sökningen får max vara 200 tecken"
GEOCODE_UNAVAILABLE = "Adressökningen fungerar inte just nu. Sätt ut nålen på kartan själv."
GEOCODE_TOO_MANY_REQUESTS = "För många sökningar. Vänta en stund"
GROUP_PLACE_NAME_TOO_LONG = "Platsnamn får max vara 100 tecken"
GROUP_ADDRESS_TOO_LONG = "Adress får max vara 100 tecken"

# ---------- Events (routes/events.py, crud/event.py) ----------
EVENT_NOT_FOUND = "Eventet finns inte"
EVENT_CANCEL_MESSAGE_TOO_LONG = "Meddelandet får max vara 300 tecken"
EVENT_ONLY_CREATOR = "Bara den som skapat eventet kan ändra det"
EVENT_ONLY_CREATOR_CAN_INVITE = "Bara den som skapat eventet kan bjuda in"
EVENT_IN_PRIVATE_GROUP_CANNOT_BE_OPEN = "Events i privata klubbar kan inte vara öppna"
GROUP_NOT_FOUND = "Klubben finns inte"
MUST_BE_GROUP_MEMBER = "Du måste vara med i klubben"
CAN_ONLY_INVITE_CONTACTS = "Du kan bara bjuda in dina kontakter"
PERSON_NOT_INVITED = "Personen är inte inbjuden"
GROUP_INVITE_NOBODY = "Välj minst en person att bjuda in"
GROUP_CANNOT_INVITE = "Du kan inte bjuda in till den här klubben"

# ---------- Notiser (routes/notifications.py, crud/notification.py) ----------
NOTIFICATION_NOT_FOUND = "Notisen finns inte"

# ---------- Inlägg i klubbar (routes/groups.py, schemas/group_post.py) ----------
GROUP_POST_EMPTY = "Inlägget får inte vara tomt"
GROUP_POST_TOO_LONG = "Inlägget får max vara 2000 tecken"
GROUP_POST_NOT_FOUND = "Inlägget finns inte"
GROUP_POST_CANNOT_DELETE = "Bara den som skrev inlägget och klubbens ägare kan radera det"
GROUP_POST_PINNED_CANNOT_DELETE = "Inlägget är fastnålat, så bara klubbens ägare kan radera det"
GROUP_POST_ONLY_OWNER_CAN_PIN = "Bara klubbens ägare kan nåla fast inlägg"

# Intervju: intressen ur fri text
INTERVIEW_TEXT_EMPTY = "Skriv något om dina intressen"
INTERVIEW_AI_NOT_CONFIGURED = "AI-tjänsten är inte inställd"
INTERVIEW_AI_FAILED = "AI-tjänsten svarade inte. Försök igen om en stund"
INTERVIEW_TOO_MANY_REQUESTS = "För många försök. Vänta en stund"
ANALYZE_UNAVAILABLE = "Vi kunde inte tolka texten just nu. Välj dina intressen i listan i stället."
CONFIRM_SEAL_INVALID = "Förslagen är inte längre giltiga. Tolka texten igen."
CONFIRM_UNKNOWN_PROPOSAL = "Okänt förslag"
CONFIRM_ACTIVITY_NOT_ALLOWED = "Den aktiviteten passar inte intresset"
CONFIRM_NARROW_NOT_ALLOWED = "Det valet finns inte för intresset"
CONFIRM_INTEREST_GONE = "Intresset finns inte längre. Tolka texten igen."
CONFIRM_OWN_INTEREST_NAME = "Namnet på det nya intresset är inte tillåtet"
CONFIRM_TOO_MANY_OWN_INTERESTS = "Du har lagt till många egna intressen i dag. Försök igen i morgon."
CONFIRM_NO_INTERESTS = "Välj minst ett intresse"
CONFIRM_UNAVAILABLE = "Vi kunde inte spara just nu. Försök igen om en stund."

# ---------- Verifiering av e-post (routes/user.py) ----------
EMAIL_NOT_VERIFIED = "Bekräfta din e-postadress först. Länken finns i mejlet vi skickade."
EMAIL_MISSING = "Lägg till en e-postadress först"
EMAIL_ALREADY_VERIFIED = "E-postadressen är redan bekräftad"
EMAIL_LINK_INVALID = "Länken är ogiltig eller har gått ut. Skicka en ny från din profil."
EMAIL_TOO_MANY_REQUESTS = "Vi har nyss skickat ett mejl. Vänta en stund innan du skickar ett nytt"
EMAIL_SEND_FAILED = "Vi kunde inte skicka mejlet just nu. Försök igen om en stund"

# ---------- Lösenord via e-post (routes/user.py, schemas/user.py) ----------
PASSWORD_TOO_LONG = "Lösenordet får max vara 72 tecken"
PASSWORD_LINK_INVALID = "Länken är ogiltig eller har gått ut. Be om en ny."
PASSWORD_CHANGE_NEEDS_EMAIL = "Lägg till en e-postadress först, så att vi kan bekräfta bytet"

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


def too_small(minimum) -> str:
    return f"Får inte vara lägre än {minimum}"


def too_large(maximum) -> str:
    return f"Får inte vara högre än {maximum}"


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
    if kind == "greater_than_equal" and "ge" in ctx:
        return too_small(ctx["ge"])
    if kind == "less_than_equal" and "le" in ctx:
        return too_large(ctx["le"])
    return _STANDARD_ERRORS.get(kind, error["msg"])


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = [{**error, "msg": swedish_message(error)} for error in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(errors)})
