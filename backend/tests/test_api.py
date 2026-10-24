"""API tests against the committed January 2026 snapshot."""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def test_health_and_meta():
    assert client.get("/api/health").json()["status"] == "ok"
    meta = client.get("/api/v1/meta").json()
    assert meta["delivery_first_day"] == "2026-01-02"
    assert meta["delivery_last_day"] == "2026-02-01"
    assert meta["default_cutoff"] == "09:00"


@pytest.mark.parametrize("day", ["2026-01-02", "2026-01-15", "2026-01-28", "2026-02-01"])
def test_decision_never_uses_a_forecast_published_after_the_cutoff(day):
    body = client.get("/api/v1/decision", params={"delivery_date": day}).json()
    cutoff = ts(body["cutoff"])
    assert len(body["hours"]) == 24
    for h in body["hours"]:
        assert h["forecast_mw"] is not None
        assert ts(h["publish_time"]) <= cutoff
        assert ts(h["publish_time"]) < ts(h["start_time"])
        assert h["p10_mw"] <= h["p50_mw"] <= h["p90_mw"]
    assert body["summary"]["hours_with_forecast"] == 24


def test_decision_band_is_learned_from_other_days_only():
    body = client.get("/api/v1/decision", params={"delivery_date": "2026-01-15"}).json()
    assert body["band"]["n"] == 744 - 24


def test_later_cutoff_picks_a_newer_or_same_forecast():
    early = client.get("/api/v1/decision", params={"delivery_date": "2026-01-15", "cutoff": "06:00"}).json()
    late = client.get("/api/v1/decision", params={"delivery_date": "2026-01-15", "cutoff": "12:00"}).json()
    assert ts(late["publish_times_used"][0]) >= ts(early["publish_times_used"][0])


@pytest.mark.parametrize(
    "params",
    [
        {"delivery_date": "2026-01-01"},
        {"delivery_date": "2026-02-02"},
        {"delivery_date": "2026-01-10", "cutoff": "25:00"},
        {"delivery_date": "not-a-date"},
    ],
)
def test_decision_rejects_bad_input(params):
    assert client.get("/api/v1/decision", params=params).status_code == 422


def test_vintages_only_contain_real_forecasts():
    body = client.get("/api/v1/vintages", params={"delivery_date": "2026-01-15"}).json()
    assert len(body["actuals"]) == 48
    assert body["vintages"]
    for v in body["vintages"]:
        for p in v["points"]:
            lead_h = (ts(p["start_time"]) - ts(v["publish_time"])).total_seconds() / 3600
            assert 0 < lead_h <= 48


def test_accuracy_decision_mode():
    body = client.get("/api/v1/accuracy").json()
    assert body["mode"] == "decision"
    assert body["summary"]["n"] == 744  # 31 delivery days x 24 h
    assert len(body["by_hour"]) == 24
    assert len(body["by_day"]) == 31
    assert sum(b["count"] for b in body["histogram"]) == 744


def test_accuracy_horizon_mode_validates_range():
    assert client.get("/api/v1/accuracy", params={"mode": "horizon", "horizon_h": 12}).status_code == 200
    assert client.get("/api/v1/accuracy", params={"mode": "horizon", "horizon_h": 49}).status_code == 422


def test_by_horizon_covers_0_to_48():
    rows = client.get("/api/v1/accuracy/by-horizon").json()
    assert [r["horizon_h"] for r in rows] == list(range(49))
    assert rows[-1]["mae_mw"] > rows[0]["mae_mw"]  # longer lead time, bigger error


def test_openapi_docs_are_served_under_api():
    assert client.get("/api/docs").status_code == 200
    assert "/api/v1/decision" in client.get("/api/openapi.json").json()["paths"]
