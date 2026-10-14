from pydantic import BaseModel


class GeocodeResult(BaseModel):
    """En träff i adressökningen (GET /geocode): ett kort namn och var på kartan (WGS84, grader)."""

    label: str
    latitude: float
    longitude: float
