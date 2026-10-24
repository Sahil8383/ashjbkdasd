"""Response models. These are the contract with the frontend and show up in /docs."""

from datetime import date, datetime

from pydantic import BaseModel, Field


class Meta(BaseModel):
    delivery_first_day: date
    delivery_last_day: date
    default_cutoff: str = Field(description="HH:MM, UK local, on D-1")
    max_horizon_h: int
    forecast_publishes: int
    first_publish: datetime
    last_publish: datetime
    actuals_points: int
    sign_convention: str


class Band(BaseModel):
    p10: float = Field(description="Multiplier on the forecast for the 10th percentile")
    p50: float
    p90: float
    n: int = Field(description="Hours the multipliers were learned from (other days only)")


class DecisionHour(BaseModel):
    start_time: datetime
    publish_time: datetime | None
    horizon_h: float | None
    forecast_mw: float | None
    p10_mw: float | None
    p50_mw: float | None
    p90_mw: float | None
    actual_mw: float | None


class DecisionSummary(BaseModel):
    forecast_mwh: float
    p10_mwh: float
    p50_mwh: float
    p90_mwh: float
    actual_mwh: float | None
    forecast_error_mwh: float | None = Field(description="forecast - actual; positive = over-forecast")
    mae_mw: float | None
    hours_with_forecast: int
    hours_with_actual: int


class Decision(BaseModel):
    delivery_date: date
    cutoff: datetime
    publish_times_used: list[datetime]
    band: Band
    summary: DecisionSummary
    hours: list[DecisionHour]


class Point(BaseModel):
    start_time: datetime
    mw: float


class Vintage(BaseModel):
    publish_time: datetime
    points: list[Point]


class Vintages(BaseModel):
    delivery_date: date
    vintages: list[Vintage]
    actuals: list[Point] = Field(description="Half-hourly actual generation for the day")


class Summary(BaseModel):
    n: int
    mae_mw: float | None = None
    rmse_mw: float | None = None
    bias_mw: float | None = None
    p50_abs_error_mw: float | None = None
    p90_abs_error_mw: float | None = None
    p99_abs_error_mw: float | None = None
    max_over_mw: float | None = None
    max_under_mw: float | None = None
    mean_actual_mw: float | None = None
    nmae_pct: float | None = None
    over_share: float | None = None
    under_share: float | None = None
    mean_over_mw: float | None = None
    mean_under_mw: float | None = None


class Backtest(BaseModel):
    n: int
    coverage_p10_p90: float | None = None
    share_below_p10: float | None = None
    raw_mae_mw: float | None = None
    corrected_mae_mw: float | None = None


class HourStat(BaseModel):
    hour: int
    mae_mw: float
    bias_mw: float
    n: float


class DayStat(BaseModel):
    date: date
    mae_mw: float
    bias_mw: float
    forecast_mwh: float
    actual_mwh: float


class Bin(BaseModel):
    from_mw: float
    to_mw: float
    count: int


class SeriesPoint(BaseModel):
    start_time: datetime
    forecast_mw: float
    actual_mw: float | None
    horizon_h: float


class Accuracy(BaseModel):
    mode: str
    cutoff: str | None
    horizon_h: float | None
    summary: Summary
    backtest: Backtest
    by_hour: list[HourStat]
    by_day: list[DayStat]
    histogram: list[Bin]
    series: list[SeriesPoint]


class HorizonStat(BaseModel):
    horizon_h: int
    n: int
    mae_mw: float
    rmse_mw: float
    bias_mw: float
    p90_abs_error_mw: float
