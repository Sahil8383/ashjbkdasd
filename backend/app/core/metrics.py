"""Error statistics. Sign convention: error = forecast - actual.

Positive error = over-forecast (less wind than expected, the desk ends up short).
Negative error = under-forecast (more wind than expected, the desk overbought).
"""

import numpy as np
import pandas as pd

from app.config import MAX_HORIZON_H, UK_TZ
from app.core.forecasts import attach_actuals, horizon_cutoffs, latest_available


def summarize(joined: pd.DataFrame) -> dict:
    """Headline stats over rows that have both a forecast and an actual."""
    df = joined.dropna(subset=["forecast_mw", "actual_mw"])
    n = len(df)
    if n == 0:
        return {"n": 0}
    err = df["error_mw"].to_numpy()
    abs_err = np.abs(err)
    mean_actual = float(df["actual_mw"].mean())
    over, under = err[err > 0], err[err < 0]
    return {
        "n": n,
        "mae_mw": float(abs_err.mean()),
        "rmse_mw": float(np.sqrt((err**2).mean())),
        "bias_mw": float(err.mean()),
        "p50_abs_error_mw": float(np.percentile(abs_err, 50)),
        "p90_abs_error_mw": float(np.percentile(abs_err, 90)),
        "p99_abs_error_mw": float(np.percentile(abs_err, 99)),
        "max_over_mw": float(err.max()),
        "max_under_mw": float(err.min()),
        "mean_actual_mw": mean_actual,
        "nmae_pct": float(abs_err.mean() / mean_actual * 100) if mean_actual else None,
        "over_share": float(len(over) / n),
        "under_share": float(len(under) / n),
        "mean_over_mw": float(over.mean()) if len(over) else 0.0,
        "mean_under_mw": float(under.mean()) if len(under) else 0.0,
    }


def by_local_hour(joined: pd.DataFrame) -> list[dict]:
    df = joined.dropna(subset=["error_mw"]).copy()
    df["hour"] = df["start_time"].dt.tz_convert(UK_TZ).dt.hour
    g = df.groupby("hour")["error_mw"]
    out = pd.DataFrame({"mae_mw": g.apply(lambda e: e.abs().mean()), "bias_mw": g.mean(), "n": g.size()})
    return [{"hour": int(h), **{k: float(v) for k, v in row.items()}} for h, row in out.iterrows()]


def by_delivery_day(joined: pd.DataFrame) -> list[dict]:
    df = joined.dropna(subset=["error_mw"]).copy()
    df["day"] = _local_day(df)
    g = df.groupby("day")
    out = pd.DataFrame(
        {
            "mae_mw": g["error_mw"].apply(lambda e: e.abs().mean()),
            "bias_mw": g["error_mw"].mean(),
            "forecast_mwh": g["forecast_mw"].sum(),
            "actual_mwh": g["actual_mw"].sum(),
        }
    )
    return [{"date": d.isoformat(), **{k: float(v) for k, v in row.items()}} for d, row in out.iterrows()]


def histogram(joined: pd.DataFrame, bin_mw: int = 500) -> list[dict]:
    err = joined["error_mw"].dropna().to_numpy()
    if len(err) == 0:
        return []
    lo = np.floor(err.min() / bin_mw) * bin_mw
    hi = np.ceil(err.max() / bin_mw) * bin_mw + bin_mw
    counts, edges = np.histogram(err, bins=np.arange(lo, hi + 1, bin_mw))
    return [{"from_mw": float(edges[i]), "to_mw": float(edges[i + 1]), "count": int(c)} for i, c in enumerate(counts)]


def by_horizon(
    forecasts: pd.DataFrame, actuals: pd.DataFrame, targets: pd.DatetimeIndex, max_h: int = MAX_HORIZON_H
) -> list[dict]:
    """Accuracy of 'the latest forecast published at least H hours before the target', H = 0..max_h."""
    rows = []
    for h in range(0, max_h + 1):
        joined = attach_actuals(latest_available(forecasts, horizon_cutoffs(targets, h)), actuals)
        s = summarize(joined)
        if s["n"]:
            rows.append(
                {
                    "horizon_h": h,
                    "n": s["n"],
                    "mae_mw": s["mae_mw"],
                    "rmse_mw": s["rmse_mw"],
                    "bias_mw": s["bias_mw"],
                    "p90_abs_error_mw": s["p90_abs_error_mw"],
                }
            )
    return rows


BAND_QUANTILES = (0.10, 0.50, 0.90)


def ratio_band(joined: pd.DataFrame, exclude_day=None) -> dict:
    """Empirical P10/P50/P90 multipliers: quantiles of actual / forecast on other days.

    A ratio (not a MW offset) because the over-forecast grows with wind level: about +0.3 GW
    at 6-9 GW forecast but +3.4 GW above 18 GW in January 2026. Excluding the day being
    shown keeps it out-of-sample (no peeking at the answer).
    """
    df = joined.dropna(subset=["forecast_mw", "actual_mw"])
    df = df[df["forecast_mw"] > 0]
    if exclude_day is not None:
        df = df[_local_day(df) != exclude_day]
    if df.empty:
        return {"p10": 1.0, "p50": 1.0, "p90": 1.0, "n": 0}
    ratio = (df["actual_mw"] / df["forecast_mw"]).to_numpy()
    p10, p50, p90 = (float(np.quantile(ratio, q)) for q in BAND_QUANTILES)
    return {"p10": p10, "p50": p50, "p90": p90, "n": int(len(ratio))}


def band_backtest(joined: pd.DataFrame) -> dict:
    """Leave-one-day-out test of the ratio band: does it hold up on days it never saw?"""
    df = joined.dropna(subset=["forecast_mw", "actual_mw"]).copy()
    if df.empty:
        return {"n": 0}
    df["day"] = _local_day(df)
    inside, below_p10, abs_err_p50 = [], [], []
    for day, g in df.groupby("day"):
        b = ratio_band(df, exclude_day=day)
        if b["n"] == 0:
            continue
        lo, mid, hi = g["forecast_mw"] * b["p10"], g["forecast_mw"] * b["p50"], g["forecast_mw"] * b["p90"]
        inside += list((g["actual_mw"] >= lo) & (g["actual_mw"] <= hi))
        below_p10 += list(g["actual_mw"] < lo)
        abs_err_p50 += list((mid - g["actual_mw"]).abs())
    if not inside:
        return {"n": 0}
    return {
        "n": len(inside),
        "coverage_p10_p90": float(np.mean(inside)),
        "share_below_p10": float(np.mean(below_p10)),
        "raw_mae_mw": float(df["error_mw"].abs().mean()),
        "corrected_mae_mw": float(np.mean(abs_err_p50)),
    }


def _local_day(df: pd.DataFrame) -> pd.Series:
    return df["start_time"].dt.tz_convert(UK_TZ).dt.date
