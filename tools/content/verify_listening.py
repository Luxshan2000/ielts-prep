"""Independent post-merge audit of the merged listening bank (L-V1).

Deliberately does NOT import tools.content.merge_listening. The merger self-reports its
own lint as clean; this re-derives every claim from the merged JSONL alone so a bug shared
between author and merger cannot hide. Exit code is the number of hard failures.

    uv run --project sidecar python -m tools.content.verify_listening
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PACK = REPO / "content" / "core-en"
DATA = PACK / "data"
MEDIA = PACK / "media"

# The 54 ids Kokoro v1.0 actually ships, read off voices-v1.0.bin at audit time.
KOKORO_VOICES = {
    "af_alloy", "af_aoede", "af_bella", "af_heart", "af_jessica", "af_kore",
    "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky", "am_adam",
    "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx",
    "am_puck", "am_santa", "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
    "bm_daniel", "bm_fable", "bm_george", "bm_lewis", "ef_dora", "em_alex",
    "em_santa", "ff_siwis", "hf_alpha", "hf_beta", "hm_omega", "hm_psi",
    "if_sara", "im_nicola", "jf_alpha", "jf_gongitsune", "jf_nezumi",
    "jf_tebukuro", "jm_kumo", "pf_dora", "pm_alex", "pm_santa", "zf_xiaobei",
    "zf_xiaoni", "zf_xiaoxiao", "zf_xiaoyi", "zm_yunjian", "zm_yunxi",
    "zm_yunxia", "zm_yunyang",
}


def _norm(s: str) -> str:
    """Casefold and drop punctuation/space, so '1.30' matches 'from 1.30 onwards'."""
    return "".join(c for c in s.lower() if c.isalnum())


def _rows(name: str) -> list[dict]:
    path = DATA / name
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def main() -> int:
    fails: list[str] = []
    warns: list[str] = []

    scripts = _rows("listening_scripts.jsonl")
    tests = _rows("listening_tests.jsonl")
    by_id = {s["id"]: s for s in scripts}

    # ---- 1. identity ----------------------------------------------------
    ids = [s["id"] for s in scripts]
    for dupe, n in Counter(ids).items():
        if n > 1:
            fails.append(f"duplicate script id {dupe!r} x{n}")
    for dupe, n in Counter(t["id"] for t in tests).items():
        if n > 1:
            fails.append(f"duplicate test id {dupe!r} x{n}")

    # ---- 2. tests resolve, and number 1..40 contiguously ----------------
    for t in tests:
        nums: list[int] = []
        for slot in ("p1_id", "p2_id", "p3_id", "p4_id"):
            sid = t.get(slot)
            s = by_id.get(sid)
            if s is None:
                fails.append(f"{t['id']}.{slot}={sid!r} does not resolve to a script")
                continue
            sj = s["script_json"]
            if isinstance(sj, str):
                sj = json.loads(sj)
            nums += [q["n"] for q in sj["questions"]]
        if nums and sorted(nums) != list(range(1, 41)):
            got = sorted(nums)
            fails.append(
                f"{t['id']} question numbers are not a contiguous 1-40: "
                f"n={len(got)}, min={min(got)}, max={max(got)}, "
                f"missing={sorted(set(range(1, 41)) - set(got))[:8]}, "
                f"dupes={sorted(k for k, v in Counter(got).items() if v > 1)[:8]}"
            )

    # ---- 3. per-question evidence --------------------------------------
    stats = Counter()
    qtypes: Counter[str] = Counter()
    accents: Counter[str] = Counter()
    maps_referenced: set[str] = set()
    voices_used: Counter[str] = Counter()

    for s in scripts:
        sj = s["script_json"]
        if isinstance(sj, str):
            sj = json.loads(sj)
        sid = s["id"]
        accents[s.get("accent_set") or sj.get("accent_set")] += 1
        lines = sj["lines"]
        texts = [ln.get("text") or "" for ln in lines]

        speaker_ids = {sp["id"] for sp in sj["speakers"]}
        for sp in sj["speakers"]:
            v = sp.get("voice")
            voices_used[v] += 1
            if v not in KOKORO_VOICES:
                fails.append(f"{sid}: speaker {sp['id']!r} voice {v!r} is not a Kokoro voice")

        for i, ln in enumerate(lines):
            if ln.get("speaker") not in speaker_ids:
                fails.append(f"{sid}: line {i} speaker {ln.get('speaker')!r} is not declared")

        # Assets are referenced at question.asset.src, but scan the whole script blob for
        # any media path so a future author putting it elsewhere still gets checked --
        # reading shipped a diagram question whose SVG did not exist and cost 4 marks.
        def _walk(o):
            if isinstance(o, dict):
                for v in o.values():
                    yield from _walk(v)
            elif isinstance(o, list):
                for v in o:
                    yield from _walk(v)
            elif isinstance(o, str) and o.startswith("media/") and "." in Path(o).name:
                yield o

        maps_referenced.update(_walk(sj))

        for q in sj["questions"]:
            # every map_labelling question must carry a resolvable asset
            if q.get("type") == "map_labelling":
                src = ((q.get("asset") or {}) or {}).get("src") if isinstance(q.get("asset"), dict) else None
                if not src:
                    fails.append(f"{sid}#{q['n']}: map_labelling question has no asset.src")
            qn = f"{sid}#{q['n']}"
            qtypes[q.get("type", "?")] += 1
            stats["questions"] += 1

            ci = q.get("cue_line_index")
            if ci is None or not (0 <= ci < len(lines)):
                fails.append(f"{qn}: cue_line_index {ci!r} out of range 0..{len(lines) - 1}")
                continue
            cue = texts[ci]

            te = q.get("teaching")
            if not te:
                warns.append(f"{qn}: no teaching payload")
                continue
            stats["teaching"] += 1

            # answer_quote must appear verbatim in ITS OWN script's cue line
            aq = te.get("answer_quote")
            if aq:
                stats["quotes"] += 1
                if aq in cue:
                    stats["quotes_ok"] += 1
                else:
                    anywhere = next((j for j, t in enumerate(texts) if aq in t), None)
                    fails.append(
                        f"{qn}: answer_quote not verbatim in cue line {ci}"
                        + (f" (found verbatim at line {anywhere} instead)" if anywhere is not None
                           else " (not found verbatim anywhere in the script)")
                    )

            sp = te.get("signpost") or {}
            ph, li = sp.get("phrase"), sp.get("line_index")
            if ph:
                stats["signposts"] += 1
                if li is not None and 0 <= li < len(texts) and ph in texts[li]:
                    stats["signposts_ok"] += 1
                else:
                    fails.append(f"{qn}: signpost {ph!r} not verbatim at line {li}")

            di = te.get("distraction") or {}
            sig, dli = di.get("signal"), di.get("decoy_line_index")
            if sig:
                stats["distractions"] += 1
                if dli is not None and 0 <= dli < len(texts) and sig in texts[dli]:
                    stats["distractions_ok"] += 1
                else:
                    fails.append(f"{qn}: distraction signal {sig!r} not verbatim at line {dli}")

            # free-text answer keys should be audible in the cue line
            akeys = [a for alt in (q.get("answers") or []) for a in alt]
            lettery = all(len(a) <= 2 and a.strip().upper() == a.strip() for a in akeys if a)
            if akeys and not lettery:
                stats["freetext"] += 1
                if any(_norm(a) in _norm(cue) for a in akeys):
                    stats["freetext_ok"] += 1
                elif any(ch.isdigit() for a in akeys for ch in a):
                    # Numeric keys are spoken as words in real Part 1 dictation
                    # ("oh one four seven two, double three oh") so they never match
                    # literally. Counted, not warned -- checked by ear in the render step.
                    stats["freetext_spoken_as_words"] += 1
                else:
                    warns.append(f"{qn}: no answer key {akeys!r} literally spoken in its cue line")

    # ---- 4. map assets on disk -----------------------------------------
    missing_maps = [rel for rel in sorted(maps_referenced) if not (PACK / rel).exists()]
    for m in missing_maps:
        fails.append(f"map asset referenced but MISSING on disk: {m}")

    on_disk = {p.name for p in (MEDIA / "listening" / "maps").glob("*.svg")}
    used_names = {Path(r).name for r in maps_referenced}
    for orphan in sorted(on_disk - used_names):
        warns.append(f"map asset ships but no question references it: {orphan}")

    # ---- report ---------------------------------------------------------
    print(f"scripts {len(scripts)}  tests {len(tests)}")
    print(f"accents {dict(sorted(accents.items()))}")
    print(f"questions {stats['questions']}  with teaching {stats['teaching']}")
    print(f"answer_quote verbatim   {stats['quotes_ok']}/{stats['quotes']}")
    print(f"signpost verbatim       {stats['signposts_ok']}/{stats['signposts']}")
    print(f"distraction verbatim    {stats['distractions_ok']}/{stats['distractions']}")
    print(
        f"free-text key audible   {stats['freetext_ok']}/{stats['freetext']}"
        f" (+{stats['freetext_spoken_as_words']} numeric, spoken as words)"
    )
    print(f"question types {dict(sorted(qtypes.items()))}")
    print(f"map assets referenced {len(maps_referenced)}, on disk {len(on_disk)}, missing {len(missing_maps)}")
    print(f"voices used {dict(sorted(voices_used.items()))}")

    if warns:
        print(f"\nWARN ({len(warns)}):")
        for w in warns[:40]:
            print("  -", w)
        if len(warns) > 40:
            print(f"  ... and {len(warns) - 40} more")
    if fails:
        print(f"\nFAIL ({len(fails)}):")
        for f in fails[:60]:
            print("  -", f)
        if len(fails) > 60:
            print(f"  ... and {len(fails) - 60} more")
    else:
        print("\nno hard failures")
    return len(fails)


if __name__ == "__main__":
    sys.exit(min(main(), 100))
