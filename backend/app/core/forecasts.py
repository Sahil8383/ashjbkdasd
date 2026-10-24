"""Which forecast was available when, and how it lines up with what happened.

All timestamps are tz-aware UTC. Delivery days and cutoffs are UK local, converted at the edges.
"""

from datetime import date, datetime, time, timedelta

import pandas as pd

from app.config import UK_TZ


def clean_actuals(raw: pd.DataFrame) -> pd.DataFrame:
    """Raw FUELHH rows -> [start_time, actual_mw], half-hourly, one row per start_time."""
    df = pd.DataFrame(
        {
            "start_time": pd.to_datetime(raw["startTime"], utc=True),
            "publish_time": pd.to_datetime(raw["publishTime"], utc=True),
            "actual_mw": raw["generation"].astype(float),
        }
    )
    # If Elexon ever republishes a period, the latest publish is the settled value.
    df = df.sort_values("publish_time").drop_duplicates("start_time", keep="last")
    return df[["start_time", "actual_mw"]].sort_values("start_time").reset_index(drop=True)


def clean_forecasts(raw: pd.DataFrame) -> pd.DataFrame:
    """Raw WINDFOR rows -> [start_time, publish_time, forecast_mw, horizon_h].

    Each WINDFOR publish also carries about a day of already-elapsed hours. Those are not
    forecasts, so anything with start_time <= publish_time is dropped.
    """
    df = pd.DataFrame(
        {
            "start_time": pd.to_datetime(raw["startTime"], utc=True),
            "publish_time": pd.to_datetime(raw["publishTime"], utc=True),
            "forecast_mw": raw["generation"].astype(float),
        }
    )
    df = df[df["start_time"] > df["publish_time"]]
    df = df.drop_duplicates(["start_time", "publish_time"], keep="last")
    df["horizon_h"] = (df["start_time"] - df["publish_time"]).dt.total_seconds() / 3600
    return df.sort_values(["start_time", "publish_time"]).reset_index(drop=True)


def delivery_hours(first: date, last: date) -> pd.DatetimeIndex:
    """Hourly target times (UTC) covering UK-local delivery days first..last inclusive."""
    start = datetime.combine(first, time(0), UK_TZ)
    end = datetime.combine(last + timedelta(days=1), time(0), UK_TZ)
    return pd.date_range(start, end, freq="1h", inclusive="left").tz_convert("UTC")


def decision_cutoffs(targets: pd.DatetimeIndex, cutoff: time) -> pd.Series:
    """For each target, the D-1 local cutoff at which the day-ahead purchase is made."""
    local_days = targets.tz_convert(UK_TZ).normalize()
    cut = [datetime.combine((d - timedelta(days=1)).date(), cutoff, UK_TZ) for d in local_days]
    return pd.Series(pd.DatetimeIndex(cut).tz_convert("UTC"), index=targets, name="cutoff")


def horizon_cutoffs(targets: pd.DatetimeIndex, horizon_h: float) -> pd.Series:
    """For each target, the latest moment a forecast may be published to be >= horizon_h ahead."""
    return pd.Series(targets - pd.Timedelta(hours=horizon_h), index=targets, name="cutoff")


def latest_available(forecasts: pd.DataFrame, cutoffs: pd.Series) -> pd.DataFrame:
    """The newest forecast for each target that was published at or before its cutoff.

    Returns one row per target in `cutoffs` that has such a forecast:
    [start_time, cutoff, publish_time, forecast_mw, horizon_h]. Targets with no qualifying
    forecast are left out rather than filled, so gaps stay visible.
    """
    want = cutoffs.rename_axis("start_time").reset_index()
    merged = forecasts.merge(want, on="start_time", how="inner")
    merged = merged[merged["publish_time"] <= merged["cutoff"]]
    if merged.empty:
        return merged[["start_time", "cutoff", "publish_time", "forecast_mw", "horizon_h"]]
    idx = merged.groupby("start_time")["publish_time"].idxmax()
    picked = merged.loc[idx, ["start_time", "cutoff", "publish_time", "forecast_mw", "horizon_h"]]
    return picked.sort_values("start_time").reset_index(drop=True)


def attach_actuals(picked: pd.DataFrame, actuals: pd.DataFrame) -> pd.DataFrame:
    """Join actuals onto hourly forecasts at the same start_time (the :00 half-hour).

    WINDFOR is hourly and FUELHH half-hourly; we compare at the shared hourly timestamps.
    Missing actuals stay NaN and are excluded from error stats downstream.
    """
    out = picked.merge(actuals, on="start_time", how="left")
    out["error_mw"] = out["forecast_mw"] - out["actual_mw"]
    return out
