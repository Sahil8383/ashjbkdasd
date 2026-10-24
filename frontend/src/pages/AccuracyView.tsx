import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAccuracy, useByHorizon } from '../api/client'
import type { Accuracy, AccuracyQuery, HorizonStat, Meta } from '../api/types'
import { Card, ChartSkeleton, Kpi, KpiRowSkeleton, Legend, Segmented, Status, TooltipBox } from '../components/ui'
import { COLORS, axisProps } from '../lib/chart'
import { CUTOFFS } from '../lib/cutoffs'
import { useDebounced } from '../lib/useDebounced'
import { fmtDay, fmtDayTime, fmtHours, fmtPct, fmtPower, fmtSignedPower } from '../lib/format'

const gw = (mw: number) => `${+(mw / 1000).toFixed(1)} GW`

export default function AccuracyView({ meta }: { meta: Meta }) {
  const [mode, setMode] = useState<'decision' | 'horizon'>('decision')
  const [cutoff, setCutoff] = useState(meta.default_cutoff)
  const [horizon, setHorizon] = useState(24)
  const settledHorizon = useDebounced(horizon, 250)
  const query: AccuracyQuery = mode === 'decision' ? { mode, cutoff } : { mode, horizon_h: settledHorizon }

  const acc = useAccuracy(query)
  const byHorizon = useByHorizon()
  // Skeleton while the data on screen is for the previous selection (keepPreviousData).
  const loading = acc.isPending || acc.isPlaceholderData
  // Mid-drag on the slider: keep the old numbers but dim them until the drag settles.
  const settling = mode === 'horizon' && horizon !== settledHorizon

  return (
    <div className="space-y-4">
      <Card
        title="Which forecast are we scoring?"
        caption={
          mode === 'decision'
            ? 'For every hour from 2 Jan to 1 Feb, the forecast the desk actually had at the decision time on the day before. This is the number that matters for day-ahead buying.'
            : 'For every hour, the newest forecast published at least this many hours before it. Slide to see how accuracy changes with lead time.'
        }
        right={
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label="Scoring mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'decision', label: 'At decision time' },
                { value: 'horizon', label: 'Fixed lead time' },
              ]}
            />
            {mode === 'decision' ? (
              <label className="flex items-center gap-2 text-[13px] text-muted">
                D-1 at
                <select
                  value={cutoff}
                  onChange={(e) => setCutoff(e.target.value)}
                  className="rounded-md border border-line bg-card px-2 py-1 text-ink"
                >
                  {CUTOFFS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="flex items-center gap-2 text-[13px] text-muted">
                <input
                  type="range"
                  min={0}
                  max={meta.max_horizon_h}
                  step={1}
                  value={horizon}
                  onChange={(e) => setHorizon(Number(e.target.value))}
                  className="w-40 accent-[#d9622b]"
                  aria-label="Minimum lead time in hours"
                />
                <span className="w-20 font-medium text-ink tabular-nums">≥ {horizon} h</span>
              </label>
            )}
          </div>
        }
      >
        <Status loading={loading} error={acc.error} skeleton={<KpiRowSkeleton />}>
          {acc.data && <Headline a={acc.data} />}
        </Status>
      </Card>

      <div className={`space-y-4 transition-opacity ${settling ? 'opacity-50' : ''}`}>
        {loading ? (
          <Card title="A simple correction already pays off">
            <KpiRowSkeleton />
          </Card>
        ) : (
          acc.data && <Correction a={acc.data} />
        )}
        <Card
          title="Forecast vs actual, whole pilot window"
          caption="Hourly values. The gap between the lines is mostly one-sided: the forecast sits above the actual most of the time, especially when it is windy."
        >
          <Status loading={loading} error={acc.error} skeleton={<ChartSkeleton className="h-72" />}>
            {acc.data && <SeriesChart a={acc.data} />}
          </Status>
          <div className="mt-3">
            <Legend
              items={[
                { label: 'Actual', color: COLORS.actual },
                { label: 'Forecast being scored', color: COLORS.forecast },
              ]}
            />
          </div>
        </Card>
      </div>

      <div className={`grid gap-4 transition-opacity lg:grid-cols-2 ${settling ? 'opacity-50' : ''}`}>
        <Card
          title="Error grows with lead time"
          caption="Average miss and bias of the newest forecast published at least H hours ahead. The shaded band is the lead time a day-ahead buyer actually works with."
        >
          <Status loading={byHorizon.isPending} error={byHorizon.error}>
            {byHorizon.data && (
              <HorizonChart rows={byHorizon.data} a={acc.data} selected={mode === 'horizon' ? horizon : null} />
            )}
          </Status>
          <div className="mt-3">
            <Legend
              items={[
                { label: 'Average miss (MAE)', color: COLORS.over },
                { label: 'Bias (mean forecast − actual)', color: COLORS.forecast, dashed: true },
                { label: 'P90 miss', color: '#e4a597' },
              ]}
            />
          </div>
        </Card>

        <Card
          title="How big are the misses?"
          caption="Count of hours by forecast − actual. Right of zero: less wind than forecast, so the desk is short and buys at imbalance prices."
        >
          <Status loading={loading} error={acc.error}>
            {acc.data && <HistogramChart a={acc.data} />}
          </Status>
        </Card>

        <Card title="By hour of day" caption="Average miss and bias for each delivery hour (UK time).">
          <Status loading={loading} error={acc.error} skeleton={<ChartSkeleton className="h-56" />}>
            {acc.data && <HourChart a={acc.data} />}
          </Status>
          <div className="mt-3">
            <Legend
              items={[
                { label: 'Average miss', color: COLORS.over },
                { label: 'Bias', color: COLORS.forecast },
              ]}
            />
          </div>
        </Card>

        <Card title="By delivery day" caption="Daily average miss. Big days line up with storms and fast wind changes.">
          <Status loading={loading} error={acc.error} skeleton={<ChartSkeleton className="h-56" />}>
            {acc.data && <DayChart a={acc.data} />}
          </Status>
        </Card>
      </div>
    </div>
  )
}

function Headline({ a }: { a: Accuracy }) {
  const s = a.summary
  if (!s.n) return <p className="text-[13px] text-muted">No hours have a forecast for this setting.</p>
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        label="Average miss (MAE)"
        value={fmtPower(s.mae_mw)}
        sub={`${s.nmae_pct?.toFixed(0)}% of average wind output · RMSE ${fmtPower(s.rmse_mw)}`}
      />
      <Kpi
        label="Bias"
        value={fmtSignedPower(s.bias_mw)}
        tone={(s.bias_mw ?? 0) > 0 ? 'over' : 'under'}
        sub={`Over-forecast in ${fmtPct(s.over_share)} of hours`}
      />
      <Kpi
        label="9 hours in 10, miss under"
        value={fmtPower(s.p90_abs_error_mw)}
        sub={`1 in 100 hours misses by ${fmtPower(s.p99_abs_error_mw)}+`}
      />
      <Kpi
        label="Worst hours"
        value={`${fmtSignedPower(s.max_over_mw)} / ${fmtSignedPower(s.max_under_mw)}`}
        sub={`Over / under · ${s.n} hours scored`}
      />
    </div>
  )
}

function Correction({ a }: { a: Accuracy }) {
  const b = a.backtest
  if (!b.n || b.raw_mae_mw == null || b.corrected_mae_mw == null) return null
  const gain = 1 - b.corrected_mae_mw / b.raw_mae_mw
  return (
    <Card
      title="A simple correction already pays off"
      caption="Scale each forecast by how forecasts compared with actuals on the other days of the month (actual ÷ forecast, P10/P50/P90). Each day is scored with a correction learned without it, so this is an honest out-of-sample test."
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Raw forecast miss" value={fmtPower(b.raw_mae_mw)} tone="over" />
        <Kpi
          label="Corrected (P50) miss"
          value={fmtPower(b.corrected_mae_mw)}
          tone="actual"
          sub={`${fmtPct(gain)} smaller`}
        />
        <Kpi label="Hours inside P10–P90" value={fmtPct(b.coverage_p10_p90)} sub="Target 80%" />
        <Kpi label="Hours below P10" value={fmtPct(b.share_below_p10)} sub="Target 10%: the 'count on' number held" />
      </div>
    </Card>
  )
}

function SeriesChart({ a }: { a: Accuracy }) {
  const data = useMemo(
    () =>
      a.series.map((p) => ({
        t: new Date(p.start_time).getTime(),
        forecast: p.forecast_mw,
        actual: p.actual_mw,
        h: p.horizon_h,
      })),
    [a],
  )
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={fmtDay}
            minTickGap={40}
            {...axisProps}
          />
          <YAxis tickFormatter={gw} width={64} {...axisProps} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload
              return (
                <TooltipBox
                  title={fmtDayTime(p.t)}
                  rows={[
                    { label: 'Actual', value: fmtPower(p.actual), color: COLORS.actual },
                    { label: 'Forecast', value: fmtPower(p.forecast), color: COLORS.forecast },
                    { label: 'Miss', value: p.actual == null ? '—' : fmtSignedPower(p.forecast - p.actual) },
                    { label: 'Lead time', value: fmtHours(p.h) },
                  ]}
                />
              )
            }}
          />
          <Line dataKey="forecast" stroke={COLORS.forecast} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line dataKey="actual" stroke={COLORS.actual} strokeWidth={1.75} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function HorizonChart({ rows, a, selected }: { rows: HorizonStat[]; a?: Accuracy; selected: number | null }) {
  // The day-ahead window: lead times of the forecasts used at the decision time.
  const decisionHours = a?.mode === 'decision' ? a.series.map((p) => p.horizon_h) : []
  const lo = decisionHours.length ? Math.min(...decisionHours) : 16.5
  const hi = decisionHours.length ? Math.max(...decisionHours) : 39.5
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <ReferenceArea x1={lo} x2={hi} fill={COLORS.expected} fillOpacity={0.07} />
          <XAxis
            dataKey="horizon_h"
            type="number"
            domain={[0, 48]}
            ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48]}
            tickFormatter={(h) => `${h}h`}
            {...axisProps}
          />
          <YAxis tickFormatter={gw} width={64} {...axisProps} domain={[0, 'auto']} />
          {selected != null && <ReferenceLine x={selected} stroke="#16212b" strokeDasharray="3 3" />}
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as HorizonStat
              return (
                <TooltipBox
                  title={`At least ${p.horizon_h} h ahead`}
                  rows={[
                    { label: 'Average miss', value: fmtPower(p.mae_mw), color: COLORS.over },
                    { label: 'Bias', value: fmtSignedPower(p.bias_mw), color: COLORS.forecast },
                    { label: 'P90 miss', value: fmtPower(p.p90_abs_error_mw) },
                  ]}
                />
              )
            }}
          />
          <Line dataKey="p90_abs_error_mw" stroke="#e4a597" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line dataKey="mae_mw" stroke={COLORS.over} strokeWidth={2.25} dot={false} isAnimationActive={false} />
          <Line
            dataKey="bias_mw"
            stroke={COLORS.forecast}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function HistogramChart({ a }: { a: Accuracy }) {
  const data = a.histogram.map((b) => ({ ...b, mid: (b.from_mw + b.to_mw) / 2 }))
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={1}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis
            dataKey="mid"
            tickFormatter={(mw) => `${mw > 0 ? '+' : ''}${(mw / 1000).toFixed(1)}`}
            interval="preserveStartEnd"
            minTickGap={16}
            unit=" GW"
            {...axisProps}
          />
          <YAxis width={36} {...axisProps} />
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload
              return (
                <TooltipBox
                  title={`${fmtSignedPower(p.from_mw)} to ${fmtSignedPower(p.to_mw)}`}
                  rows={[{ label: 'Hours', value: String(p.count) }]}
                />
              )
            }}
          />
          <ReferenceLine x={0} stroke="#16212b" />
          <Bar dataKey="count" isAnimationActive={false}>
            {data.map((b) => (
              <Cell key={b.from_mw} fill={b.mid > 0 ? COLORS.over : COLORS.under} fillOpacity={0.75} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function HourChart({ a }: { a: Accuracy }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={a.by_hour} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={1}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis dataKey="hour" tickFormatter={(h) => `${String(h).padStart(2, '0')}`} interval={2} {...axisProps} />
          <YAxis tickFormatter={gw} width={64} {...axisProps} />
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload
              return (
                <TooltipBox
                  title={`${String(p.hour).padStart(2, '0')}:00`}
                  rows={[
                    { label: 'Average miss', value: fmtPower(p.mae_mw), color: COLORS.over },
                    { label: 'Bias', value: fmtSignedPower(p.bias_mw), color: COLORS.forecast },
                  ]}
                />
              )
            }}
          />
          <Bar dataKey="mae_mw" fill={COLORS.over} fillOpacity={0.75} isAnimationActive={false} />
          <Bar dataKey="bias_mw" fill={COLORS.forecast} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function DayChart({ a }: { a: Accuracy }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={a.by_day} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d) => String(Number(d.slice(8)))} interval={2} {...axisProps} />
          <YAxis tickFormatter={gw} width={64} {...axisProps} />
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload
              return (
                <TooltipBox
                  title={fmtDay(p.date)}
                  rows={[
                    { label: 'Average miss', value: fmtPower(p.mae_mw), color: COLORS.over },
                    { label: 'Bias', value: fmtSignedPower(p.bias_mw) },
                  ]}
                />
              )
            }}
          />
          <Bar dataKey="mae_mw" fill={COLORS.over} fillOpacity={0.75} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
