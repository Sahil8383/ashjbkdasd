"""Thin client for the two Elexon BMRS stream endpoints we use."""

import logging
from datetime import UTC, date, datetime, timedelta

import httpx
import pandas as pd

from app.config import ELEXON_BASE_URL

log = logging.getLogger(__name__)

CHUNK_DAYS = 7  # keep each request small; the stream endpoints return everything in one body


def _get(client: httpx.Client, path: str, params: dict, retries: int = 3) -> list[dict]:
    for attempt in range(1, retries + 1):
        try:
            resp = client.get(f"{ELEXON_BASE_URL}{path}", params=params, timeout=60)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as exc:
            log.warning("elexon %s failed (attempt %d/%d): %s", path, attempt, retries, exc)
            if attempt == retries:
                raise
    return []


def fetch_wind_actuals(first: date, last: date) -> pd.DataFrame:
    """FUELHH WIND, half-hourly. Settlement dates first..last inclusive."""
    rows: list[dict] = []
    with httpx.Client() as client:
        day = first
        while day <= last:
            end = min(day + timedelta(days=CHUNK_DAYS - 1), last)
            rows += _get(
                client,
                "/datasets/FUELHH/stream",
                {"settlementDateFrom": day.isoformat(), "settlementDateTo": end.isoformat(), "fuelType": "WIND"},
            )
            day = end + timedelta(days=1)
    df = pd.DataFrame(rows)
    return df[["startTime", "publishTime", "generation"]]


def fetch_wind_forecasts(first: datetime, last: datetime) -> pd.DataFrame:
    """WINDFOR, hourly targets. Every publish with first <= publishTime < last (UTC)."""
    rows: list[dict] = []
    with httpx.Client() as client:
        start = first
        while start < last:
            end = min(start + timedelta(days=CHUNK_DAYS), last)
            rows += _get(
                client,
                "/datasets/WINDFOR/stream",
                {"publishDateTimeFrom": _iso(start), "publishDateTimeTo": _iso(end)},
            )
            start = end
    df = pd.DataFrame(rows)
    return df[["startTime", "publishTime", "generation"]]


def _iso(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
