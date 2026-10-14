"""Var på kartan ett event eller en klubb är: latitud och longitud (WGS84,
grader), som sätts tillsammans eller inte alls. Platsen måste ligga i Sverige,
eftersom appen och kartan bara gäller Sverige.

Utan position visas eventet eller klubben mitt i sin kommun på kartan.
"""

from app.core import error_messages as msg

# En ruta runt Sverige, med lite marginal (Smygehuk 55,3° N, Treriksröset
# 69,1° N, Koster 10,9° E, Haparanda 24,2° E).
MIN_LATITUDE, MAX_LATITUDE = 55.0, 69.5
MIN_LONGITUDE, MAX_LONGITUDE = 10.5, 24.5


def check_position(latitude: float | None, longitude: float | None) -> None:
    """Kastar ValueError om bara den ena är satt, eller om platsen ligger
    utanför Sverige. Båda tomma är okej (ingen position)."""
    if latitude is None and longitude is None:
        return
    if latitude is None or longitude is None:
        raise ValueError(msg.POSITION_INCOMPLETE)
    if not (MIN_LATITUDE <= latitude <= MAX_LATITUDE and MIN_LONGITUDE <= longitude <= MAX_LONGITUDE):
        raise ValueError(msg.POSITION_OUTSIDE_SWEDEN)
