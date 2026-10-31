from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import app.models  # noqa: F401 — laddar alla modeller innan något frågar databasen
from app.api.routes.badges import router as badges_router
from app.api.routes.contacts import router as contacts_router
from app.api.routes.events import router as events_router
from app.api.routes.geocode import router as geocode_router
from app.api.routes.groups import router as groups_router
from app.api.routes.health import router as health_router
from app.api.routes.interest_analysis import router as interest_analysis_router
from app.api.routes.interest_confirm import router as interest_confirm_router
from app.api.routes.interests import router as interests_router
from app.api.routes.interview import router as interview_router
from app.api.routes.matches import router as matches_router
from app.api.routes.messages import router as messages_router
from app.api.routes.moderation import router as moderation_router
from app.api.routes.municipalities import router as municipalities_router
from app.api.routes.notifications import router as notifications_router
from app.api.routes.profile import router as profile_router
from app.api.routes.reports import router as reports_router
from app.api.routes.user import router as user_router
from app.core.config import settings
from app.core.error_messages import validation_error_handler
from app.services.text_moderation import ToxicContentError, WordFilterError

app = FastAPI(title="Intresseklubben API")


@app.exception_handler(WordFilterError)
async def word_filter_handler(request: Request, error: WordFilterError):
    return JSONResponse(status_code=422, content={"detail": [{
        "type": "value_error", "loc": ["body", error.field], "msg": f"Value error, {error.detail}",
    }]})


@app.exception_handler(ToxicContentError)
async def toxic_content_handler(request: Request, error: ToxicContentError):
    return JSONResponse(status_code=422, content={"detail": "Innehållet innehåller otillåtet språk."})


# Svenska texter på valideringsfel, för alla endpoints.
app.add_exception_handler(RequestValidationError, validation_error_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(profile_router)
app.include_router(interview_router)
app.include_router(interests_router)
app.include_router(interest_analysis_router)
app.include_router(interest_confirm_router)
app.include_router(user_router)
app.include_router(matches_router)
app.include_router(municipalities_router)
app.include_router(contacts_router)
app.include_router(groups_router)
app.include_router(messages_router)
app.include_router(badges_router)
app.include_router(events_router)
app.include_router(geocode_router)
app.include_router(reports_router)
app.include_router(moderation_router)
app.include_router(notifications_router)

# Testläget (se app/devtools): bara när DEV_MODE är satt, vilket bara `python -m app.devtools.server` gör.
# assert_safe stoppar starten om det skulle vara påslaget mot en riktig databas eller på Vercel.
if settings.dev_mode:
    from app.devtools import assert_safe
    from app.devtools.routes import router as devtools_router

    assert_safe()
    app.include_router(devtools_router)
