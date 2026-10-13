from pydantic import BaseModel, Field, field_validator

from app.core import error_messages as msg

# Så mycket text analyseras som mest (profiltexten är max 800 tecken).
MAX_TEXT_LENGTH = 1000


class AnalyzeRequest(BaseModel):
    text: str = Field(max_length=MAX_TEXT_LENGTH)

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError(msg.INTERVIEW_TEXT_EMPTY)
        return value


class InterestRef(BaseModel):
    # Intresset ett förslag pekar på. id är None för ett nytt intresse. path är namnen ovanför i trädet, uppifrån.
    # parent_key är nyckeln på förslaget ett nytt intresse ska ligga under, när det är en sub under ett annat nytt
    # förslag i samma analys (Fyrmodeller under det nya Modellbygge), annars None.
    id: int | None
    name: str
    path: list[str]
    is_new: bool
    parent_key: str | None


class Proposal(BaseModel):
    key: str
    # Användarens egna ord om intresset, när de finns (annars None).
    label: str | None
    interest: InterestRef
    # Hur man håller på med det ("spela"), bara när texten sa det, annars "".
    activity: str


class FollowUpOption(BaseModel):
    value: str
    label: str
    kind: str  # interest, activity eller general


class FollowUpOut(BaseModel):
    key: str
    type: str  # narrow, activity eller specify
    question: str
    multiple: bool
    applies_to: list[str]
    options: list[FollowUpOption]


class AnalyzeResponse(BaseModel):
    # Sigillet: en signerad token som täcker exakt de här förslagen, och som krävs för att spara dem.
    token: str
    proposals: list[Proposal]
    followups: list[FollowUpOut]
