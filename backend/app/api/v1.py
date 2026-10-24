from datetime import date, datetime, time, timedelta
from enum import StrEnum
from functools import lru_cache
from typing import Annotated

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from app.api import schemas
from app.config import DEFAULT_CUTOFF, DELIVERY_FIRST_DAY, DELIVERY_LAST_DAY, MAX_HORIZON_H, UK_TZ
from app.core import metrics
from app.core.forecasts import attach_actuals, decision_cutoffs, delivery_hours, horizon_cutoffs, latest_available
from app.data import store

router = APIRouter(prefix="/api/v1")

CutoffQ = Annotated[time, Query(description="Decision time on D-1, UK local (HH:MM)")]


class Mode(StrEnum):
    decision = "decision"  # forecast available at the D-1 cutoff
    horizon = "horizon"  # latest forecast published at least horizon_h before the target


def _check_day(d: date) -> None:
    if not DELIVERY_FIRST_DAY <= d <= DELIVERY_LAST_DAY:
        raise HTTPException(
            status_code=422,
            detail=f"delivery_date must be between {DELIVERY_FIRST_DAY} and {DELIVERY_LAST_DAY}",
        )


@lru_cache(maxsize=64)
def _joined_at_cutoff(cutoff: time) -> pd.DataFrame:
    picked = latest_available(store.forecasts(), decision_cutoffs(store.targets(), cutoff))
    return attach_actuals(picked, store.actuals())


@lru_cache(maxsize=64)
def _joined_at_horizon(horizon_h: float) -> pd.DataFrame:
    picked = latest_available(store.forecasts(), horizon_cutoffs(store.targets(), horizon_h))
    return attach_actuals(picked, store.actuals())


def _opt(v) -> float | None:
    return None if pd.isna(v) else float(v)


@router.get("/meta", response_model=schemas.Meta)
def meta() -> schemas.Meta:
    f = store.forecasts()
    return schemas.Meta(
        delivery_first_day=DELIVERY_FIRST_DAY,
        delivery_last_day=DELIVERY_LAST_DAY,
        default_cutoff=DEFAULT_CUTOFF.strftime("%H:%M"),
        max_horizon_h=MAX_HORIZON_H,
        forecast_publishes=int(f["publish_time"].nunique()),
        first_publish=f["publish_time"].min(),
        last_publish=f["publish_time"].max(),
        actuals_points=len(store.actuals()),
        sign_convention="error = forecast - actual; positive means wind was over-forecast (desk is short)",
    )


@router.get("/decision", response_model=schemas.Decision)
def decision(delivery_date: date, cutoff: CutoffQ = DEFAULT_CUTOFF) -> schemas.Decision:
    """What the desk would have seen at the D-1 cutoff for one delivery day, with hindsight actuals."""
    _check_day(delivery_date)
    joined = _joined_at_cutoff(cutoff)
    band = metrics.ratio_band(joined, exclude_day=delivery_date)

    hours = delivery_hours(delivery_date, delivery_date)
    day = pd.DataFrame({"start_time": hours}).merge(joined, on="start_time", how="left")
    day = day.drop(columns=["actual_mw", "error_mw"]).merge(store.actuals(), on="start_time", how="left")

    rows = []
    for r in day.itertuples():
        fc = _opt(r.forecast_mw)
        rows.append(
            schemas.DecisionHour(
                start_time=r.start_time,
                publish_time=None if pd.isna(r.publish_time) else r.publish_time,
                horizon_h=_opt(r.horizon_h),
                forecast_mw=fc,
                p10_mw=fc * band["p10"] if fc is not None else None,
                p50_mw=fc * band["p50"] if fc is not None else None,
                p90_mw=fc * band["p90"] if fc is not None else None,
                actual_mw=_opt(r.actual_mw),
            )
        )

    # Each hourly value stands for one hour of delivery, so sum(MW) = MWh.
    have_fc = day.dropna(subset=["forecast_mw"])
    both = have_fc.dropna(subset=["actual_mw"])
    forecast_mwh = float(have_fc["forecast_mw"].sum())
    actual_mwh = float(day["actual_mw"].sum()) if day["actual_mw"].notna().any() else None
    full_actuals = len(both) == len(have_fc) and len(have_fc) > 0
    summary = schemas.DecisionSummary(
        forecast_mwh=forecast_mwh,
        p10_mwh=forecast_mwh * band["p10"],
        p50_mwh=forecast_mwh * band["p50"],
        p90_mwh=forecast_mwh * band["p90"],
        actual_mwh=actual_mwh,
        forecast_error_mwh=float((both["forecast_mw"] - both["actual_mw"]).sum()) if full_actuals else None,
        mae_mw=float((both["forecast_mw"] - both["actual_mw"]).abs().mean()) if len(both) else None,
        hours_with_forecast=len(have_fc),
        hours_with_actual=int(day["actual_mw"].notna().sum()),
    )
    return schemas.Decision(
        delivery_date=delivery_date,
        cutoff=datetime.combine(delivery_date - timedelta(days=1), cutoff, UK_TZ),
        publish_times_used=sorted(have_fc["publish_time"].unique()),
        band=schemas.Band(**band),
        summary=summary,
        hours=rows,
    )


@router.get("/vintages", response_model=schemas.Vintages)
def vintages(delivery_date: date) -> schemas.Vintages:
    """Every forecast publish that covered this delivery day, to show how the forecast moved."""
    _check_day(delivery_date)
    hours = delivery_hours(delivery_date, delivery_date)
    f = store.forecasts()
    f = f[f["start_time"].isin(hours) & (f["horizon_h"] <= MAX_HORIZON_H)]
    out = [
        schemas.Vintage(
            publish_time=pub,
            points=[schemas.Point(start_time=r.start_time, mw=r.forecast_mw) for r in g.itertuples()],
        )
        for pub, g in f.groupby("publish_time")
    ]
    a = store.actuals()
    day_end = hours[-1] + pd.Timedelta(hours=1)
    a = a[(a["start_time"] >= hours[0]) & (a["start_time"] < day_end)]
    return schemas.Vintages(
        delivery_date=delivery_date,
        vintages=out,
        actuals=[schemas.Point(start_time=r.start_time, mw=r.actual_mw) for r in a.itertuples()],
    )


@router.get("/accuracy", response_model=schemas.Accuracy)
def accuracy(
    mode: Mode = Mode.decision,
    cutoff: CutoffQ = DEFAULT_CUTOFF,
    horizon_h: Annotated[float, Query(ge=0, le=MAX_HORIZON_H)] = 24,
) -> schemas.Accuracy:
    """Accuracy over the whole delivery window for one way of picking 'the' forecast."""
    joined = _joined_at_cutoff(cutoff) if mode is Mode.decision else _joined_at_horizon(horizon_h)
    series = [
        schemas.SeriesPoint(
            start_time=r.start_time, forecast_mw=r.forecast_mw, actual_mw=_opt(r.actual_mw), horizon_h=r.horizon_h
        )
        for r in joined.itertuples()
    ]
    return schemas.Accuracy(
        mode=mode.value,
        cutoff=cutoff.strftime("%H:%M") if mode is Mode.decision else None,
        horizon_h=horizon_h if mode is Mode.horizon else None,
        summary=schemas.Summary(**metrics.summarize(joined)),
        backtest=schemas.Backtest(**metrics.band_backtest(joined)),
        by_hour=metrics.by_local_hour(joined),
        by_day=metrics.by_delivery_day(joined),
        histogram=metrics.histogram(joined),
        series=series,
    )


@router.get("/accuracy/by-horizon", response_model=list[schemas.HorizonStat])
def accuracy_by_horizon() -> list[schemas.HorizonStat]:
    """How error grows with lead time, H = 0..48 h."""
    return _by_horizon()


@lru_cache(maxsize=1)
def _by_horizon() -> list[schemas.HorizonStat]:
    rows = metrics.by_horizon(store.forecasts(), store.actuals(), store.targets())
    return [schemas.HorizonStat(**r) for r in rows]
