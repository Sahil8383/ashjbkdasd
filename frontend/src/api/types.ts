// Mirrors backend/app/api/schemas.py. Timestamps are ISO strings in UTC.

export interface Meta {
  delivery_first_day: string
  delivery_last_day: string
  default_cutoff: string
  max_horizon_h: number
  forecast_publishes: number
  first_publish: string
  last_publish: string
  actuals_points: number
  sign_convention: string
}

export interface Band {
  p10: number
  p50: number
  p90: number
  n: number
}

export interface DecisionHour {
  start_time: string
  publish_time: string | null
  horizon_h: number | null
  forecast_mw: number | null
  p10_mw: number | null
  p50_mw: number | null
  p90_mw: number | null
  actual_mw: number | null
}

export interface DecisionSummary {
  forecast_mwh: number
  p10_mwh: number
  p50_mwh: number
  p90_mwh: number
  actual_mwh: number | null
  forecast_error_mwh: number | null
  mae_mw: number | null
  hours_with_forecast: number
  hours_with_actual: number
}

export interface Decision {
  delivery_date: string
  cutoff: string
  publish_times_used: string[]
  band: Band
  summary: DecisionSummary
  hours: DecisionHour[]
}

export interface Point {
  start_time: string
  mw: number
}

export interface Vintages {
  delivery_date: string
  vintages: { publish_time: string; points: Point[] }[]
  actuals: Point[]
}

export interface Summary {
  n: number
  mae_mw?: number
  rmse_mw?: number
  bias_mw?: number
  p50_abs_error_mw?: number
  p90_abs_error_mw?: number
  p99_abs_error_mw?: number
  max_over_mw?: number
  max_under_mw?: number
  mean_actual_mw?: number
  nmae_pct?: number
  over_share?: number
  under_share?: number
  mean_over_mw?: number
  mean_under_mw?: number
}

export interface Backtest {
  n: number
  coverage_p10_p90?: number
  share_below_p10?: number
  raw_mae_mw?: number
  corrected_mae_mw?: number
}

export interface DayStat {
  date: string
  mae_mw: number
  bias_mw: number
  forecast_mwh: number
  actual_mwh: number
}

export interface Accuracy {
  mode: 'decision' | 'horizon'
  cutoff: string | null
  horizon_h: number | null
  summary: Summary
  backtest: Backtest
  by_hour: { hour: number; mae_mw: number; bias_mw: number; n: number }[]
  by_day: DayStat[]
  histogram: { from_mw: number; to_mw: number; count: number }[]
  series: { start_time: string; forecast_mw: number; actual_mw: number | null; horizon_h: number }[]
}

export interface HorizonStat {
  horizon_h: number
  n: number
  mae_mw: number
  rmse_mw: number
  bias_mw: number
  p90_abs_error_mw: number
}

export type AccuracyQuery = { mode: 'decision'; cutoff: string } | { mode: 'horizon'; horizon_h: number }
