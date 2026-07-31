"""Sentence selection and the four context-driven exercise kinds (GV-B3).

The behaviours proved here are the ones the owner's ask depends on:

* **The preference order is real.** The learner's own sentence carries the item where one
  exists, then a sentence they met it in during a real attempt, then an authored context,
  then an authored example, then a generated one.
* **Rotation outranks provenance.** The learner's own sentence wins the first presentation
  and every tie — and does *not* win twice in a row while an unseen context exists. That
  single ordering is the difference between learning a word and memorising one sentence.
* **Each new kind grades.** `forced_choice`, `transform` and `error_fix` mechanically, with
  grammar's stricter near-miss policy (a typo passes; a wrong inflection does not);
  `produce` through the four binary checks, including the two fairness rules that make a
  rejection expensive.
"""

from __future__ import annotations

import random
from typing import Any

import pytest

from bandready.srs import context as ctx
from bandready.srs import exercises as ex

# --------------------------------------------------------------------------------------
# Fixtures — one v2 entry, shaped exactly as `merge_pack_payload` leaves it
# --------------------------------------------------------------------------------------


def v2_entry(**overrides: Any) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "id": "ve_test",
        "headword": "arable",
        "lemma": "arable",
        "pos": "adj",
        "definition": "suitable for growing crops, rather than only for grazing animals",
        "own_context_sentence": None,
        "own_context_origin": "seed",
        "example_sentences": ["Countries with little arable land have to import most of their food."],
        "collocations": ["arable land", "arable farming"],
        "topic_tags": ["environment"],
        "cefr_level": "B2",
        "source": {"module": "seed"},
        # ---- entry_json v2 (§3.2) ----
        "unit_type": "word",
        "register": "written",
        "frequency_band": 4,
        "word_family": [{"form": "arability", "pos": "noun", "note": "rare; mostly technical"}],
        "chunk": None,
        "topic_id": "topic_environment",
        "contexts": [
            {
                "id": "c1",
                "text": (
                    "Once the topsoil has washed away, land that used to be arable takes "
                    "several decades to recover."
                ),
                "register": "written",
                "topic_id": "topic_environment",
                "skill_hook": "writing_t2",
                "gap_span": "arable",
                "unique_answer": True,
            },
            {
                "id": "c2",
                "text": "Only half of it is really arable.",
                "register": "spoken",
                "topic_id": "topic_food",
                "gap_span": "arable",
                "unique_answer": True,
            },
        ],
        "confusables": [
            {
                "term": "fertile",
                "difference": (
                    "Arable says what the land is used for: crops rather than pasture. "
                    "Fertile says how rich it is."
                ),
                "minimal_pair": [
                    "The valley floor is arable.",
                    "The valley floor is fertile.",
                ],
            }
        ],
        "grammar_links": ["gr_passive_when"],
        "avoid": 'Not "arable animals". The word describes land, never livestock.',
    }
    entry.update(overrides)
    return entry


LEARNER_OWN = "The farm my uncle rents is only half arable."
ATTEMPT = "I said arable land is disappearing near my home town."


# ======================================================================================
# 1. Preference order
# ======================================================================================


def test_source_order_is_the_documented_one() -> None:
    """The order is data, not scattered `if`s — so it can be read and reviewed."""
    assert ctx.SENTENCE_SOURCE_ORDER == (
        "learner_own",
        "learner_attempt",
        "authored_context",
        "authored_seed",
        "authored_example",
        "generated",
    )


def test_candidates_are_ranked_own_then_attempt_then_authored_then_generated() -> None:
    entry = v2_entry(own_context_sentence=LEARNER_OWN, own_context_origin="learner")
    candidates = ctx.sentence_candidates(
        entry,
        extra_sentences=[
            {"text": ATTEMPT, "source": "learner_attempt"},
            {"text": "A model wrote this one.", "source": "generated"},
        ],
    )
    assert [c.source for c in candidates] == [
        "learner_own",
        "learner_attempt",
        "authored_context",
        "authored_context",
        "authored_example",
        "generated",
    ]
    assert candidates[0].text == LEARNER_OWN


def test_the_learners_own_sentence_carries_the_first_presentation() -> None:
    entry = v2_entry(own_context_sentence=LEARNER_OWN, own_context_origin="learner")
    chosen = ctx.select_sentence(entry, extra_sentences=[{"text": ATTEMPT, "source": "learner_attempt"}])
    assert chosen is not None
    assert chosen.text == LEARNER_OWN
    assert chosen.source == "learner_own"
    assert chosen.is_learner_own


def test_a_real_attempt_beats_an_authored_example() -> None:
    """No own_context_sentence, so the sentence they actually met it in has to win."""
    entry = v2_entry()
    chosen = ctx.select_sentence(entry, extra_sentences=[{"text": ATTEMPT, "source": "learner_attempt"}])
    assert chosen is not None and chosen.source == "learner_attempt"


def test_an_authored_context_beats_an_authored_example() -> None:
    chosen = ctx.select_sentence(v2_entry())
    assert chosen is not None and chosen.source == "authored_context"


def test_a_v1_entry_still_selects_something() -> None:
    """343 entries predate v2. They must degrade, not break."""
    v1 = {
        "id": "ve_v1",
        "headword": "mitigate",
        "lemma": "mitigate",
        "pos": "verb",
        "definition": "to make something less harmful",
        "own_context_sentence": "Governments must mitigate the effects of climate change.",
        "own_context_origin": "seed",
        "example_sentences": ["Planting trees can mitigate urban heat."],
        "collocations": ["mitigate the effects of"],
    }
    chosen = ctx.select_sentence(v1)
    assert chosen is not None and chosen.source == "authored_seed"


def test_generated_is_last_and_can_be_switched_off() -> None:
    bare = {"id": "ve_bare", "headword": "arable", "lemma": "arable", "pos": "adj"}
    generated = [{"text": "A model wrote this one.", "source": "generated"}]
    assert ctx.select_sentence(bare, extra_sentences=generated).source == "generated"
    assert ctx.select_sentence(bare, extra_sentences=generated, allow_generated=False) is None


# ======================================================================================
# 2. Rotation, which outranks provenance
# ======================================================================================


def test_rotation_outranks_provenance_so_one_sentence_is_not_memorised() -> None:
    entry = v2_entry(own_context_sentence=LEARNER_OWN, own_context_origin="learner")
    first = ctx.select_sentence(entry)
    assert first is not None and first.source == "learner_own"

    second = ctx.select_sentence(entry, seen_ids=[first.id])
    assert second is not None
    assert second.id != first.id, "the same context must never run twice in a row"
    assert second.source == "authored_context"

    third = ctx.select_sentence(entry, seen_ids=[first.id, second.id])
    assert third is not None and third.id not in (first.id, second.id)


def test_the_bank_is_exhausted_before_anything_repeats() -> None:
    entry = v2_entry(own_context_sentence=LEARNER_OWN, own_context_origin="learner")
    total = len(ctx.sentence_candidates(entry))
    seen: list[str] = []
    for _ in range(total):
        chosen = ctx.select_sentence(entry, seen_ids=seen)
        assert chosen is not None
        assert chosen.id not in seen
        seen.append(chosen.id)
    assert len(set(seen)) == total


def test_once_exhausted_the_least_recently_seen_comes_back() -> None:
    entry = v2_entry(own_context_sentence=LEARNER_OWN, own_context_origin="learner")
    order = [c.id for c in ctx.sentence_candidates(entry)]
    chosen = ctx.select_sentence(entry, seen_ids=order)
    assert chosen is not None
    assert chosen.id == order[0], "oldest first once every context has been used"


def test_a_consecutive_repeat_is_blocked_even_when_it_is_the_best_ranked() -> None:
    entry = v2_entry(own_context_sentence=LEARNER_OWN, own_context_origin="learner")
    chosen = ctx.select_sentence(entry, last_shown_id="own")
    assert chosen is not None and chosen.id != "own"


def test_a_single_candidate_survives_the_no_repeat_rule() -> None:
    single = {
        "id": "ve_one",
        "headword": "arable",
        "lemma": "arable",
        "own_context_sentence": LEARNER_OWN,
        "own_context_origin": "learner",
    }
    chosen = ctx.select_sentence(single, last_shown_id="own")
    assert chosen is not None and chosen.id == "own", "one context is better than none"


def test_register_and_topic_bias_break_ties_between_authored_contexts() -> None:
    entry = v2_entry()  # both contexts unseen, same provenance rank
    spoken = ctx.select_sentence(entry, register_bias="spoken")
    written = ctx.select_sentence(entry, register_bias="written")
    assert spoken is not None and spoken.register == "spoken"
    assert written is not None and written.register == "written"

    topical = ctx.select_sentence(entry, topic_bias=["topic_food"])
    assert topical is not None and topical.topic_id == "topic_food"


def test_short_contexts_are_preferred_while_the_form_is_still_being_built() -> None:
    entry = v2_entry()
    early = ctx.select_sentence(entry, stage=1, register_bias=None)
    late = ctx.select_sentence(entry, stage=4, register_bias=None)
    assert early is not None and early.words <= ctx.SHORT_CONTEXT_WORDS
    # At S4 the long, meaning-heavy context is no longer penalised.
    assert late is not None and late.words > ctx.SHORT_CONTEXT_WORDS


def test_selection_is_deterministic() -> None:
    entry = v2_entry(own_context_sentence=LEARNER_OWN, own_context_origin="learner")
    picks = {ctx.select_sentence(entry, seen_ids=["own"]).id for _ in range(20)}
    assert len(picks) == 1


# ======================================================================================
# 3. Gapping the chosen sentence
# ======================================================================================


def test_gap_span_blanks_the_exact_authored_span() -> None:
    entry = v2_entry()
    sentence = ctx.select_sentence(entry, register_bias="spoken")
    gapped = ctx.cloze_payload(sentence, entry)
    assert gapped["blanks"] == 1
    assert "arable" not in gapped["masked"]
    assert gapped["answers"] == ["arable"]


def test_a_chunk_is_gapped_even_out_of_its_citation_form() -> None:
    """The v1 matcher needs the chunk verbatim; `gap_span` is exact, so it does not."""
    entry = {
        "id": "ve_chunk",
        "headword": "stem from",
        "lemma": "stem from",
        "pos": "phrase",
        "contexts": [
            {
                "id": "c1",
                "text": "Most of the delays stemmed from a shortage of drivers.",
                "gap_span": "stemmed from",
                "unique_answer": True,
            }
        ],
    }
    sentence = ctx.select_sentence(entry)
    gapped = ctx.cloze_payload(sentence, entry)
    assert gapped["blanks"] == 1 and gapped["answers"] == ["stemmed from"]
    assert ex.cloze_from_sentence(sentence.text, "stem from")["blanks"] == 0, (
        "the regex matcher genuinely cannot do this — that is why gap_span exists"
    )


# ======================================================================================
# 4. The strict near-miss (§2.9)
# ======================================================================================


@pytest.mark.parametrize(
    ("expected", "given", "same"),
    [
        ("walked", "walkd", True),      # mistyped ending — a slip
        ("mitigate", "mitigat", True),  # mistyped stem — a slip
        ("walked", "walks", False),     # a different ending was chosen
        ("arable", "arables", False),   # wrong number is wrong
        ("walked", "walking", False),   # the lesson itself
    ],
)
def test_same_inflection_class(expected: str, given: str, same: bool) -> None:
    assert ctx.same_inflection_class(expected, given) is same


def test_strict_close_forgives_a_typo_and_refuses_a_wrong_form() -> None:
    assert ctx.strict_close(["walked"], "walkd") is True
    assert ctx.strict_close(["walked"], "walks") is False
    assert ctx.strict_close(["walked"], "sprinted") is False


def test_word_variants_is_not_used_by_the_strict_policy() -> None:
    """`word_variants` accepts every inflection — correct for cloze, fatal for form work."""
    assert "arables" in ex.word_variants("arable")
    assert ctx.strict_close(["arable"], "arables") is False


# ======================================================================================
# 5. The four kinds — building and grading
# ======================================================================================


def test_forced_choice_offers_two_real_options_and_hides_the_explanation() -> None:
    entry = v2_entry()
    built = ctx.build("forced_choice", entry, rng=random.Random(7))
    assert built["type"] == "forced_choice"
    assert sorted(built["payload"]["options"]) == ["arable", "fertile"]
    assert "____" in built["payload"]["masked_sentence"]
    assert "arable" not in built["payload"]["masked_sentence"]
    assert built["payload"]["reveal"]["difference"], "the difference is shown after, not before"
    assert built["expected"] == ["arable"]


def test_forced_choice_grades_the_choice() -> None:
    built = ctx.build("forced_choice", v2_entry(), rng=random.Random(1))
    right = ex.grade_answer(built, "arable")
    wrong = ex.grade_answer(built, "fertile")
    assert right["correct"] is True and right["suggested_rating"] == 3
    assert wrong["correct"] is False and wrong["suggested_rating"] == 1
    assert "arable" in wrong["detail"]


def test_forced_choice_falls_back_to_the_dependent_preposition() -> None:
    entry = {
        "id": "ve_dep",
        "headword": "stem from",
        "lemma": "stem from",
        "pos": "phrase",
        "chunk": {"fixed_part": "stem from", "dependent_preposition": "from"},
        "contexts": [
            {"id": "c1", "text": "The delays stem from poor planning.", "gap_span": "from"}
        ],
    }
    built = ctx.build("forced_choice", entry, rng=random.Random(3))
    assert built["type"] == "forced_choice"
    assert built["payload"]["basis"] == "dependent_preposition"
    assert built["expected"] == ["from"]


def test_transform_uses_the_word_family_and_refuses_the_wrong_form() -> None:
    built = ctx.build("transform", v2_entry(), rng=random.Random(5))
    assert built["type"] == "transform"
    assert built["payload"]["mode"] == "word_family"
    assert built["payload"]["to_pos"] == "noun"
    assert built["payload"]["source_sentence"], "a transform without a sentence is a word list"
    assert ex.grade_answer(built, "arability")["correct"] is True
    # A spelling slip is forgiven; a different form of the word is not.
    slip = ex.grade_answer(built, "arabilty")
    assert slip["correct"] is True and slip["note"] == "spelling"
    assert ex.grade_answer(built, "arable")["correct"] is False


def test_transform_swaps_the_confusable_and_accepts_a_reasonable_rewrite() -> None:
    entry = v2_entry(word_family=[])  # no family, so the confusable mode is chosen
    built = ctx.build("transform", entry, rng=random.Random(5))
    assert built["payload"]["mode"] == "confusable_swap"
    assert built["payload"]["source_sentence"] == "The valley floor is fertile."

    assert ex.grade_answer(built, "The valley floor is arable.")["correct"] is True
    # Not our exact string, but it does the swap — accepting is cheap, rejecting is not.
    assert ex.grade_answer(built, "the valley floor is arable")["correct"] is True
    # Did not do the swap.
    assert ex.grade_answer(built, "The valley floor is fertile.")["correct"] is False
    assert ex.grade_answer(built, "The soil is rich.")["correct"] is False


def test_error_fix_corrects_the_learners_own_sentence() -> None:
    entry = v2_entry(
        learner_errors=[
            {
                "id": "we_1:0",
                "module": "writing",
                "sentence": "Much of the country is arable land, but the soil are poor.",
                "span": "the soil are poor",
                "fix": "the soil is poor",
                "kind": "grammar",
                "explanation": "`soil` is uncountable, so it takes a singular verb.",
            }
        ]
    )
    built = ctx.build("error_fix", entry, rng=random.Random(2))
    payload = built["payload"]
    assert built["type"] == "error_fix"
    assert payload["marked_broken"] is True, "the broken form must be chrome, never prose"
    assert payload["span_start"] is not None and payload["span_end"] is not None
    assert payload["sentence"][payload["span_start"] : payload["span_end"]] == "the soil are poor"
    assert payload["source_note"] == "from your Writing feedback"
    assert payload["min_reveal_ms"] >= ctx.MIN_CORRECTION_REVEAL_MS
    assert payload["reveal"]["corrected_sentence"].endswith("the soil is poor.")

    # Either the replacement alone or the whole repaired sentence is accepted.
    assert ex.grade_answer(built, "the soil is poor")["correct"] is True
    assert (
        ex.grade_answer(built, "Much of the country is arable land, but the soil is poor.")[
            "correct"
        ]
        is True
    )
    assert ex.grade_answer(built, "the soil are poor")["correct"] is False


def test_produce_carries_a_constraint_not_just_the_word() -> None:
    built = ctx.build("produce", v2_entry(), rng=random.Random(9))
    assert built["type"] == "produce"
    assert built["payload"]["constraint"]["kind"] == "collocation"
    assert built["payload"]["must_contain"] == ["arable land"]
    assert built["expected"] is None
    assert built["payload"]["checked_by"] == "llm"

    seeded = ctx.build(
        "produce",
        v2_entry(),
        grammar_target={"label": "present perfect", "point_id": "gr_pp_vs_past_simple"},
    )
    assert seeded["payload"]["constraint"] == {
        "kind": "grammar",
        "value": "present perfect",
        "point_id": "gr_pp_vs_past_simple",
    }
    assert "present perfect" in seeded["prompt"]


def test_produce_is_never_graded_mechanically() -> None:
    built = ctx.build("produce", v2_entry())
    result = ex.grade_answer(built, "Most of the valley is arable land.")
    assert result["checked"] is False, "a free sentence is not a string match"


def test_an_entry_without_the_data_falls_back_instead_of_crashing() -> None:
    bare = {"id": "ve_bare", "headword": "arable", "lemma": "arable", "pos": "adj"}
    for kind in ("forced_choice", "transform", "error_fix"):
        assert ctx.can_build(kind, bare) is False
        assert ctx.build(kind, bare)["type"] == "flip"


def test_context_kinds_are_off_by_default_in_the_existing_queue() -> None:
    """The running vocabulary session must keep emitting only kinds its UI can draw."""
    entry = v2_entry()
    mature = {"state_code": 2, "stability": 40.0}
    assert not set(ex.eligible_types(entry, mature)) & set(ex.CONTEXT_EXERCISE_TYPES)
    opted_in = ex.eligible_types(entry, mature, include_context=True)
    assert "forced_choice" in opted_in and "transform" in opted_in and "produce" in opted_in


def test_production_is_gated_behind_a_stable_form() -> None:
    """Sentence writing competes with form learning while the form is still being built."""
    entry = v2_entry()
    new = ex.eligible_types(entry, {"state_code": 0, "stability": 0.0}, include_context=True)
    young = ex.eligible_types(entry, {"state_code": 2, "stability": 3.0}, include_context=True)
    mature = ex.eligible_types(entry, {"state_code": 2, "stability": 40.0}, include_context=True)
    assert not set(new) & set(ex.CONTEXT_EXERCISE_TYPES)
    assert "forced_choice" in young and "produce" not in young
    assert "produce" in mature


# ======================================================================================
# 6. Free-production grading (GV-R4 §5)
# ======================================================================================


@pytest.fixture()
def anyio_backend() -> str:
    return "asyncio"


class _Judge:
    """A stand-in for the model, so the fairness rules can be tested without one.

    ``on_gloss`` is answered instead whenever the prompt carries the learner's appeal —
    which is the only way to test that the appeal actually changes what the model is asked.
    """

    def __init__(self, *responses: dict[str, Any], on_gloss: dict[str, Any] | None = None) -> None:
        self.responses = list(responses)
        self.on_gloss = on_gloss
        self.calls = 0
        self.prompts: list[str] = []

    async def __call__(self, messages: Any, mock_kind: Any = None, **kw: Any) -> dict[str, Any]:
        self.calls += 1
        prompt = str(messages[-1]["content"]) if messages else ""
        self.prompts.append(prompt)
        if self.on_gloss is not None and "the learner says they meant" in prompt.lower():
            return self.on_gloss
        index = min(self.calls - 1, len(self.responses) - 1)
        return self.responses[index]


def _patch_judge(monkeypatch: pytest.MonkeyPatch, judge: _Judge) -> None:
    from bandready.providers import llm

    monkeypatch.setattr(llm, "chat_json", judge)


def test_detect_target_is_mechanical() -> None:
    entry = v2_entry()
    assert ctx.detect_target("Most of the valley is arable land.", entry) is True
    assert ctx.detect_target("Most of the valley is good for crops.", entry) is False
    chunk = {"headword": "stem from", "lemma": "stem from", "chunk": {"fixed_part": "stem from"}}
    assert ctx.detect_target("The delays stem from poor planning.", chunk) is True


@pytest.mark.anyio
async def test_production_accepts_on_one_call(monkeypatch: pytest.MonkeyPatch) -> None:
    judge = _Judge({"structure_correct": True, "fits": True, "offending_span": ""})
    _patch_judge(monkeypatch, judge)
    entry = v2_entry()
    built = ctx.build("produce", entry)
    result = await ctx.check_production(built, "Most of the valley is arable land.", entry=entry)
    assert result["accepted"] is True
    assert result["suggested_rating"] == 3
    assert judge.calls == 1, "accepting is cheap"


@pytest.mark.anyio
async def test_a_rejection_it_cannot_quote_is_discarded(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The single strongest fairness lever we have: no span, no rejection."""
    judge = _Judge(
        {"structure_correct": False, "fits": True, "offending_span": "", "minimal_fix": ""}
    )
    _patch_judge(monkeypatch, judge)
    entry = v2_entry()
    built = ctx.build("produce", entry)
    result = await ctx.check_production(built, "Most of the valley is arable land.", entry=entry)
    assert result["accepted"] is True
    assert judge.calls == 1


@pytest.mark.anyio
async def test_a_rejection_costs_a_second_call_and_disagreement_accepts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    judge = _Judge(
        {"structure_correct": False, "fits": True, "offending_span": "arable weather"},
        {"structure_correct": True, "fits": True, "offending_span": ""},
    )
    _patch_judge(monkeypatch, judge)
    entry = v2_entry()
    built = ctx.build("produce", entry)
    result = await ctx.check_production(built, "We had arable weather all week.", entry=entry)
    assert judge.calls == 2, "rejecting is expensive"
    assert result["accepted"] is True


@pytest.mark.anyio
async def test_a_confirmed_rejection_is_anchored_and_appealable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    verdict = {
        "structure_correct": False,
        "fits": True,
        "offending_span": "arable weather",
        "minimal_fix": "We had good weather all week.",
    }
    judge = _Judge(verdict, verdict)
    _patch_judge(monkeypatch, judge)
    entry = v2_entry()
    built = ctx.build("produce", entry)
    result = await ctx.check_production(built, "We had arable weather all week.", entry=entry)
    assert result["accepted"] is False
    assert result["suggested_rating"] == 1
    assert result["offending_span"] == "arable weather"
    assert result["minimal_fix"]
    assert result["appealable"] is True


@pytest.mark.anyio
async def test_an_appeal_can_overturn_a_rejection(monkeypatch: pytest.MonkeyPatch) -> None:
    reject = {"structure_correct": False, "fits": True, "offending_span": "arable weather"}
    judge = _Judge(reject, on_gloss={"structure_correct": True, "fits": True})
    _patch_judge(monkeypatch, judge)
    entry = v2_entry()
    built = ctx.build("produce", entry)

    refused = await ctx.check_production(built, "We had arable weather all week.", entry=entry)
    assert refused["accepted"] is False and refused["appealable"] is True

    appeal = await ctx.appeal_production(
        built, "We had arable weather all week.", entry=entry, gloss="I meant weather for farming"
    )
    assert appeal["appealed"] is True
    assert appeal["accepted"] is True
    assert "the learner says they meant" in judge.prompts[-1].lower()


@pytest.mark.anyio
async def test_a_missing_detector_never_rejects_on_its_own(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A detector that misses is our bug, not the learner's error."""
    judge = _Judge({"structure_correct": True, "fits": True, "offending_span": ""})
    _patch_judge(monkeypatch, judge)
    entry = v2_entry()
    built = ctx.build("produce", entry)
    result = await ctx.check_production(built, "The land here grows nothing but grass.", entry=entry)
    assert result["detected"] is False
    assert result["accepted"] is True


@pytest.mark.anyio
async def test_production_degrades_offline_rather_than_raising(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def boom(*_a: Any, **_kw: Any) -> dict[str, Any]:
        raise RuntimeError("no network")

    from bandready.providers import llm

    monkeypatch.setattr(llm, "chat_json", boom)
    entry = v2_entry()
    built = ctx.build("produce", entry)
    result = await ctx.check_production(built, "Most of the valley is arable land.", entry=entry)
    assert result["checked"] is False
    assert result["suggested_rating"] == 3
    assert result["accepted"] is None


def test_the_never_checked_list_is_in_the_code() -> None:
    """It lives here so no future prompt edit quietly reintroduces one of them."""
    for forbidden in ("topic", "opinion", "truth", "length", "naturalness"):
        assert forbidden in ctx.NEVER_CHECKED
    prompt = ctx.PRODUCTION_PROMPT.lower()
    assert "do not judge the topic" in prompt
    assert "if you are unsure, answer true" in prompt


# ======================================================================================
# 7. Sentence utilities
# ======================================================================================


def test_sentence_around_returns_one_sentence_from_an_essay() -> None:
    essay = (
        "Cities are growing quickly. Much of the country is arable land, but the soil are "
        "poor. This causes problems."
    )
    start = essay.index("the soil are poor")
    found = ctx.sentence_around(essay, start, start + len("the soil are poor"))
    assert found.startswith("Much of the country")
    assert found.endswith("poor.")
    assert "Cities are growing" not in found
