"""Fetch the daily Enclose Horse puzzle from the live API, with a disk cache.

The API rejects requests without browser-like headers, so we always send a
``Referer``/``Origin``/``User-Agent``. We are a polite client: every fetched day is
cached to disk and re-read from there on subsequent calls — no polling.
"""

from __future__ import annotations

import datetime as _dt
import json
import re
from pathlib import Path

import requests

BASE_URL = "https://enclose.horse/api/daily/{date}"

# The endpoint 403s without a browser-like fingerprint; these three headers are
# enough (verified live).
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Referer": "https://enclose.horse/",
    "Origin": "https://enclose.horse",
}

_DEFAULT_CACHE_DIR = Path(__file__).resolve().parent.parent / "cache"
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _resolve_date(date: str) -> str:
    """Turn ``"today"`` into a ``YYYY-MM-DD`` string; validate explicit dates."""
    if date == "today":
        return _dt.date.today().isoformat()
    if not _DATE_RE.match(date):
        raise ValueError(f"date must be 'today' or YYYY-MM-DD, got {date!r}")
    return date


def fetch_daily(
    date: str = "today",
    cache_dir: Path | str | None = None,
    *,
    force: bool = False,
) -> dict:
    """Return the raw puzzle JSON for ``date`` (``"today"`` or ``YYYY-MM-DD``).

    Reads from the on-disk cache first; only hits the network on a miss (or when
    ``force`` is set). The cached file is the API's JSON body verbatim.
    """
    resolved = _resolve_date(date)
    cache_root = Path(cache_dir) if cache_dir is not None else _DEFAULT_CACHE_DIR
    cache_file = cache_root / f"{resolved}.json"

    if cache_file.exists() and not force:
        return json.loads(cache_file.read_text(encoding="utf-8"))

    resp = requests.get(
        BASE_URL.format(date=resolved), headers=_HEADERS, timeout=30
    )
    resp.raise_for_status()
    data = resp.json()

    cache_root.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return data
