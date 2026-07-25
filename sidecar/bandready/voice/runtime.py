"""Live speaking-session runtime: signaling, event fan-out, teardown (02 §2.4).

One speaking session = one WebRTC call = one ``PipelineTask``. The sidecar runs
``workers=1``, so the registry below is a plain in-process dict and "is a session live?"
is a dict lookup (the `409 conflict` of 18 §4.7).

Teardown is the load-bearing part (R2-24, canonical): the finally-block flattens
``transcript_json`` into ``speaking_turns`` rows **synchronously, in the same
transaction, BEFORE** writing ``status='complete'``. No background job, no lazy
projection — any session marked complete is guaranteed to have its turn rows. A teardown
that crashes mid-flatten leaves ``status='active'`` for the startup sweep to redo
(idempotent: the flatten deletes and re-inserts by ``(session_id, turn_index)``).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from datetime import UTC, datetime
from typing import Any

from ulid import ULID

from bandready.server.errors import ApiError
from bandready.voice import metrics as metrics_mod
from bandready.voice.recorder import TurnAudioRecorder
from bandready.voice.state_machine import (
    CardBundle,
    SpeakingStateMachine,
    Timings,
)
from bandready.voice.transcript import TranscriptAccumulator

_log = logging.getLogger("bandready.voice.runtime")

__all__ = [
    "LiveSession",
    "active",
    "clear",
    "drop",
    "finalize",
    "get",
    "handle_offer",
    "handle_patch",
    "inject_transcript",
    "register",
    "require",
    "reset",
]

TIMER_TICK_S = 1.0
EVENT_QUEUE_MAX = 256


def _now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


# --------------------------------------------------------------------------- session


class LiveSession:
    """In-memory state of one running speaking session."""

    def __init__(
        self,
        session_id: str,
        activity: str,
        part: int | None,
        bundle: CardBundle,
        timings: Timings | None = None,
    ) -> None:
        self.session_id = session_id
        self.activity = activity
        self.part = part
        self.bundle = bundle
        self.started_at = _now_iso()
        self.ended = False

        self.recorder = TurnAudioRecorder(session_id)
        self.accumulator = TranscriptAccumulator(
            stamp=self._stamp,
            on_assistant_turn=self._assistant_turn,
            on_user_turn=self._user_turn,
        )
        self.state = SpeakingStateMachine(
            session_id,
            activity=activity,
            part=part,
            bundle=bundle,
            timings=timings,
            emit=self.emit,
            speak=self.speak,
            gate=self.set_gate,
        )

        self.task: Any = None          # PipelineTask, once the call connects
        self.pipeline: Any = None      # BuiltPipeline
        self.transport: Any = None
        self.report_id: str | None = None
        self.error: dict[str, Any] | None = None

        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self._last_state: dict[str, Any] | None = None
        self._last_cue_card: dict[str, Any] | None = None
        self._ticker: asyncio.Task[Any] | None = None
        #: Scripted lines produced before the WebRTC peer connected (the greeting).
        self.pending_lines: list[str] = []

    # ------------------------------------------------------------------ stamps

    def _stamp(self) -> dict[str, Any]:
        bundle = self.bundle
        card_id = bundle.card_ids[0] if bundle.card_ids else None
        return {
            "part": self.state.current_part,
            "phase": self.state.phase,
            "card_id": card_id,
        }

    def _assistant_turn(self, text: str, t_ms: int) -> None:
        self._spawn(self.state.on_assistant_turn(text, t_ms))

    def _user_turn(self, text: str, t_ms: int, speech_s: float) -> None:
        index = self.accumulator.last_user_index()
        if index is not None:
            turn = self.accumulator.turns[index]
            self._spawn(self._record_audio(index, turn))
        self._spawn(self.state.on_user_turn(text, t_ms, speech_s))

    async def _record_audio(self, index: int, turn: dict[str, Any]) -> None:
        filename = await self.recorder.commit_turn(
            index + 1, turn.get("segments") or [], turn.get("card_id")
        )
        self.accumulator.set_audio_file(index, filename)

    @staticmethod
    def _spawn(coro: Any) -> None:
        try:
            asyncio.get_running_loop().create_task(coro)
        except RuntimeError:  # no loop — synchronous test context
            coro.close()

    # ------------------------------------------------------------------ events

    async def emit(self, event: dict[str, Any]) -> None:
        """Fan an 18 §5 event out to every attached WebSocket."""
        if event.get("type") == "state":
            self._last_state = event
        elif event.get("type") == "cue_card":
            self._last_cue_card = event
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:  # a stalled client must not stall the session
                _log.warning("session %s: event queue full, dropping", self.session_id)

    def attach(self) -> asyncio.Queue[dict[str, Any]]:
        """Subscribe a WebSocket; the current state (and cue card) are replayed."""
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=EVENT_QUEUE_MAX)
        if self._last_state is not None:
            queue.put_nowait(self._last_state)
        if self._last_cue_card is not None:
            queue.put_nowait(self._last_cue_card)
        for event in self.state.timer_snapshot():
            queue.put_nowait(event)
        self._subscribers.add(queue)
        return queue

    def detach(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self._subscribers.discard(queue)

    # ------------------------------------------------------------------ pipeline

    async def speak(self, line: str) -> None:
        """Queue a scripted examiner line (bypasses STT and the LLM entirely)."""
        task = self.task
        if task is None:
            self.pending_lines.append(line)
            _log.debug("session %s: scripted line queued before connect", self.session_id)
            return
        from pipecat.frames.frames import TTSSpeakFrame

        await task.queue_frames([TTSSpeakFrame(line)])

    async def flush_pending(self) -> None:
        """Speak the lines scripted before the peer connected (the greeting).

        Called from ``on_client_connected`` — queueing TTS frames before the transport is
        up loses the audio, which is why the greeting waits here.
        """
        pending, self.pending_lines = self.pending_lines, []
        for line in pending:
            with contextlib.suppress(Exception):
                await self.speak(line)

    def set_gate(self, is_open: bool) -> None:
        gate = getattr(self.pipeline, "gate", None)
        if gate is not None:
            gate.set_open(is_open)

    async def start(self) -> None:
        """Enter the first phase and begin ticking timers to the renderer."""
        await self.state.start()
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        self._ticker = loop.create_task(self._tick())

    async def _tick(self) -> None:
        try:
            while not self.ended and self.state.is_live:
                await asyncio.sleep(TIMER_TICK_S)
                for event in self.state.timer_snapshot():
                    await self.emit(event)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            _log.exception("timer ticker failed for session %s", self.session_id)

    async def shutdown(self) -> None:
        self.ended = True
        if self._ticker is not None and not self._ticker.done():
            self._ticker.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._ticker
        await self.state.shutdown()
        if self.task is not None:
            with contextlib.suppress(Exception):
                await self.task.cancel()
        with contextlib.suppress(Exception):
            self.recorder.close()

    # ------------------------------------------------------------------ record

    def transcript(self) -> dict[str, Any]:
        return self.accumulator.record()

    def metrics(self) -> dict[str, Any]:
        return metrics_mod.compute_transcript_metrics(self.transcript())


# --------------------------------------------------------------------------- registry

_sessions: dict[str, LiveSession] = {}


def register(session: LiveSession) -> LiveSession:
    _sessions[session.session_id] = session
    return session


def get(session_id: str) -> LiveSession | None:
    return _sessions.get(session_id)


def require(session_id: str) -> LiveSession:
    live = _sessions.get(session_id)
    if live is None:
        raise ApiError(404, "not_found", "that speaking session is not live")
    return live


def active() -> LiveSession | None:
    """The one live session, if any (workers=1 — 18 §4.7's 409 source)."""
    for live in _sessions.values():
        if not live.ended:
            return live
    return None


def drop(session_id: str) -> None:
    _sessions.pop(session_id, None)


async def clear() -> None:
    """Tear every live session down (shutdown / tests)."""
    for live in list(_sessions.values()):
        with contextlib.suppress(Exception):
            await live.shutdown()
    _sessions.clear()


def reset() -> None:
    """Drop every live session without awaiting — test fixtures and hard shutdown."""
    for live in list(_sessions.values()):
        live.ended = True
        with contextlib.suppress(Exception):
            live.state.cancel_timers()
        with contextlib.suppress(Exception):
            live.recorder.close()
    _sessions.clear()


# --------------------------------------------------------------------------- signaling

_handler: Any = None


def _request_handler() -> Any:
    """Module-level ``SmallWebRTCRequestHandler``, constructed once.

    ``ice_servers=[]`` is correct and intentional: the peer is the Electron renderer on
    loopback, so no STUN/TURN will ever be needed.
    """
    global _handler
    if _handler is None:
        from bandready.voice.pipeline import require_pipecat

        require_pipecat()
        from pipecat.transports.smallwebrtc.request_handler import (
            SmallWebRTCRequestHandler,
        )

        _handler = SmallWebRTCRequestHandler(ice_servers=[])
    return _handler


async def handle_offer(session_id: str, body: dict[str, Any]) -> dict[str, Any] | None:
    """``POST /api/v1/speaking/sessions/{id}/offer`` — SDP offer → answer."""
    from bandready.voice.pipeline import build_speaking_task, transport_params

    require_pipecat_or_raise()
    live = require(session_id)

    from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
    from pipecat.transports.smallwebrtc.request_handler import SmallWebRTCRequest
    from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport

    if "sdp" not in body or "type" not in body:
        raise ApiError(422, "validation_error", "an SDP offer needs 'sdp' and 'type'")

    request = SmallWebRTCRequest(
        sdp=body["sdp"],
        type=body["type"],
        pc_id=body.get("pc_id") or body.get("pcId"),
        restart_pc=bool(body.get("restart_pc") or body.get("restartPc") or False),
    )

    async def on_connection(connection: SmallWebRTCConnection) -> None:
        transport = SmallWebRTCTransport(
            webrtc_connection=connection, params=transport_params()
        )
        live.transport = transport

        @transport.event_handler("on_client_connected")
        async def _on_connected(_transport: Any, _client: Any) -> None:
            # `start()` already ran when the session was created (so the renderer had a
            # state to render); it is idempotent, so this only matters on a reconnect.
            await live.start()
            await live.flush_pending()

        @transport.event_handler("on_client_disconnected")
        async def _on_disconnected(_transport: Any, _client: Any) -> None:
            if live.task is not None:
                with contextlib.suppress(Exception):
                    await live.task.cancel()

        asyncio.create_task(_run_call(live, transport, build_speaking_task))

    return await _request_handler().handle_web_request(request, on_connection)


async def handle_patch(session_id: str, body: dict[str, Any]) -> None:
    """``PATCH`` to the **same** ``/offer`` URL — trickle ICE (G4).

    Both key spellings are accepted (``sdp_mid``/``sdpMid``,
    ``sdp_mline_index``/``sdpMLineIndex``, ``pc_id``/``pcId``); a connection that sticks
    in ``connecting`` on some networks is the symptom of getting this wrong.
    """
    require_pipecat_or_raise()
    from pipecat.transports.smallwebrtc.request_handler import (
        IceCandidate,
        SmallWebRTCPatchRequest,
    )

    candidates = []
    for raw in body.get("candidates") or []:
        if not isinstance(raw, dict):
            continue
        mline = raw.get("sdp_mline_index")
        if mline is None:
            mline = raw.get("sdpMLineIndex")
        candidates.append(
            IceCandidate(
                candidate=str(raw.get("candidate") or ""),
                sdp_mid=str(raw.get("sdp_mid") or raw.get("sdpMid") or ""),
                sdp_mline_index=int(mline or 0),
            )
        )
    request = SmallWebRTCPatchRequest(
        pc_id=str(body.get("pc_id") or body.get("pcId") or ""), candidates=candidates
    )
    from fastapi import HTTPException

    try:
        await _request_handler().handle_patch_request(request)
    except HTTPException as exc:
        if exc.status_code == 404:
            raise ApiError(
                404,
                "not_found",
                "no WebRTC peer connection with that pc_id — POST the offer first",
            ) from exc
        raise


def require_pipecat_or_raise() -> None:
    from bandready.voice.pipeline import require_pipecat

    require_pipecat()


async def _run_call(live: LiveSession, transport: Any, build: Any) -> None:
    """Run one call to completion; the finally-block owns teardown (02 §2.4)."""
    from pipecat.pipeline.runner import PipelineRunner

    try:
        built = build(transport, live.state, live.accumulator, live.recorder)
        live.pipeline = built
        live.task = built.task
        # Pending scripted lines are flushed by on_client_connected, not here.
        await PipelineRunner(handle_sigint=False).run(built.task)
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001
        _log.exception("speaking session %s failed", live.session_id)
        live.error = {"detail": str(exc), "code": "internal"}
        with contextlib.suppress(Exception):
            await live.state.fail(str(exc))
    finally:
        with contextlib.suppress(Exception):
            await finalize(live.session_id)


# --------------------------------------------------------------------------- teardown


def inject_transcript(session_id: str, record: dict[str, Any]) -> None:
    """Headless test seam: install a transcript without running WebRTC.

    14-testing-strategy.md's route-level tests exercise the whole lifecycle
    (start → transcript → end → report) without a real peer connection; this is the one
    supported way to do that.
    """
    live = require(session_id)
    live.accumulator.merge(record)


async def finalize(session_id: str, status: str = "complete") -> dict[str, Any]:
    """Persist transcript, metrics and turn rows, then mark the session (R2-24).

    Idempotent: safe to call from the runner's finally-block and from
    ``POST …/end`` — whichever gets there first wins, the second is a no-op update.
    """
    live = _sessions.get(session_id)
    if live is None:
        # The session is already off the registry: either `POST …/end` finalized it and
        # the runner's finally-block is arriving second, or this is a stray call. Either
        # way, never overwrite a finished record with an empty transcript.
        done = _finished_snapshot(session_id)
        if done is not None:
            return done

    record = live.transcript() if live is not None else {"turns": []}
    computed = metrics_mod.compute_transcript_metrics(record)
    final_state = live.state.phase if live is not None else "ABORTED"
    if live is not None and not record.get("turns"):
        status = "aborted" if status == "complete" else status

    result = _persist(session_id, record, computed, final_state, status)

    if live is not None:
        await live.shutdown()
        drop(session_id)
    return result


def _finished_snapshot(session_id: str) -> dict[str, Any] | None:
    """The already-persisted result when this session is no longer ``active``."""
    from sqlalchemy import func, select

    from bandready.db import models as m
    from bandready.db.engine import session_scope

    with session_scope() as s:
        row = s.get(m.SpeakingSession, session_id)
        if row is None or row.status == "active":
            return None
        turns = s.execute(
            select(func.count())
            .select_from(m.SpeakingTurn)
            .where(m.SpeakingTurn.session_id == session_id)
        ).scalar()
        return {
            "session_id": session_id,
            "status": row.status,
            "state": row.state,
            "turns": int(turns or 0),
        }


def _persist(
    session_id: str,
    record: dict[str, Any],
    computed: dict[str, Any],
    final_state: str,
    status: str,
) -> dict[str, Any]:
    import json

    from sqlalchemy import delete as sa_delete

    from bandready.db import models as m
    from bandready.db.engine import session_scope

    with session_scope() as s:
        row = s.get(m.SpeakingSession, session_id)
        if row is None:
            raise ApiError(404, "not_found", "no speaking session with that id")
        row.transcript_json = json.dumps(record, ensure_ascii=False)
        row.metrics_json = json.dumps(computed, ensure_ascii=False)
        row.state = final_state

        # --- flatten FIRST, in this transaction, before status='complete' (R2-24) ---
        s.execute(
            sa_delete(m.SpeakingTurn).where(m.SpeakingTurn.session_id == session_id)
        )
        for index, turn in enumerate(record.get("turns") or []):
            segments = turn.get("segments") or []
            dur = None
            if segments:
                dur = int(segments[-1]["t_end_ms"]) - int(segments[0]["t_start_ms"])
            per_turn = next(
                (
                    t
                    for t in computed.get("turns", [])
                    if t.get("turn_index") == index
                ),
                None,
            )
            s.add(
                m.SpeakingTurn(
                    id=f"st_{ULID()}",
                    session_id=session_id,
                    turn_index=index,
                    role=str(turn.get("role") or "user"),
                    t_ms=int(turn.get("t_ms") or 0),
                    dur_ms=dur,
                    segments_json=json.dumps(segments) if segments else None,
                    audio_path=turn.get("audio_file"),
                    metrics_json=json.dumps(per_turn) if per_turn else None,
                    text=str(turn.get("text") or ""),
                )
            )
        row.status = status

        envelope = s.get(m.PracticeSession, session_id)
        if envelope is not None and envelope.ended_at is None:
            envelope.ended_at = _now_iso()
            started = envelope.started_at or envelope.ended_at
            envelope.duration_s = _elapsed_s(started, envelope.ended_at)
            envelope.summary_json = json.dumps(
                {
                    "turns": len(record.get("turns") or []),
                    "speech_secs": computed.get("session", {}).get("speech_secs", 0),
                }
            )

    return {
        "session_id": session_id,
        "status": status,
        "state": final_state,
        "turns": len(record.get("turns") or []),
    }


def _elapsed_s(started: str, ended: str) -> int:
    def parse(value: str) -> datetime | None:
        try:
            return datetime.fromisoformat(value.rstrip("Z") + "+00:00" if value.endswith("Z") else value)
        except (ValueError, AttributeError):
            return None

    a, b = parse(started), parse(ended)
    if a is None or b is None:
        return 0
    return max(0, int((b - a).total_seconds()))
