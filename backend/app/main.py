from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.models  # noqa: F401 — laddar alla modeller innan något frågar databasen
from app.api.routes.health import router as health_router
from app.api.routes.municipalities import router as municipalities_router
from app.api.routes.profile import router as profile_router
from app.api.routes.user import router as user_router
from app.core.config import settings

app = FastAPI(title="Intresseklubben API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(profile_router)
app.include_router(user_router)
app.include_router(municipalities_router)
