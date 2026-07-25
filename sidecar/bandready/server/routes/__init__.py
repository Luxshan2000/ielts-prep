"""Route modules.

``bandready.server.app`` auto-discovers every module in this package and includes its
module-level ``router``. Adding a route family means adding a file here — never editing
``app.py``::

    # bandready/server/routes/writing.py
    from fastapi import APIRouter
    router = APIRouter(prefix="/api/v1/writing", tags=["writing"])
"""

from __future__ import annotations
