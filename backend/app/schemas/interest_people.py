from pydantic import BaseModel

from app.schemas.profile import PersonResponse


class InterestCount(BaseModel):
    """Ett intresse med hur många andra personer som har det eller något underintresse. country är hela landet, municipality
    den valda kommunen (null om ingen kommun är vald)."""

    id: int
    name: str
    country: int
    municipality: int | None


class InterestCountChild(InterestCount):
    has_children: bool


class InterestCountSelf(InterestCount):
    path: list[str]


class MunicipalityRef(BaseModel):
    code: str
    name: str


class InterestPeopleResponse(BaseModel):
    """Svaret på GET /interests/{id}/people: intresset, kedjan över det, ett steg under det, och personerna."""

    interest: InterestCountSelf
    municipality: MunicipalityRef | None
    ancestors: list[InterestCount]
    children: list[InterestCountChild]
    people: list[PersonResponse]
