"""
Adressökning: gör om en adress eller ett platsnamn till en position på kartan, med Nominatim
(OpenStreetMap, samma data som kartan). Används när man sätter ut var ett event eller en klubb är
(GET /geocode, se api/routes/geocode.py). Positionen kan sedan justeras för hand på kartan.

Resten av backenden pratar bara med gränssnittet Geocoder (get_geocoder), aldrig med Nominatim
direkt, så att testerna kan byta ut den mot en fejkad version (set_geocoder). Anropen görs med
urllib, så att backend inte får ett nytt beroende.

Nominatims regler (https://operations.osmfoundation.org/policies/nominatim/): högst ett anrop per
sekund, och appen ska presentera sig i User-Agent. Därför väntar varje anrop tills det har gått en
sekund sedan det förra, och samma sökning svaras ur ett minne i stället för att frågas igen. Både
spärren och minnet gäller per serverinstans. Bara söktexten skickas, aldrig vem som söker.
"""

import http.client
import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import OrderedDict
from dataclasses import dataclass
from typing import Protocol

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "IntresseKlubben/1.0 (+https://intresse-klubben.vercel.app)"
TIMEOUT_SECONDS = 8
MAX_RESULTS = 5
MIN_INTERVAL_SECONDS = 1.0  # Nominatim: högst ett anrop per sekund
CACHE_SIZE = 500


class GeocodingFailed(Exception):
    """Sökningen gick inte att göra, eller svaret gick inte att använda."""


@dataclass(frozen=True)
class Place:
    label: str
    latitude: float
    longitude: float


class Geocoder(Protocol):
    def search(self, query: str) -> list[Place]: ...


def _short_label(display_name: str) -> str:
    """Nominatims namn är långa ("2, Odelbergs väg, Charlottendal, Gustavsberg, Värmdö kommun,
    ..., Sverige"). Gatunumret står först, så det flyttas efter gatan som i en vanlig adress
    ("Odelbergs väg 2"), och sedan räcker de tre första delarna för att känna igen platsen."""
    parts = [part.strip() for part in display_name.split(",") if part.strip()]
    if len(parts) > 1 and parts[0][:1].isdigit() and len(parts[0]) <= 6:
        parts = [f"{parts[1]} {parts[0]}", *parts[2:]]
    return ", ".join(parts[:3])


class NominatimGeocoder:
    def __init__(self):
        self._lock = threading.Lock()
        self._last_call = 0.0
        self._cache: OrderedDict[str, list[Place]] = OrderedDict()

    def _get(self, query: str) -> list:
        params = urllib.parse.urlencode(
            {
                "q": query,
                "format": "jsonv2",
                "countrycodes": "se",
                "limit": MAX_RESULTS,
                "accept-language": "sv",
            }
        )
        request = urllib.request.Request(f"{NOMINATIM_URL}?{params}", headers={"User-Agent": USER_AGENT})
        # Högst ett anrop per sekund: vänta in resten av sekunden sedan förra anropet.
        with self._lock:
            wait = self._last_call + MIN_INTERVAL_SECONDS - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self._last_call = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                return json.load(response)
        # OSError täcker URLError, tidsgränsen och brutna anslutningar, och
        # HTTPException svar som inte går att läsa (t.ex. en anslutning som
        # stängs mitt i svaret). Allt blir 503, inte 500.
        except (OSError, http.client.HTTPException, ValueError) as err:
            raise GeocodingFailed(type(err).__name__) from None

    def search(self, query: str) -> list[Place]:
        key = " ".join(query.lower().split())
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        results = self._get(query)
        if not isinstance(results, list):
            raise GeocodingFailed("Oväntat svar")
        places = []
        for result in results:
            try:
                places.append(
                    Place(_short_label(result["display_name"]), float(result["lat"]), float(result["lon"]))
                )
            except (KeyError, TypeError, ValueError):
                continue
        self._cache[key] = places
        if len(self._cache) > CACHE_SIZE:
            self._cache.popitem(last=False)
        return places


# En instans per server, så att spärren och minnet delas mellan anropen.
_nominatim = NominatimGeocoder()
# En fejkad version som testerna sätter in (set_geocoder). Är den satt används den i stället.
_override: Geocoder | None = None


def set_geocoder(geocoder: Geocoder | None = None) -> None:
    """Byter ut adressökningen (bara för tester). Utan argument återställs den."""
    global _override
    _override = geocoder


def get_geocoder() -> Geocoder:
    return _override if _override is not None else _nominatim
