import numpy as np
import pandas as pd
import pytest

from app.core.metrics import band_backtest, by_horizon, histogram, ratio_band, summarize


def joined(forecast, actual, start="2026-01-10T00:00Z"):
    df = pd.DataFrame(
        {
            "start_time": pd.date_range(start, periods=len(forecast), freq="1h"),
            "forecast_mw": np.asarray(forecast, dtype=float),
            "actual_mw": np.asarray(actual, dtype=float),
        }
    )
    df["error_mw"] = df["forecast_mw"] - df["actual_mw"]
    return df


def test_summarize_known_values():
    s = summarize(joined([110, 90, 100, 120], [100, 100, 100, 100]))
    assert s["n"] == 4
    assert s["mae_mw"] == pytest.approx(10)
    assert s["bias_mw"] == pytest.approx(5)
    assert s["rmse_mw"] == pytest.approx(np.sqrt((100 + 100 + 0 + 400) / 4))
    assert s["over_share"] == 0.5 and s["under_share"] == 0.25
    assert s["max_over_mw"] == 20 and s["max_under_mw"] == -10
    assert s["nmae_pct"] == pytest.approx(10)


def test_summarize_ignores_missing_actuals_and_handles_empty():
    s = summarize(joined([110, 500], [100, np.nan]))
    assert s["n"] == 1 and s["mae_mw"] == 10
    assert summarize(joined([110], [np.nan])) == {"n": 0}


def test_histogram_counts_every_error():
    bins = histogram(joined([100, 700, 1300, -200], [0, 0, 0, 0]), bin_mw=500)
    assert sum(b["count"] for b in bins) == 4
    assert all(b["to_mw"] - b["from_mw"] == 500 for b in bins)


def test_ratio_band_excludes_the_day_shown():
    day1 = joined([100] * 24, [50] * 24, start="2026-01-10T00:00Z")
    day2 = joined([100] * 24, [80] * 24, start="2026-01-11T00:00Z")
    both = pd.concat([day1, day2], ignore_index=True)
    band = ratio_band(both, exclude_day=pd.Timestamp("2026-01-10").date())
    assert band == {"p10": pytest.approx(0.8), "p50": pytest.approx(0.8), "p90": pytest.approx(0.8), "n": 24}


def test_band_backtest_on_perfectly_biased_forecast():
    # Forecast is always 25% high: the corrected P50 should be exact on unseen days.
    days = [joined([100 * (i + 1)] * 24, [75 * (i + 1)] * 24, start=f"2026-01-{10 + i}T00:00Z") for i in range(3)]
    bt = band_backtest(pd.concat(days, ignore_index=True))
    assert bt["corrected_mae_mw"] == pytest.approx(0)
    assert bt["raw_mae_mw"] == pytest.approx(50)
    assert bt["coverage_p10_p90"] == 1.0


def test_by_horizon_error_grows_with_lead_time():
    target = pd.Timestamp("2026-01-15T12:00Z")
    fc = pd.DataFrame(
        {
            "start_time": [target] * 3,
            "publish_time": [target - pd.Timedelta(hours=h) for h in (2, 10, 30)],
            "forecast_mw": [1010.0, 1100.0, 1500.0],
        }
    )
    fc["horizon_h"] = [2.0, 10.0, 30.0]
    actuals = pd.DataFrame({"start_time": [target], "actual_mw": [1000.0]})
    rows = {r["horizon_h"]: r["mae_mw"] for r in by_horizon(fc, actuals, pd.DatetimeIndex([target]), max_h=31)}
    assert rows[0] == 10 and rows[2] == 10  # the 2 h run is the latest one at least 0/2 h ahead
    assert rows[3] == 100 and rows[10] == 100
    assert rows[11] == 500 and rows[30] == 500
    assert 31 not in rows  # nothing that far ahead
