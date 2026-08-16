"""In-process job manager for one-shot long-running work (18-api-contract.md §3).

`workers=1` is a hard contract, so a plain asyncio task registry is enough — no queue,
no broker. Every long operation that is not a live speaking session goes through here:

    job_id = job_manager.submit("writing_eval", lambda jid: evaluate(attempt_id, jid))
    ...
    job_manager.set_progress(job_id, 42, "scoring criteria…")

The coroutine factory may take zero arguments or exactly one (the job id).
"""

from __future__ import annotations

import asyncio
import inspect
import logging
from collections.abc import Awaitable, Callable
from concurrent.futures import Future
from typing import Any

from ulid import ULID

from bandready.timeutil import iso

_log = logging.getLogger("bandready.jobs")

JobFactory = Callable[..., Awaitable[Any]]

STATES = ("queued", "running", "done", "error", "cancelled")
TERMINAL = ("done", "error", "cancelled")

# Closed list per 18 §3. Unknown kinds are still accepted (logged) so a module in
# development is never blocked, but the contract expects one of these.
KNOWN_KINDS = (
    "writing_eval",
    "writing_prompt_generate",
    "writing_model_answer",
    "reading_generate",
    "listening_generate",
    "listening_render",
    "pron_analyze",
    "model_download",
    "provider_setup",
    "pack_import",
    # 11 §13 data portability — settings → "Export my data".
    "data_export",
)

MAX_JOBS = 200

#: How long a worker thread waits for the loop thread to create its task.
SPAWN_TIMEOUT_S = 5.0


class JobManager:
    """Tracks asyncio-backed jobs and renders them in the wire shape of 18 §3."""

    def __init__(self) -> None:
        self._jobs: dict[str, dict[str, Any]] = {}
        self._tasks: dict[str, asyncio.Task[Any]] = {}
        self._started = False
        self._loop: asyncio.AbstractEventLoop | None = None

    # --- lifecycle ----------------------------------------------------------

    def start(self) -> None:
        self._started = True
        try:
            # `start()` runs inside the lifespan, so this is the loop that serves requests.
            # Remembering it is what lets a *sync* route handler submit a job (see _spawn).
            self._loop = asyncio.get_running_loop()
        except RuntimeError:  # pragma: no cover — start() called outside a loop (tests)
            self._loop = None
        _log.info("job manager started")

    async def shutdown(self, timeout: float = 3.0) -> None:
        tasks = [t for t in self._tasks.values() if not t.done()]
        for t in tasks:
            t.cancel()
        if tasks:
            await asyncio.wait(tasks, timeout=timeout)
        self._started = False
        self._loop = None

    # --- submission ---------------------------------------------------------

    def submit(self, kind: str, factory: JobFactory) -> str:
        """Start `factory()` as a background task; return the job id immediately."""
        if kind not in KNOWN_KINDS:
            _log.warning("submitting job of undeclared kind %r (18 §3 owns the list)", kind)
        job_id = f"job_{ULID()}"
        now = iso()
        self._jobs[job_id] = {
            "id": job_id,
            "kind": kind,
            "state": "queued",
            "progress_pct": None,
            "detail": None,
            "result": None,
            "error": None,
            "created_at": now,
            "updated_at": now,
        }
        self._evict()
        self._tasks[job_id] = self._spawn(job_id, factory)
        return job_id

    def _spawn(self, job_id: str, factory: JobFactory) -> asyncio.Task[Any]:
        """Create the job task on the serving loop, wherever ``submit`` was called from.

        FastAPI runs a ``def`` (non-async) route handler in an AnyIO worker thread, and that
        thread has no event loop of its own — ``asyncio.get_event_loop()`` raises there. Every
        sync route that submits a job (``POST /packs/import``, ``POST /data/export``, the
        listening render routes …) would answer 500. Hopping back to the loop thread with
        ``call_soon_threadsafe`` fixes it and keeps ``self._tasks`` a homogeneous registry of
        real ``asyncio.Task`` objects, which ``shutdown`` and ``cancel`` both rely on.
        """
        try:
            running: asyncio.AbstractEventLoop | None = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        loop = self._loop or running
        if loop is None:  # pragma: no cover — pre-start submit in a bare unit test
            loop = asyncio.get_event_loop()
        if running is loop:
            return loop.create_task(self._run(job_id, factory))

        holder: Future[asyncio.Task[Any]] = Future()

        def create() -> None:
            try:
                holder.set_result(loop.create_task(self._run(job_id, factory)))
            except Exception as exc:  # noqa: BLE001 — pragma: no cover, loop already closing
                holder.set_exception(exc)

        loop.call_soon_threadsafe(create)
        return holder.result(timeout=SPAWN_TIMEOUT_S)

    async def _run(self, job_id: str, factory: JobFactory) -> None:
        job = self._jobs[job_id]
        job["state"] = "running"
        job["updated_at"] = iso()
        try:
            coro = self._invoke(factory, job_id)
            result = await coro
            job["result"] = result
            job["state"] = "done"
            if job["progress_pct"] is None:
                job["progress_pct"] = 100
        except asyncio.CancelledError:
            job["state"] = "cancelled"
            job["error"] = {"detail": "cancelled", "code": "job_failed"}
            job["updated_at"] = iso()
            raise
        except Exception as exc:  # noqa: BLE001 — any failure becomes a job error
            from bandready.server.errors import ApiError

            code = exc.code if isinstance(exc, ApiError) else "job_failed"
            _log.exception("job %s (%s) failed", job_id, job["kind"])
            job["state"] = "error"
            # An `ApiError` was raised on purpose and its detail is already written for
            # a learner ("could not reach the language model at … — is it running?").
            # Prefixing it with the class name turned that into "ApiError: could not
            # reach …", which is what the UI then showed. Anything else is unplanned,
            # so the type name stays — it is the only clue in a bug report. The full
            # traceback is in the log above either way.
            job["error"] = {
                "detail": str(exc) if isinstance(exc, ApiError) else f"{type(exc).__name__}: {exc}",
                "code": code,
            }
        finally:
            job["updated_at"] = iso()
            self._tasks.pop(job_id, None)

    @staticmethod
    def _invoke(factory: JobFactory, job_id: str) -> Awaitable[Any]:
        if inspect.iscoroutine(factory):  # tolerate a bare coroutine
            return factory  # type: ignore[return-value]
        try:
            sig = inspect.signature(factory)
            takes_arg = len(sig.parameters) >= 1
        except (TypeError, ValueError):  # pragma: no cover — builtins
            takes_arg = False
        return factory(job_id) if takes_arg else factory()

    # --- progress + queries -------------------------------------------------

    def set_progress(
        self, job_id: str, pct: float | None, detail: str | None = None
    ) -> None:
        job = self._jobs.get(job_id)
        if job is None:
            return
        if pct is not None:
            job["progress_pct"] = max(0, min(100, int(pct)))
        if detail is not None:
            job["detail"] = detail
        job["updated_at"] = iso()

    def set_result(self, job_id: str, result: Any) -> None:
        job = self._jobs.get(job_id)
        if job is not None:
            job["result"] = result
            job["updated_at"] = iso()

    def get(self, job_id: str) -> dict[str, Any] | None:
        job = self._jobs.get(job_id)
        return dict(job) if job else None

    def list(
        self,
        kind: str | None = None,
        state: str | None = None,
        limit: int = 50,
        cursor: str | None = None,
    ) -> dict[str, Any]:
        """Newest first; `cursor` is the last id of the previous page (ids are ULIDs,
        so lexical ordering is chronological)."""
        items = sorted(self._jobs.values(), key=lambda j: j["id"], reverse=True)
        if kind:
            items = [j for j in items if j["kind"] == kind]
        if state:
            items = [j for j in items if j["state"] == state]
        if cursor:
            items = [j for j in items if j["id"] < cursor]
        limit = max(1, min(200, int(limit)))
        page = [dict(j) for j in items[:limit]]
        next_cursor = page[-1]["id"] if len(items) > limit and page else None
        return {"items": page, "next_cursor": next_cursor}

    def cancel(self, job_id: str) -> bool:
        """Best-effort cancellation. False when the job is unknown or already terminal."""
        job = self._jobs.get(job_id)
        if job is None or job["state"] in TERMINAL:
            return False
        task = self._tasks.get(job_id)
        if task is not None and not task.done():
            task.cancel()
        else:
            job["state"] = "cancelled"
            job["updated_at"] = iso()
        return True

    # --- housekeeping -------------------------------------------------------

    def _evict(self) -> None:
        if len(self._jobs) <= MAX_JOBS:
            return
        terminal = [j for j in self._jobs.values() if j["state"] in TERMINAL]
        terminal.sort(key=lambda j: j["id"])
        for job in terminal[: len(self._jobs) - MAX_JOBS]:
            self._jobs.pop(job["id"], None)

    def clear(self) -> None:
        """Test hook — drop all tracked jobs."""
        self._jobs.clear()
        self._tasks.clear()


job_manager = JobManager()
