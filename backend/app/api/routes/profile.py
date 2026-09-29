from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

# from app.auth.security import get_current_user  # TODO: använd när E/F:s auth är klar
from app.crud.profile import calculate_age, get_profile, update_profile
from app.db.session import get_db
from app.schemas.profile import ProfileResponse, ProfileUpdate

router = APIRouter(prefix="/profile", tags=["profile"])


# TEMPORÄR mock tills E/F:s inloggning finns. Alla anrop blir user 1.
# Ta bort den här funktionen och avkommentera importen ovan innan merge.
def get_current_user():
    class FakeUser:
        id = 1

    return FakeUser()


def _to_response(profile) -> ProfileResponse:
    return ProfileResponse(
        name=profile.name,
        birth_date=profile.birth_date,
        age=calculate_age(profile.birth_date) if profile.birth_date else None,
        gender=profile.gender,
    )


@router.get("/", response_model=ProfileResponse)
def read_profile(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_profile(db, current_user.id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Ingen profil hittad")
    return _to_response(profile)


@router.patch("/", response_model=ProfileResponse)
def edit_profile(
    data: ProfileUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = update_profile(db, current_user.id, data)
    return _to_response(profile)
