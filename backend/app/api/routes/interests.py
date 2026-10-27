"""
Intressen: biblioteket (söka och utforska) och ens egna intressen.

GET /interests/ - alla aktiva intressen, platt (för filter och formulär).
GET /interests/top - huvudområdena, för "Utforska" på intressesidan.
GET /interests/{id}/children - underintressena till ett intresse.
GET /interests/search?q= - intressen vars namn eller alias innehåller texten,
  bästa träffarna först, var och en med var den hör hemma (path).
  Utforska, underintressen och sökningen visar bibliotekets intressen, ens egna, och andras egna intressen först när minst
  tre användare har dem (se crud/interest.py). De som är dolda hittas ändå på betydelse med /interests/similar.
GET /interests/{id}/people?municipality_code=&limit=&offset= - hur många och vilka som har intresset eller något underintresse, med
  antal för hela landet och den valda kommunen på intresset, på dess överintressen och ett steg ner, och en sida personer.
GET /interests/similar?q= - "Menade du": högst tre intressen som liknar texten, för när sökningen inte gav någon träff.
  Först de som liknar i stavning (felstavningar och skrivsätt, i kod: services/interest_spelling.py), sedan de med liknande
  betydelse (ett embedding-anrop). Tom lista om inget liknar.

GET /profile/interests, PUT/DELETE /profile/interests/{id} - ens egna intressen.
Bara aktiva intressen går att lägga till; ett inaktivt som man redan har går
att ta bort.
"""

import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.people import to_person_response
from app.auth.security import get_current_user, require_profile
from app.core import error_messages as msg
from app.crud.contact import blocked_user_ids
from app.crud.interest import (
    add_user_interest,
    get_active_interest,
    get_interest,
    get_visible_interest,
    get_user,
    ids_with_children,
    interest_path,
    list_child_interests,
    list_interests,
    list_top_interests,
    load_library_index,
    remove_user_interest,
    search_interests,
    sorted_interests,
)
from app.crud.interest_people import load_tree
from app.crud.moderation import suspended_user_ids
from app.crud.profile import count_people_by_node, list_people
from app.db.session import get_db
from app.models.interest import Interest
from app.models.municipality import Municipality
from app.schemas.interest import InterestBrowseItem, InterestResponse, ProfileInterest, SimilarItem
from app.schemas.interest_people import InterestCount, InterestCountChild, InterestCountSelf, InterestPeopleResponse, MunicipalityRef
from app.services.interest_embeddings import similar_interests
from app.services.interest_spelling import spelling_matches

router = APIRouter(tags=["interests"])

# "Menade du" kostar ett embedding-anrop, så högst så här många per användare under så här många sekunder. Gränsen är
# i minnet per serverinstans, en spärr och inget mer.
SIMILAR_RATE_LIMIT = 20
SIMILAR_RATE_WINDOW_SECONDS = 60
SIMILAR_MAX = 3
MIN_SIMILAR_LENGTH = 3

_recent_similar: dict[int, deque[float]] = defaultdict(deque)


def _check_similar_rate_limit(user_id: int) -> None:
    now = time.monotonic()
    calls = _recent_similar[user_id]
    while calls and now - calls[0] > SIMILAR_RATE_WINDOW_SECONDS:
        calls.popleft()
    if len(calls) >= SIMILAR_RATE_LIMIT:
        raise HTTPException(status_code=429, detail=msg.INTERVIEW_TOO_MANY_REQUESTS)
    calls.append(now)


def _current_db_user(current_user, db: Session):
    user = get_user(db, current_user.id)
    if user is None:
        raise HTTPException(status_code=404, detail="Användaren finns inte")
    return user


def _interest_or_404(db: Session, interest_id: int):
    interest = get_interest(db, interest_id)
    if interest is None:
        raise HTTPException(status_code=404, detail="Intresset finns inte")
    return interest


def _browse_items(db: Session, interests: list[Interest]) -> list[InterestBrowseItem]:
    with_children = ids_with_children(db, interests)
    return [
        InterestBrowseItem(id=i.id, name=i.name, path=interest_path(i), has_children=i.id in with_children)
        for i in interests
    ]


@router.get("/interests/", response_model=list[InterestResponse])
def read_interests(db: Session = Depends(get_db)):
    return list_interests(db)


@router.get("/interests/top", response_model=list[InterestBrowseItem])
def read_top_interests(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return _browse_items(db, list_top_interests(db, current_user.id))


@router.get("/interests/search", response_model=list[InterestBrowseItem])
def search(
    q: str = Query(min_length=1, max_length=100),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _browse_items(db, search_interests(db, q, current_user.id))


@router.get("/interests/similar", response_model=list[SimilarItem])
def similar(
    q: str = Query(min_length=MIN_SIMILAR_LENGTH, max_length=100),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    text = " ".join(q.split())
    if len(text) < MIN_SIMILAR_LENGTH:
        return []
    _check_similar_rate_limit(current_user.id)
    # Stavning först (billigt, ingen OpenAI), betydelsen fyller på. Räcker stavningen hoppas embedding-anropet över.
    spelled = spelling_matches(text, load_library_index(db))
    ids = list(spelled)
    if len(ids) < SIMILAR_MAX:
        ids += [i.id for i, _ in similar_interests(db, text) if i.id not in ids]
    by_id = {i.id: i for i in db.query(Interest).filter(Interest.id.in_(ids)).all()}
    items = _browse_items(db, [by_id[i] for i in ids if i in by_id])
    # Ett tomt huvudområde (utan underintressen) är ingen sak att föreslå.
    shown = [item for item in items if item.path or item.has_children][:SIMILAR_MAX]
    return [SimilarItem(**item.model_dump(), spelling=item.id in spelled) for item in shown]


@router.get("/interests/{interest_id}/children", response_model=list[InterestBrowseItem])
def read_child_interests(
    interest_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    interest = get_active_interest(db, interest_id)
    if interest is None:
        raise HTTPException(status_code=404, detail="Intresset finns inte")
    return _browse_items(db, list_child_interests(db, interest, current_user.id))


@router.get(
    "/interests/{interest_id}/people",
    response_model=InterestPeopleResponse,
    dependencies=[Depends(require_profile)],
)
def read_interest_people(
    interest_id: int,
    municipality_code: str | None = Query(None, min_length=4, max_length=4),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    interest = get_visible_interest(db, interest_id, current_user.id)
    if interest is None:
        raise HTTPException(status_code=404, detail="Intresset finns inte")
    municipality = None
    if municipality_code is not None:
        municipality = db.get(Municipality, municipality_code)
        if municipality is None:
            raise HTTPException(status_code=422, detail=msg.UNKNOWN_MUNICIPALITY)

    # Samma regler som Personer, utom borttagna förslag som inte döljs här: blockerade åt båda håll och avstängda är borta,
    # och du själv räknas inte (se crud/profile.py, _people_query).
    hidden = blocked_user_ids(db, current_user.id) | suspended_user_ids(db)
    tree = load_tree(db)

    ancestors = [db.get(Interest, ancestor_id) for ancestor_id in tree.ancestors(interest.id)]
    children = list_child_interests(db, interest, current_user.id)
    with_children = ids_with_children(db, children)
    # Alla nivåer räknas i en enda fråga (se count_people_by_node), och listan i en till.
    nodes = {n.id: tree.subtree(n.id) for n in [interest, *ancestors, *children]}
    totals = count_people_by_node(db, current_user.id, nodes, municipality_code, hidden)

    def counts(node_id: int) -> dict:
        country, in_municipality = totals[node_id]
        return {"country": country, "municipality": in_municipality}

    people = list_people(
        db, current_user.id, municipality_code=municipality_code, exclude_user_ids=hidden,
        interest_ids=tree.subtree(interest.id), limit=limit, offset=offset,
    )
    return InterestPeopleResponse(
        interest=InterestCountSelf(id=interest.id, name=interest.name, path=interest_path(interest), **counts(interest.id)),
        municipality=MunicipalityRef(code=municipality.code, name=municipality.name) if municipality else None,
        ancestors=[InterestCount(id=a.id, name=a.name, **counts(a.id)) for a in ancestors],
        children=[InterestCountChild(id=c.id, name=c.name, has_children=c.id in with_children, **counts(c.id)) for c in children],
        people=[to_person_response(p.user, current_user) for p in people],
    )


@router.get("/profile/interests", response_model=list[ProfileInterest])
def read_my_interests(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return sorted_interests(_current_db_user(current_user, db))


# PUT eftersom det går att upprepa: redan tillagt intresse ger samma svar.
@router.put("/profile/interests/{interest_id}", response_model=list[ProfileInterest])
def add_my_interest(
    interest_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _current_db_user(current_user, db)
    # Bara intressen som går att välja; ett inaktivt eller väntande svarar som
    # ett som inte finns.
    interest = get_active_interest(db, interest_id)
    if interest is None:
        raise HTTPException(status_code=404, detail="Intresset finns inte")
    return add_user_interest(db, user, interest)


@router.delete("/profile/interests/{interest_id}", response_model=list[ProfileInterest])
def remove_my_interest(
    interest_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _current_db_user(current_user, db)
    interest = _interest_or_404(db, interest_id)
    # Ett intresse krävs alltid, så det sista går inte att ta bort. Att byta
    # ut det görs genom att först lägga till det nya, sen ta bort det gamla.
    # Räknat i olika intressen: samma intresse med två aktiviteter är ett.
    if {i.id for i in user.interests} == {interest.id}:
        raise HTTPException(status_code=409, detail=msg.LAST_INTEREST_CANNOT_BE_REMOVED)
    return remove_user_interest(db, user, interest)
