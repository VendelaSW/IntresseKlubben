"""Matchningens poäng (services/matching.py): rena funktioner med påhittade vektorer, ingen databas och ingen AI."""

from dataclasses import replace

import pytest

from app.services.matching import (
    DEFAULT_CONFIG,
    LEVELS,
    MIN_INTERESTS,
    MIN_SHOWN_PERCENT,
    MIN_TEXT_CHARS,
    THIN_CHARS,
    THIN_INTERESTS,
    MatchConfig,
    Person,
    blend_directions,
    combine,
    common_areas,
    expand,
    level_for,
    near_interests,
    near_pairs,
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


def test_the_score_is_seen_from_the_first_person_so_covering_all_of_my_interests_counts_for_me():
    few = person(1, [3, 4, 5])
    many = person(2, [3, 4, 5, 10, 11, 13])  # har alla mina tre, och tre till som jag inte har
    from_few = score(few, many, PARENTS, VECTORS).percent
    from_many = score(many, few, PARENTS, VECTORS).percent
    assert from_few > from_many
    assert from_few >= 70  # alla mina intressen finns hos henne


def test_with_no_viewer_weighting_the_score_is_the_same_in_both_directions():
    symmetric = replace(DEFAULT_CONFIG, coverage_share=0.0, near_viewer_share=0.5)
    a = person(1, [3, 4], vector=[0.8, 0.6, 0.0])
    b = person(2, [4, 10, 13], chars=300, vector=[0.3, 0.9, 0.1])
    assert score(a, b, PARENTS, VECTORS, symmetric).percent == score(b, a, PARENTS, VECTORS, symmetric).percent


def test_tree_overlap_coverage_is_how_much_of_the_first_persons_interests_the_second_has():
    few, many = frozenset({3, 4}), frozenset({3, 4, 10, 13})
    assert tree_overlap(few, many, PARENTS, 0.5, coverage_share=1.0) == 1.0
    assert tree_overlap(many, few, PARENTS, 0.5, coverage_share=1.0) < 1.0
    assert tree_overlap(few, many, PARENTS, 0.5) == tree_overlap(many, few, PARENTS, 0.5)  # utan täckning ren Dice


def test_blend_directions_weighs_the_viewers_direction_and_uses_the_one_that_exists():
    assert blend_directions(0.9, 0.5, 0.7) == pytest.approx(0.78)
    assert blend_directions(0.9, None, 0.7) == 0.9
    assert blend_directions(None, 0.5, 0.7) == 0.5
    assert blend_directions(None, None, 0.7) is None


def test_the_score_stays_between_0_and_100_whatever_the_weights():
    a, b = person(1, [3, 4]), person(2, [4, 10], vector=[0.5, 0.5, 0.0])
    for interest_weight in (0, 0.1, 1, 5):
        for text_weight in (0, 0.1, 1, 5):
            config = replace(DEFAULT_CONFIG, weight_interests=interest_weight, weight_text=text_weight)
            assert 0 <= score(a, b, PARENTS, VECTORS, config).percent <= 100


def test_the_weights_of_the_parts_add_up_to_one():
    result = score(person(1, [3, 4]), person(2, [4, 10], vector=[0.5, 0.5, 0.0]), PARENTS, VECTORS)
    assert sum(result.weights.values()) == pytest.approx(1.0)


def test_each_part_weighs_its_base_weight_whatever_its_own_score():
    a = person(1, [3, 4, 5], vector=CLIMBING)
    b = person(2, [10, 11, 13], vector=CLIMBING)  # intressena skiljer sig helt, texten är identisk
    result = score(a, b, PARENTS, VECTORS, NEUTRAL)
    assert result.weights == pytest.approx({"intressen": 0.35, "narliggande": 0.30, "text": 0.35})


def test_levels_are_given_by_the_score_and_nothing_is_shown_below_the_lowest():
    assert [level_for(p) for p in (100, 80, 79, 60, 59, 35, 34, 15, 14, 0)] == [
        "super", "super", "strong", "strong", "good", "good", "okay", "okay", None, None,
    ]
    assert MIN_SHOWN_PERCENT == LEVELS[-1][0] == 15
    assert score(person(1, [3, 4, 5]), person(2, [3, 4, 5]), PARENTS, VECTORS).level == "super"
    assert score(person(1, [3, 4, 5]), person(2, [10, 11, 13], vector=MUSIC), PARENTS, VECTORS).level is None


@pytest.mark.parametrize(
    "change",
    [
        {"near_hi": 0.45},
        {"text_hi": 0.50},
        {"tree_decay": 1.5},
        {"coverage_share": -0.1},
        {"near_viewer_share": 1.1},
        {"reliable_interests": 0},
        {"reliable_chars": 0},
        {"reliability_floor": 2.0},
        {"weight_text": -1.0},
        {"weight_interests": 0.0, "weight_near": 0.0, "weight_text": 0.0},
        {"weight_text": float("nan")},
        {"near_lo": float("-inf"), "near_hi": float("inf")},
        {"text_hi": float("inf")},
        {"text_lo": float("nan")},
        {"reliability_floor": float("inf")},
    ],
)
def test_a_broken_configuration_is_refused_at_once(change):
    with pytest.raises(ValueError, match="MatchConfig"):
        replace(DEFAULT_CONFIG, **change)


def test_vectors_of_different_length_or_not_finite_are_an_error_not_a_score():
    broken_length = person(2, [3, 4, 5], vector=[1.0, 0.0])
    with pytest.raises(ValueError, match="olika längd"):
        score(person(1, [3, 4, 5]), broken_length, PARENTS, VECTORS)
    not_finite = person(2, [3, 4, 5], vector=[float("nan"), 0.0, 0.0])
    with pytest.raises(ValueError, match="ändliga"):
        score(person(1, [3, 4, 5]), not_finite, PARENTS, VECTORS)


def test_a_zero_vector_gives_no_text_similarity_instead_of_an_error():
    result = score(person(1, [3, 4, 5]), person(2, [3, 4, 5], vector=[0.0, 0.0, 0.0]), PARENTS, VECTORS)
    assert result.parts["text"] == 0.0


def test_cyclic_parent_links_do_not_hang():
    cyclic = {1: 2, 2: 1, 3: 1}
    assert expand(frozenset({3}), cyclic, 0.5) == {3: 1.0, 1: 0.5, 2: 0.25}
    assert tree_overlap(frozenset({3}), frozenset({3}), cyclic, 0.5) == 1.0


def test_empty_interest_sets_give_a_zero_overlap_and_no_near_value():
    assert tree_overlap(frozenset(), frozenset(), PARENTS, 0.5) == 0.0
    assert tree_overlap(frozenset({3}), frozenset(), PARENTS, 0.5, coverage_share=1.0) == 0.0
    assert near_interests(frozenset(), frozenset({3}), VECTORS) is None


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


def test_combine_gives_the_same_score_as_score_from_the_same_cosines():
    a = person(1, [3, 4, 5], vector=[0.8, 0.6, 0.0])
    b = person(2, [4, 10], chars=300, vector=[0.3, 0.9, 0.1])
    via_vectors = score(a, b, PARENTS, VECTORS)
    via_cosines = combine(a, b, PARENTS, via_vectors.raw["narliggande"], via_vectors.raw["text"])
    assert via_cosines.percent == via_vectors.percent
    assert via_cosines.parts == via_vectors.parts


def test_combine_without_a_cosine_drops_that_part_and_is_less_certain():
    result = combine(person(1, range(THIN_INTERESTS), chars=THIN_CHARS), person(2, range(THIN_INTERESTS), chars=THIN_CHARS), PARENTS, None, None)
    assert set(result.parts) == {"intressen"}
    assert not result.complete
    assert result.low_confidence


def test_a_match_is_marked_uncertain_when_either_has_few_interests_or_a_short_text():
    full = dict(chars=THIN_CHARS)
    enough = list(range(THIN_INTERESTS))
    assert not score(person(1, enough, **full), person(2, enough, **full), PARENTS, VECTORS).low_confidence
    assert score(person(1, enough, **full), person(2, enough[:-1], **full), PARENTS, VECTORS).low_confidence
    assert score(person(1, enough, **full), person(2, enough, chars=THIN_CHARS - 1), PARENTS, VECTORS).low_confidence


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), float("-inf")])
def test_a_cosine_that_is_not_a_finite_number_counts_as_missing_not_as_full_marks(bad):
    a, b = person(1, [3, 4, 5]), person(2, [10, 11, 13])  # intressena skiljer sig helt
    reference = combine(a, b, PARENTS, 0.45, 0.50)
    assert reference.percent == 0
    for near, text in ((bad, 0.50), (0.45, bad), (bad, bad)):
        result = combine(a, b, PARENTS, near, text)
        assert result.percent == 0
        assert not result.complete and result.low_confidence
    assert "narliggande" not in combine(a, b, PARENTS, bad, 0.50).parts
    assert "text" not in combine(a, b, PARENTS, 0.45, bad).parts


def test_near_pairs_gives_the_most_similar_pairs_that_are_not_the_same_interest():
    # Mina: Bouldering (3) och Jazz (11). Hens: Sportklättring (4), Vandring (5) och Opera (10).
    pairs = near_pairs(frozenset({3, 11}), frozenset({4, 5, 10}), VECTORS)
    assert pairs[0] == (3, 4)  # Bouldering liknar Sportklättring mest
    assert (11, 10) in pairs  # Jazz liknar Opera
    assert all(i != j for i, j in pairs)


def test_near_pairs_leaves_out_shared_interests_weak_pairs_and_repeats():
    assert near_pairs(frozenset({3}), frozenset({3, 13}), VECTORS) == []  # 3 är delat, och 13 liknar inte
    assert near_pairs(frozenset({3}), frozenset({13}), VECTORS) == []  # under gränsen
    # två av mina liknar samma av hennes: hon visas bara en gång
    assert len(near_pairs(frozenset({3, 5}), frozenset({4}), VECTORS)) == 1
    assert near_pairs(frozenset({3, 5}), frozenset({4, 11}), VECTORS, limit=1) == [(3, 4)]


def test_near_pairs_ignores_interests_without_a_vector():
    assert near_pairs(frozenset({3, 99}), frozenset({4, 98}), VECTORS) == [(3, 4)]


def test_common_areas_are_the_top_level_interests_both_have_something_under():
    assert common_areas(frozenset({3}), frozenset({5}), PARENTS) == [1]  # båda under Friluftsliv
    assert common_areas(frozenset({3}), frozenset({11}), PARENTS) == []
    assert common_areas(frozenset({1}), frozenset({3}), PARENTS) == [1]  # ett huvudområde räknas som sitt eget


def test_common_areas_survives_cyclic_parent_links():
    assert common_areas(frozenset({3}), frozenset({3}), {1: 2, 2: 1, 3: 1}) in ([1], [2])
