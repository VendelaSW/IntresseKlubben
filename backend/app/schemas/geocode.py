from pydantic import BaseModel


class GeocodeResult(BaseModel):
    """En träff i adressökningen (GET /geocode): ett kort namn och var på kartan (WGS84, grader)."""

    label: str
    latitude: float
    longitude: float


class ReverseGeocodeResult(BaseModel):
    """Den närmaste gatuadressen där nålen står (GET /geocode/reverse), t.ex. "Storgatan 1", eller
    None när det inte finns någon i närheten."""

    address: str | None
