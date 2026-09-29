from pydantic import BaseModel, ConfigDict


class MunicipalityResponse(BaseModel):
    code: str
    name: str

    model_config = ConfigDict(from_attributes=True)
