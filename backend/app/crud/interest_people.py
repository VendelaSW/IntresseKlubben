"""
Intressets träd för att räkna och lista personer (GET /interests/{id}/people): vilka intressen som ligger under ett
intresse och vilka som ligger över. Räkningen av personer görs i crud/profile.py (count_people_by_node, list_people), med samma
filter som Personer.

Trädet hämtas i en fråga (id och förälder för alla aktiva intressen, några hundra rader) och byggs i minnet, eftersom det
högst har tre nivåer och behövs åt båda håll.
"""

from sqlalchemy.orm import Session

from app.models.interest import Interest, InterestStatus


class InterestTree:
    """Alla aktiva intressen som id -> förälder, med uppslag på underintressen (hela grenen) och överintressen."""

    def __init__(self, parents: dict[int, int | None]):
        self.parents = parents
        self.children: dict[int | None, list[int]] = {}
        for interest_id, parent_id in parents.items():
            self.children.setdefault(parent_id, []).append(interest_id)

    def subtree(self, interest_id: int) -> set[int]:
        """Intresset och alla underintressen under det, på alla nivåer."""
        found, stack = {interest_id}, [interest_id]
        while stack:
            for child in self.children.get(stack.pop(), []):
                if child not in found:
                    found.add(child)
                    stack.append(child)
        return found

    def ancestors(self, interest_id: int) -> list[int]:
        """Överintressena, huvudområdet först och närmaste föräldern sist."""
        chain: list[int] = []
        parent = self.parents.get(interest_id)
        while parent is not None and parent not in chain:
            chain.append(parent)
            parent = self.parents.get(parent)
        return list(reversed(chain))


def load_tree(db: Session) -> InterestTree:
    rows = db.query(Interest.id, Interest.parent_id).filter(Interest.status == InterestStatus.active.value).all()
    active = {interest_id for interest_id, _ in rows}
    # Ett intresse vars förälder är inaktiv räknas som ett huvudområde, som i load_library_index.
    return InterestTree({interest_id: parent_id if parent_id in active else None for interest_id, parent_id in rows})
