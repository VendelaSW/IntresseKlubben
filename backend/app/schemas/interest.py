from pydantic import BaseModel, ConfigDict


class InterestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class InterestBrowseItem(BaseModel):
    """Ett intresse när man söker eller utforskar biblioteket.

    path är namnen ovanför intresset i trädet, uppifrån (t.ex. ["Sport och
    träning"] för Löpning), så att en sökträff visar var den hör hemma.
    has_children säger om det går att klicka sig vidare ner."""

    id: int
    name: str
    path: list[str]
    has_children: bool
