"""Adopting model weights that already exist on the machine.

The slow-network case is the one that matters: a user who already has Kokoro or
Whisper on disk must never be made to download them again, and adoption must never
damage the copy the other app is using.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from bandready.models_local import LocalHit, adopt, adopt_all, discover

KOKORO = {
    "id": "kokoro-v1.0",
    "dest": "kokoro",
    "files": [{"name": "kokoro-v1.0.onnx"}, {"name": "voices-v1.0.bin"}],
}
WHISPER = {
    "id": "faster-whisper-base",
    "dest": "whisper/base",
    "hf_repo": "Systran/faster-whisper-base",
    "files": [
        {"name": "model.bin"},
        {"name": "config.json"},
        {"name": "tokenizer.json"},
        {"name": "vocabulary.txt"},
    ],
}


def _write(directory: Path, names: list[str], payload: bytes = b"weights") -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    for name in names:
        (directory / name).write_bytes(payload)
    return directory


@pytest.fixture()
def search_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point discovery at a sandbox and away from the developer's real caches.

    ``search_roots`` deliberately always includes the well-known home caches, so the
    only way to keep these tests hermetic is to give it a fake home. Without this the
    suite passes or fails depending on what the machine happens to have downloaded.
    """
    root = tmp_path / "elsewhere"
    root.mkdir()
    fake_home = tmp_path / "home"
    (fake_home / ".cache").mkdir(parents=True)

    monkeypatch.setenv("BANDREADY_MODEL_SEARCH_PATH", str(root))
    monkeypatch.setattr(Path, "home", classmethod(lambda _cls: fake_home))
    for var in ("HF_HOME", "HUGGINGFACE_HUB_CACHE", "TRANSFORMERS_CACHE",
                "OVUI_KOKORO_MODEL", "OVUI_KOKORO_VOICES"):
        monkeypatch.delenv(var, raising=False)
    return root


def test_finds_a_flat_directory_of_weights(search_path: Path, tmp_path: Path) -> None:
    _write(search_path, ["kokoro-v1.0.onnx", "voices-v1.0.bin"])

    hits = discover([KOKORO], models_dir=tmp_path / "models")

    assert [h.artifact_id for h in hits] == ["kokoro-v1.0"]
    assert set(hits[0].files) == {"kokoro-v1.0.onnx", "voices-v1.0.bin"}


def test_finds_weights_one_level_below_a_search_root(search_path: Path, tmp_path: Path) -> None:
    """~/.cache/pipecat holds kokoro-onnx/ — the real-world layout."""
    _write(search_path / "kokoro-onnx", ["kokoro-v1.0.onnx", "voices-v1.0.bin"])

    hits = discover([KOKORO], models_dir=tmp_path / "models")

    assert len(hits) == 1
    assert hits[0].source.name == "kokoro-onnx"


def test_finds_weights_in_a_hugging_face_snapshot(search_path: Path, tmp_path: Path) -> None:
    snapshot = search_path / "models--Systran--faster-whisper-base" / "snapshots" / "abc123"
    _write(snapshot, ["model.bin", "config.json", "tokenizer.json", "vocabulary.txt"])

    hits = discover([WHISPER], models_dir=tmp_path / "models")

    assert [h.artifact_id for h in hits] == ["faster-whisper-base"]


def test_an_incomplete_directory_is_never_adopted(search_path: Path, tmp_path: Path) -> None:
    """A half-finished download elsewhere must not look like a usable artifact."""
    _write(search_path, ["kokoro-v1.0.onnx"])  # voices-v1.0.bin missing

    assert discover([KOKORO], models_dir=tmp_path / "models") == []


def test_an_empty_file_is_never_adopted(search_path: Path, tmp_path: Path) -> None:
    _write(search_path, ["kokoro-v1.0.onnx"])
    (search_path / "voices-v1.0.bin").write_bytes(b"")

    assert discover([KOKORO], models_dir=tmp_path / "models") == []


def test_already_installed_artifacts_are_skipped(search_path: Path, tmp_path: Path) -> None:
    _write(search_path, ["kokoro-v1.0.onnx", "voices-v1.0.bin"])
    models = tmp_path / "models"
    _write(models / "kokoro", ["kokoro-v1.0.onnx", "voices-v1.0.bin"])

    assert discover([KOKORO], models_dir=models) == []


def test_adoption_hard_links_and_leaves_the_source_intact(
    search_path: Path, tmp_path: Path
) -> None:
    source = _write(search_path, ["kokoro-v1.0.onnx", "voices-v1.0.bin"], b"real weights")
    models = tmp_path / "models"

    adopted = adopt_all([KOKORO], models)

    assert len(adopted) == 1
    assert adopted[0]["method"] == "link", "same filesystem should cost no extra disk"

    installed = models / "kokoro" / "kokoro-v1.0.onnx"
    original = source / "kokoro-v1.0.onnx"
    assert installed.read_bytes() == b"real weights"
    assert original.exists(), "the other app's copy must survive"
    assert installed.stat().st_ino == original.stat().st_ino, "hard link, not a copy"


def test_adoption_is_idempotent(search_path: Path, tmp_path: Path) -> None:
    _write(search_path, ["kokoro-v1.0.onnx", "voices-v1.0.bin"])
    models = tmp_path / "models"

    assert len(adopt_all([KOKORO], models)) == 1
    assert adopt_all([KOKORO], models) == [], "second boot has nothing left to do"


def test_adoption_overwrites_a_partial_previous_install(
    search_path: Path, tmp_path: Path
) -> None:
    _write(search_path, ["kokoro-v1.0.onnx", "voices-v1.0.bin"], b"good")
    models = tmp_path / "models"
    _write(models / "kokoro", ["kokoro-v1.0.onnx"], b"truncated")  # incomplete install

    adopted = adopt_all([KOKORO], models)

    assert len(adopted) == 1
    assert (models / "kokoro" / "kokoro-v1.0.onnx").read_bytes() == b"good"
    assert (models / "kokoro" / "voices-v1.0.bin").exists()


def test_adopt_all_survives_an_unreadable_source(
    search_path: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Adoption is a bonus — a failure must never take down startup."""
    _write(search_path, ["kokoro-v1.0.onnx", "voices-v1.0.bin"])

    def boom(*_args: object, **_kwargs: object) -> None:
        raise OSError("permission denied")

    monkeypatch.setattr(os, "link", boom)
    monkeypatch.setattr("shutil.copy2", boom)

    assert adopt_all([KOKORO], tmp_path / "models") == []


def test_nothing_found_is_not_an_error(search_path: Path, tmp_path: Path) -> None:
    assert adopt_all([KOKORO, WHISPER], tmp_path / "models") == []


def test_hit_reports_its_size_in_megabytes(tmp_path: Path) -> None:
    hit = LocalHit("kokoro-v1.0", tmp_path, {}, total_bytes=337 * 1024 * 1024)
    assert hit.total_mb == 337
    assert hit.as_dict()["size_mb"] == 337


def test_adopt_creates_the_nested_destination(search_path: Path, tmp_path: Path) -> None:
    """whisper/base is two levels deep and must be created on demand."""
    snapshot = search_path / "models--Systran--faster-whisper-base" / "snapshots" / "r1"
    _write(snapshot, ["model.bin", "config.json", "tokenizer.json", "vocabulary.txt"])
    models = tmp_path / "models"

    hits = discover([WHISPER], models_dir=models)
    record = adopt(hits[0], WHISPER, models)

    assert Path(record["dest"]) == models / "whisper" / "base"
    assert (models / "whisper" / "base" / "model.bin").exists()
