from datetime import date, time

import numpy as np
import pandas as pd
import pytest

from app.core.forecasts import (
    attach_actuals,
    clean_actuals,
    clean_forecasts,
    decision_cutoffs,
    delivery_hours,
    horizon_cutoffs,
    latest_available,
)

T = pd.Timestamp


def raw_fc(rows):
    return pd.DataFrame(rows, columns=["startTime", "publishTime", "generation"])


def test_clean_forecasts_drops_elapsed_hours_and_duplicates():
    raw = raw_fc(
        [
            ("2026-01-10T10:00Z", "2026-01-10T07:30Z", 100),
            ("2026-01-10T10:00Z", "2026-01-10T07:30Z", 110),  # duplicate publish: keep last
            ("2026-01-10T07:00Z", "2026-01-10T07:30Z", 90),  # already elapsed: not a forecast
            ("2026-01-10T07:30Z", "2026-01-10T07:30Z", 95),  # start == publish: not a forecast
        ]
    )
    out = clean_forecasts(raw)
    assert len(out) == 1
    assert out.iloc[0]["forecast_mw"] == 110
    assert out.iloc[0]["horizon_h"] == 2.5


def test_clean_actuals_keeps_latest_republish():
    raw = pd.DataFrame(
        {
            "startTime": ["2026-01-10T10:00Z", "2026-01-10T10:00Z"],
            "publishTime": ["2026-01-10T10:30Z", "2026-01-10T12:00Z"],
            "generation": [500, 520],
        }
    )
    out = clean_actuals(raw)
    assert out["actual_mw"].tolist() == [520]


def test_delivery_hours_follow_uk_local_days_including_dst():
    assert len(delivery_hours(date(2026, 1, 15), date(2026, 1, 15))) == 24
    assert len(delivery_hours(date(2026, 3, 29), date(2026, 3, 29))) == 23  # clocks go forward
    assert len(delivery_hours(date(2026, 10, 25), date(2026, 10, 25))) == 25  # clocks go back
    # A BST delivery day starts at 23:00 UTC the evening before.
    assert delivery_hours(date(2026, 7, 15), date(2026, 7, 15))[0] == T("2026-07-14T23:00Z")


def test_decision_cutoff_is_d_minus_1_local():
    targets = pd.DatetimeIndex([T("2026-01-15T00:00Z"), T("2026-01-15T23:00Z"), T("2026-07-14T23:00Z")])
    cut = decision_cutoffs(targets, time(9, 0))
    assert cut.iloc[0] == T("2026-01-14T09:00Z")
    assert cut.iloc[1] == T("2026-01-14T09:00Z")  # same delivery day, same cutoff
    assert cut.iloc[2] == T("2026-07-14T08:00Z")  # 15 Jul local day; 09:00 BST = 08:00 UTC


@pytest.fixture
def forecasts():
    target = "2026-01-15T12:00Z"
    return clean_forecasts(
        raw_fc(
            [
                (target, "2026-01-14T04:30Z", 1000),
                (target, "2026-01-14T07:30Z", 1100),
                (target, "2026-01-14T09:00Z", 1200),  # published exactly at the cutoff
                (target, "2026-01-14T09:30Z", 1300),  # after the cutoff: must not be used
            ]
        )
    )


def test_latest_available_includes_publish_at_cutoff_and_excludes_later(forecasts):
    targets = pd.DatetimeIndex([T("2026-01-15T12:00Z")])
    picked = latest_available(forecasts, decision_cutoffs(targets, time(9, 0)))
    assert picked["forecast_mw"].tolist() == [1200]
    picked = latest_available(forecasts, decision_cutoffs(targets, time(8, 59)))
    assert picked["forecast_mw"].tolist() == [1100]


def test_latest_available_skips_targets_without_a_forecast(forecasts):
    targets = pd.DatetimeIndex([T("2026-01-15T12:00Z"), T("2026-01-15T13:00Z")])
    picked = latest_available(forecasts, decision_cutoffs(targets, time(9, 0)))
    assert picked["start_time"].tolist() == [T("2026-01-15T12:00Z")]


def test_latest_available_by_horizon(forecasts):
    targets = pd.DatetimeIndex([T("2026-01-15T12:00Z")])
    # >= 28 h ahead means published by 2026-01-14 08:00 -> the 07:30 run
    picked = latest_available(forecasts, horizon_cutoffs(targets, 28))
    assert picked["forecast_mw"].tolist() == [1100]
    assert picked["horizon_h"].tolist() == [28.5]
    # nothing published 40 h ahead
    assert latest_available(forecasts, horizon_cutoffs(targets, 40)).empty


def test_attach_actuals_uses_hourly_timestamp_and_keeps_missing_as_nan(forecasts):
    targets = pd.DatetimeIndex([T("2026-01-15T12:00Z")])
    picked = latest_available(forecasts, decision_cutoffs(targets, time(9, 0)))
    actuals = pd.DataFrame({"start_time": [T("2026-01-15T12:30Z")], "actual_mw": [999.0]})
    out = attach_actuals(picked, actuals)
    assert np.isnan(out.iloc[0]["actual_mw"])  # the :30 half-hour is not the hourly match

    actuals = pd.DataFrame({"start_time": [T("2026-01-15T12:00Z")], "actual_mw": [1000.0]})
    out = attach_actuals(picked, actuals)
    assert out.iloc[0]["error_mw"] == 200  # forecast 1200 - actual 1000: over-forecast is positive
