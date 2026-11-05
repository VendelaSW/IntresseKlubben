"""Enkel spärr per användare, i minnet på varje serverinstans."""

import time
from collections import deque

from fastapi import HTTPException


def check_rate_limit(recent: dict[int, deque[float]], user_id: int, limit: int, window_seconds: int, detail: str) -> None:
    """Ger 429 om användaren redan har gjort `limit` anrop de senaste `window_seconds` sekunderna, annars räknas anropet."""
    now = time.monotonic()
    calls = recent[user_id]
    while calls and now - calls[0] > window_seconds:
        calls.popleft()
    if len(calls) >= limit:
        raise HTTPException(status_code=429, detail=detail)
    calls.append(now)
