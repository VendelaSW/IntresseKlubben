"""GET /groups/overview: klubbsidans tre listor i ett anrop, likadana som de tre separata."""

import pytest

from app.models.group import Group, GroupInvitation, GroupMember, GroupRole, GroupVisibility
from app.models.interest import Interest
from app.models.user import User


@pytest.fixture
def clubs(db, user, municipalities):
    other = User(id=2, username="annan", password_hash="unused")
    interest = Interest(name="Schack", slug="schack")
    db.add_all([other, interest])
    db.flush()

    def club(name, owner_id):
        group = Group(name=name, description="En klubb", interest_id=interest.id, municipality_code="1480",
                      visibility=GroupVisibility.public, created_by=owner_id)
        db.add(group)
        db.flush()
        db.add(GroupMember(group_id=group.id, user_id=owner_id, role=GroupRole.owner))
        return group

    club("Min klubb", 1)
    invited = club("Inbjuden", 2)
    club("Annans", 2)
    db.add(GroupInvitation(group_id=invited.id, user_id=1, invited_by=2))
    db.commit()


def test_overview_has_the_same_three_lists_as_the_separate_endpoints(client, clubs):
    response = client.get("/groups/overview")
    assert response.status_code == 200
    overview = response.json()
    assert overview["mine"] == client.get("/groups/mine").json()
    assert overview["suggested"] == client.get("/groups/suggested").json()
    assert overview["invitations"] == client.get("/groups/invitations").json()
    assert [g["name"] for g in overview["mine"]] == ["Min klubb"]
    assert [g["name"] for g in overview["invitations"]] == ["Inbjuden"]


def test_overview_is_not_taken_for_a_club_id(client, user):
    # /groups/{group_id} ligger efter, så "overview" ska aldrig tolkas som ett id.
    assert client.get("/groups/overview").status_code == 200


def test_overview_needs_a_finished_profile(client, user, profile_lock):
    assert client.get("/groups/overview").status_code == 403
