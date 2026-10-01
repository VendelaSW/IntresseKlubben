import os
import unittest

os.environ["DATABASE_URL"] = "sqlite://"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth.security import get_current_user
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import interest
from app.models.contact import Contact
from app.models.user import User


class ContactRoutesTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                                    poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.db.add_all([
            User(id=user_id, username=f"user{user_id}", password_hash="unused")
            for user_id in (1, 2, 3)
        ])
        self.db.commit()
        self.actor_id = 1
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: User(id=self.actor_id)
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def test_request_accept_and_remove_only_by_participants(self):
        created = self.client.post("/contacts/request", json={"addressee_id": 2})
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["status"], "PENDING")
        contact_id = created.json()["id"]

        self.actor_id = 3
        self.assertEqual(self.client.patch(f"/contacts/requests/{contact_id}",
                                            json={"action": "accept"}).status_code, 403)
        self.actor_id = 2
        accepted = self.client.patch(f"/contacts/requests/{contact_id}",
                                     json={"action": "accept"})
        self.assertEqual(accepted.json()["status"], "ACCEPTED")

        self.actor_id = 3
        self.assertEqual(self.client.delete(f"/contacts/{contact_id}").status_code, 403)
        self.actor_id = 1
        self.assertEqual(self.client.delete(f"/contacts/{contact_id}").status_code, 204)
        self.assertIsNone(self.db.get(Contact, contact_id))

    def test_reject_removes_pending_request(self):
        contact_id = self.client.post("/contacts/request", json={"addressee_id": 2}).json()["id"]
        self.actor_id = 2
        rejected = self.client.patch(f"/contacts/requests/{contact_id}",
                                     json={"action": "reject"})
        self.assertEqual(rejected.status_code, 200)
        self.assertIsNone(rejected.json())
        self.assertIsNone(self.db.get(Contact, contact_id))

    def test_request_rejects_self_missing_user_and_duplicate_in_both_directions(self):
        self.assertEqual(self.client.post("/contacts/request", json={"addressee_id": 1}).status_code, 400)
        self.assertEqual(self.client.post("/contacts/request", json={"addressee_id": 99}).status_code, 404)
        self.assertEqual(self.client.post("/contacts/request", json={"addressee_id": 2}).status_code, 201)
        self.actor_id = 2
        self.assertEqual(self.client.post("/contacts/request", json={"addressee_id": 1}).status_code, 409)

    def test_block_replaces_request_and_only_blocker_can_unblock(self):
        self.actor_id = 2
        contact_id = self.client.post("/contacts/request", json={"addressee_id": 1}).json()["id"]
        self.actor_id = 1
        blocked = self.client.post("/users/2/block")
        self.assertEqual(blocked.status_code, 200)
        self.assertEqual(blocked.json()["id"], contact_id)
        self.assertEqual(blocked.json()["requester_id"], 1)
        self.assertEqual(blocked.json()["status"], "BLOCKED")

        self.actor_id = 2
        self.assertEqual(self.client.post("/contacts/request", json={"addressee_id": 1}).status_code, 409)
        self.assertEqual(self.client.post("/users/1/block").status_code, 409)
        self.assertEqual(self.client.delete("/users/1/block").status_code, 404)
        self.actor_id = 1
        self.assertEqual(self.client.delete("/users/2/block").status_code, 204)
        self.actor_id = 2
        self.assertEqual(self.client.post("/contacts/request", json={"addressee_id": 1}).status_code, 201)

    def test_block_replaces_accepted_contact(self):
        contact_id = self.client.post("/contacts/request", json={"addressee_id": 2}).json()["id"]
        self.actor_id = 2
        self.client.patch(f"/contacts/requests/{contact_id}", json={"action": "accept"})
        self.assertEqual(self.client.post("/users/2/block").status_code, 400)
        self.actor_id = 1
        blocked = self.client.post("/users/2/block")
        self.assertEqual(blocked.json()["id"], contact_id)
        self.assertEqual(blocked.json()["status"], "BLOCKED")
        self.assertEqual(self.client.delete(f"/contacts/{contact_id}").status_code, 404)

    def test_list_contacts_splits_accepted_incoming_and_outgoing(self):
        self.db.add_all([User(id=user_id, username=f"user{user_id}", password_hash="unused")
                         for user_id in (4, 5)])
        self.db.commit()
        outgoing_id = self.client.post("/contacts/request", json={"addressee_id": 2}).json()["id"]
        accepted_id = self.client.post("/contacts/request", json={"addressee_id": 4}).json()["id"]
        self.actor_id = 4
        self.client.patch(f"/contacts/requests/{accepted_id}", json={"action": "accept"})
        self.actor_id = 3
        incoming_id = self.client.post("/contacts/request", json={"addressee_id": 1}).json()["id"]
        self.actor_id = 5
        self.assertEqual(self.client.post("/users/1/block").status_code, 200)
        self.actor_id = 2
        self.client.post("/contacts/request", json={"addressee_id": 3})

        self.actor_id = 1
        listed = self.client.get("/contacts")
        self.assertEqual(listed.status_code, 200)
        body = listed.json()
        self.assertEqual([c["id"] for c in body["contacts"]], [accepted_id])
        self.assertEqual([c["id"] for c in body["incoming_requests"]], [incoming_id])
        self.assertEqual([c["id"] for c in body["outgoing_requests"]], [outgoing_id])

        self.actor_id = 5
        self.assertEqual(self.client.get("/contacts").json(),
                         {"contacts": [], "incoming_requests": [], "outgoing_requests": []})


if __name__ == "__main__":
    unittest.main()