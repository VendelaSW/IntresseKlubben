from pydantic import BaseModel, ConfigDict


class InterestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class ProfileInterest(InterestResponse):
    """Ett intresse på en profil (den egna, andras och personkorten).

    parent_id är intresset ovanför i trädet, så att frontend kan rita ett
    intresse under sin förälder när personen har valt båda (Mynt under
    Historia). path är namnen ovanför, uppifrån (se crud/interest.py,
    InterestPlace), så att frontend kan samla flera intressen under sin
    kategori. area och area_slug är huvudområdet, som taggens färg följer
    (färgen slås upp på sluggen, så att den håller när området byter namn).
    Bara för visning: hur intressen sparas och filtreras ändras inte."""

    parent_id: int | None
    path: list[str]
    area: str
    area_slug: str | None


class InterestBrowseItem(BaseModel):
    """Ett intresse när man söker eller utforskar biblioteket.

    path är namnen ovanför intresset i trädet, uppifrån (t.ex. ["Sport och
    träning"] för Löpning), så att en sökträff visar var den hör hemma.
    area_slug är huvudområdets slug, som taggens färg följer. has_children
    säger om det går att klicka sig vidare ner."""

    id: int
    name: str
    path: list[str]
    area_slug: str | None
    has_children: bool


class SimilarItem(InterestBrowseItem):
    """Ett förslag i "Menade du" (GET /interests/similar). spelling säger att det liknar i stavning (felstavning eller annat
    skrivsätt) och inte bara i betydelse: då är det troligen intresset man menade."""

    spelling: bool = False
