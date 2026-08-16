"""Reading a ``*_json`` column back (``bandready.db.jsoncol``).

The contract is "degrade, never raise": a stored payload that is missing, empty, corrupt
or the wrong shape must come back as the caller's fallback, because a ``*_json`` column
that 500s a request is the failure this helper exists to prevent.
"""

from __future__ import annotations

import pytest

from bandready.db.jsoncol import loads


def test_a_stored_string_is_decoded() -> None:
    assert loads('{"a": 1}', {}) == {"a": 1}
    assert loads('["a", "b"]', []) == ["a", "b"]


def test_an_already_decoded_value_passes_straight_through() -> None:
    """SQLite hands over a str; a fixture or an in-memory row hands over the object."""
    payload = {"a": 1}
    assert loads(payload, {}) is payload


def test_a_string_is_never_treated_as_an_already_decoded_string() -> None:
    # `isinstance("…", type(""))` is true, so without the str guard a JSON string column
    # with a str fallback would skip decoding entirely.
    assert loads('"hello"', "") == "hello"


@pytest.mark.parametrize("raw", [None, "", "   "])
def test_missing_and_empty_give_the_fallback(raw: object) -> None:
    assert loads(raw, {"seed": True}) == {"seed": True}


def test_corrupt_json_gives_the_fallback_rather_than_raising() -> None:
    assert loads("{not json", {}) == {}
    assert loads("{not json", []) == []


def test_a_decoded_value_of_the_wrong_shape_gives_the_fallback() -> None:
    """The fallback doubles as the expected type, so callers need no type check."""
    assert loads('["a"]', {}) == {}
    assert loads('{"a": 1}', []) == []
    assert loads("42", {}) == {}


@pytest.mark.parametrize("raw", [42, 4.2, object(), b'{"a": 1}'])
def test_an_undecodable_type_gives_the_fallback(raw: object) -> None:
    assert loads(raw, {}) == {}
