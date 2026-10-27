"""Matchningens poäng (services/matching.py): rena funktioner med påhittade vektorer, ingen databas och ingen AI."""

from dataclasses import replace

import pytest

from app.services.matching import (
    DEFAULT_CONFIG,
    MIN_INTERESTS,
    MIN_TEXT_CHARS,
    Person,
    expand,
    near_interests,
    readiness,
    score,
    tree_overlap,
)

# Ett litet träd: Friluftsliv (1) > Klättring (2) > Bouldering (3), Sportklättring (4); Friluftsliv > Vandring (5);
# Musik (10) > Jazz (11); Brädspel (13) står för sig.
PARENTS = {1: None, 2: 1, 3: 2, 4: 2, 5: 1, 10: None, 11: 10, 13: None}

VECTORS = {
    3: [1.0, 0.0, 0.0],
    4: [1.0, 0.05, 0.0],
    5: [0.9, 0.1, 0.0],
    10: [0.0, 1.0, 0.0],
    11: [0.0, 0.95, 0.3],
    13: [0.0, 0.0, 1.0],
}

CLIMBING = [1.0, 0.0, 0.0]
MUSIC = [0.0, 1.0, 0.0]

# Ingen dämpning för lite data, så att viktningen går att räkna för hand.
NEUTRAL = replace(DEFAULT_CONFIG, reliable_interests=1, reliable_chars=1)


def person(person_id, interests, chars=600, vector=CLIMBING):
    return Person(id=person_id, interests=frozenset(interests), text_chars=chars, text_vector=vector)


def test_expand_gives_full_weight_to_the_interest_and_less_to_each_step_up():
    assert expand(frozenset({3}), PARENTS, 0.5) == {3: 1.0, 2: 0.5, 1: 0.25}


def test_expand_keeps_the_largest_weight_when_a_parent_is_also_chosen():
    assert expand(frozenset({3, 2}), PARENTS, 0.5) == {3: 1.0, 2: 1.0, 1: 0.5}


def test_same_interests_overlap_fully():
    assert tree_overlap(frozenset({3}), frozenset({3}), PARENTS, 0.5) == 1.0


def test_interests_in_different_branches_do_not_overlap():
    assert tree_overlap(frozenset({3}), frozenset({11}), PARENTS, 0.5) == 0.0


def test_siblings_share_their_parents_and_overlap_partly():
    assert tree_overlap(frozenset({3}), frozenset({4}), PARENTS, 0.5) == pytest.approx(2 * 0.75 / 3.5)


def test_sharing_only_a_top_category_counts_less_than_sharing_a_parent():
    siblings = tree_overlap(frozenset({3}), frozenset({4}), PARENTS, 0.5)
    only_top = tree_overlap(frozenset({3}), frozenset({5}), PARENTS, 0.5)
    assert 0 < only_top < siblings


def test_near_interests_is_higher_for_similar_interests_than_for_different_ones():
    similar = near_interests(frozenset({3}), frozenset({4}), VECTORS)
    different = near_interests(frozenset({3}), frozenset({10}), VECTORS)
    assert similar > 0.95
    assert different < 0.1


def test_near_interests_ignores_interests_without_a_vector_and_gives_none_when_nothing_is_left():
    assert near_interests(frozenset({3, 99}), frozenset({4}), VECTORS) == pytest.approx(
        near_interests(frozenset({3}), frozenset({4}), VECTORS)
    )
    assert near_interests(frozenset({98}), frozenset({99}), VECTORS) is None


def test_readiness_needs_enough_interests_and_text():
    assert readiness(person(1, range(MIN_INTERESTS), chars=MIN_TEXT_CHARS)).ok


def test_readiness_says_what_is_missing():
    result = readiness(person(1, [3], chars=60))
    assert not result.ok
    assert result.missing_interests == MIN_INTERESTS - 1
    assert result.missing_chars == MIN_TEXT_CHARS - 60


def test_identical_profiles_get_full_marks():
    a, b = person(1, [3, 4, 5]), person(2, [3, 4, 5])
    result = score(a, b, PARENTS, VECTORS)
    assert result.percent == 100
    assert result.complete


def test_unrelated_profiles_get_almost_nothing():
    a = person(1, [3, 4, 5], vector=CLIMBING)
    b = person(2, [10, 11, 13], vector=MUSIC)
    assert score(a, b, PARENTS, VECTORS).percent <= 5


def test_a_better_match_scores_higher_than_a_worse_one():
    me = person(1, [3, 4, 5])
    close = person(2, [3, 4, 5])
    partly = person(3, [3, 10, 13], vector=[0.6, 0.8, 0.0])
    far = person(4, [10, 11, 13], vector=MUSIC)
    scores = [score(me, other, PARENTS, VECTORS).percent for other in (close, partly, far)]
    assert scores == sorted(scores, reverse=True)
    assert len(set(scores)) == 3


def test_the_score_is_the_same_in_both_directions():
    a = person(1, [3, 4], vector=[0.8, 0.6, 0.0])
    b = person(2, [4, 10, 13], chars=300, vector=[0.3, 0.9, 0.1])
    assert score(a, b, PARENTS, VECTORS).percent == score(b, a, PARENTS, VECTORS).percent


def test_the_score_stays_between_0_and_100_whatever_the_weights():
    a, b = person(1, [3, 4]), person(2, [4, 10], vector=[0.5, 0.5, 0.0])
    for beta in (0, 0.5, 1, 3, 10):
        for text_weight in (0, 0.1, 1, 5):
            config = replace(DEFAULT_CONFIG, beta=beta, weight_text=text_weight)
            assert 0 <= score(a, b, PARENTS, VECTORS, config).percent <= 100


def test_the_weights_of_the_parts_add_up_to_one():
    result = score(person(1, [3, 4]), person(2, [4, 10], vector=[0.5, 0.5, 0.0]), PARENTS, VECTORS)
    assert sum(result.weights.values()) == pytest.approx(1.0)


def test_a_strong_part_weighs_more_than_its_base_weight_and_without_beta_it_does_not():
    a = person(1, [3, 4, 5], vector=CLIMBING)
    b = person(2, [10, 11, 13], vector=CLIMBING)  # intressena skiljer sig helt, texten är identisk
    plain = score(a, b, PARENTS, VECTORS, replace(NEUTRAL, beta=0.0))
    boosted = score(a, b, PARENTS, VECTORS, replace(NEUTRAL, beta=0.5))
    assert plain.weights["text"] == pytest.approx(0.35)
    assert boosted.weights["text"] == pytest.approx(0.35 * 1.5 / (0.35 + 0.30 + 0.35 * 1.5))
    assert boosted.percent > plain.percent


def test_missing_text_vector_drops_the_text_part_and_marks_the_score_as_less_certain():
    a = person(1, [3, 4, 5], vector=None)
    b = person(2, [3, 4, 5])
    result = score(a, b, PARENTS, VECTORS)
    assert "text" not in result.parts
    assert not result.complete
    assert sum(result.weights.values()) == pytest.approx(1.0)
    assert result.percent == 100


def test_missing_interest_vectors_drop_the_near_part():
    a, b = person(1, [3, 4, 5]), person(2, [3, 4, 5])
    result = score(a, b, PARENTS, {})
    assert "narliggande" not in result.parts
    assert not result.complete


def test_little_data_lowers_how_much_a_part_counts_and_the_thinnest_profile_decides():
    rich = person(1, range(10), chars=700)
    thin = person(2, [3, 4, 5], chars=MIN_TEXT_CHARS)
    result = score(rich, thin, PARENTS, VECTORS)
    assert result.reliability["intressen"] == pytest.approx(0.4)
    assert result.reliability["text"] == pytest.approx(0.4)
    both_rich = score(rich, person(3, range(10), chars=700), PARENTS, VECTORS)
    assert both_rich.reliability == {"intressen": 1.0, "narliggande": 1.0, "text": 1.0}


def test_a_thin_text_counts_less_against_a_strong_text_match():
    a = person(1, [3, 4, 5], chars=700, vector=CLIMBING)
    unrelated = [10, 11, 13]
    long_text = score(a, person(2, unrelated, chars=700, vector=CLIMBING), PARENTS, VECTORS)
    short_text = score(a, person(3, unrelated, chars=MIN_TEXT_CHARS, vector=CLIMBING), PARENTS, VECTORS)
    assert short_text.weights["text"] < long_text.weights["text"]
