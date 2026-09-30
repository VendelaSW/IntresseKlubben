"""Generella kontroller som skyddar hela appen, oavsett vilken funktion som ändras.

De här testerna behöver ingen underhålla per funktion. De fångar fel som
annars bara syns när något redan är ute på dev-previewn.
"""

import importlib
import os
import pkgutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import APIRouter

import app.api.routes as routes_package
from app.main import app

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _registered_routes():
    # Nyare FastAPI listar inkopplade routrar som grupper i app.routes, så
    # vi läser appens fullständiga endpoint-lista (samma som /docs visar).
    return {
        (path, method.upper())
        for path, operations in app.openapi()["paths"].items()
        for method in operations
    }


def test_every_router_is_registered_in_main():
    """Varje router i app/api/routes/ måste vara inkopplad i main.py.

    Fångar t.ex. en merge-konflikt som råkar ta bort app.include_router(...)
    för en befintlig funktion: då svarar dess endpoints plötsligt 404.
    """
    registered = _registered_routes()
    missing = []
    for module_info in pkgutil.iter_modules(routes_package.__path__):
        module = importlib.import_module(f"{routes_package.__name__}.{module_info.name}")
        router = getattr(module, "router", None)
        if not isinstance(router, APIRouter):
            continue
        for route in router.routes:
            if not getattr(route, "include_in_schema", True):
                continue
            for method in route.methods:
                if (route.path, method) not in registered:
                    missing.append(f"{method} {route.path} (app/api/routes/{module_info.name}.py)")
    assert not missing, "Routes som finns men inte är inkopplade i main.py:\n" + "\n".join(missing)


def test_migrations_form_a_single_chain():
    """Migrationerna måste bilda en enda kedja (exakt ett "head").

    Två migrationer som bygger på samma föregångare delar historiken, och då
    vägrar `alembic upgrade head` köra. Rätta genom att sätta down_revision i
    den nya migrationen till den senaste befintliga.
    """
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    heads = ScriptDirectory.from_config(config).get_heads()
    assert len(heads) == 1, f"Migrationshistoriken har {len(heads)} ändar: {heads}"


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.xfail(
    strict=True,
    reason=(
        "Känt fel: app/db/session.py skapar databasmotorn direkt vid import, så "
        "appen kraschar vid start om DATABASE_URL saknas (t.ex. en miljövariabel "
        "som glömts i Vercel). Ta bort den här markeringen när det är rättat."
    ),
)
def test_app_starts_without_database_url():
    """Appen ska kunna starta även om DATABASE_URL saknas.

    Då ska bara databasanropen misslyckas, inte hela appen (inklusive /health).
    """
    env = {k: v for k, v in os.environ.items() if k != "DATABASE_URL"}
    env["PYTHONPATH"] = str(BACKEND_DIR)
    # Körs från en tom mapp så att backend/.env inte läses in.
    with tempfile.TemporaryDirectory() as empty_dir:
        result = subprocess.run(
            [sys.executable, "-c", "import app.main"],
            cwd=empty_dir, env=env, capture_output=True, text=True,
        )
    assert result.returncode == 0, result.stderr[-500:]
