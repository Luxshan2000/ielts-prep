"""The stored-timestamp contract (``bandready.timeutil``).

The load-bearing property is the one the SRS due-queue SQL relies on: every timestamp
this app stores is the same fixed-width UTC rendering, so comparing two of them as
*strings* gives the same answer as comparing them as instants. If that ever stops being
true the due queue returns the wrong cards and nothing raises, so it is pinned here.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

import pytest

from bandready.timeutil import iso, parse_iso, seconds_since, utcnow

# --------------------------------------------------------------------------------------
# iso — the format itself
# --------------------------------------------------------------------------------------


def test_iso_is_millisecond_utc_with_a_z_suffix() -> None:
    assert iso(datetime(2026, 8, 15, 9, 41, 7, 123456, tzinfo=UTC)) == "2026-08-15T09:41:07.123Z"


def test_iso_truncates_microseconds_it_does_not_round() -> None:
    # A rounding helper would carry 999999 up to the next second and change the ordering
    # of two timestamps a microsecond apart.
    assert iso(datetime(2026, 8, 15, 9, 41, 7, 999999, tzinfo=UTC)).endswith("07.999Z")


def test_iso_pads_so_every_stored_timestamp_is_the_same_width() -> None:
    widths = {
        len(iso(datetime(2026, 1, 2, 3, 4, 5, micro, tzinfo=UTC)))
        for micro in (0, 1000, 90000, 999000, 999999)
    }
    assert widths == {24}


def test_iso_defaults_to_now() -> None:
    before = utcnow() - timedelta(seconds=1)
    stamped = parse_iso(iso())
    assert stamped is not None
    assert before <= stamped <= utcnow() + timedelta(seconds=1)


def test_iso_treats_a_naive_datetime_as_utc() -> None:
    naive = datetime(2026, 8, 15, 9, 41, 7, 123456)  # noqa: DTZ001 — a naive one is the point
    assert iso(naive) == iso(naive.replace(tzinfo=UTC))


def test_iso_converts_an_offset_datetime_rather_than_stamping_the_offset() -> None:
    kolkata = datetime(2026, 8, 15, 15, 11, 7, 123456, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    assert iso(kolkata) == "2026-08-15T09:41:07.123Z"


# --------------------------------------------------------------------------------------
# The reason the format is what it is
# --------------------------------------------------------------------------------------


def test_string_order_equals_chronological_order() -> None:
    """The due-queue SQL compares these as strings. This is why that is correct."""
    base = datetime(2026, 8, 15, 9, 41, 7, 0, tzinfo=UTC)
    moments = [
        base,
        base + timedelta(milliseconds=1),
        base + timedelta(seconds=1),
        base + timedelta(minutes=1),
        base + timedelta(hours=1),
        base + timedelta(days=1),
        base + timedelta(days=200),
        base.replace(year=2028, month=1, day=1),
    ]
    stamps = [iso(m) for m in moments]
    assert stamps == sorted(stamps)
    # …and the same instants written from other offsets sort identically.
    shifted = [iso(m.astimezone(timezone(timedelta(hours=-8)))) for m in moments]
    assert shifted == stamps


# --------------------------------------------------------------------------------------
# parse_iso — the reader, which must never raise
# --------------------------------------------------------------------------------------


def test_iso_round_trips_through_parse_iso() -> None:
    moment = datetime(2026, 8, 15, 9, 41, 7, 123000, tzinfo=UTC)
    assert parse_iso(iso(moment)) == moment


def test_parse_iso_accepts_the_z_suffix_datetime_itself_refuses() -> None:
    assert parse_iso("2026-08-15T09:41:07.123Z") == datetime(
        2026, 8, 15, 9, 41, 7, 123000, tzinfo=UTC
    )


def test_parse_iso_assumes_utc_when_the_offset_is_missing() -> None:
    assert parse_iso("2026-08-15T09:41:07") == datetime(2026, 8, 15, 9, 41, 7, tzinfo=UTC)


def test_parse_iso_normalises_an_explicit_offset_to_utc() -> None:
    assert parse_iso("2026-08-15T15:11:07+05:30") == datetime(2026, 8, 15, 9, 41, 7, tzinfo=UTC)


@pytest.mark.parametrize(
    "bad", [None, "", "   ", "not a timestamp", "2026-13-45T99:99:99Z", 5, 5.0, [], {}, object()]
)
def test_parse_iso_never_raises(bad: object) -> None:
    assert parse_iso(bad) is None


# --------------------------------------------------------------------------------------
# seconds_since
# --------------------------------------------------------------------------------------


def test_seconds_since_measures_a_past_stamp() -> None:
    stamp = iso(utcnow() - timedelta(seconds=90))
    assert 85.0 <= seconds_since(stamp) <= 95.0


def test_seconds_since_a_future_stamp_is_zero_not_negative() -> None:
    assert seconds_since(iso(utcnow() + timedelta(hours=1))) == 0.0


@pytest.mark.parametrize("bad", [None, "", "nonsense", 5])
def test_seconds_since_an_unreadable_stamp_is_zero(bad: object) -> None:
    assert seconds_since(bad) == 0.0
