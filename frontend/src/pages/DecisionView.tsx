import { useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAccuracy, useDecision, useVintages } from '../api/client'
import type { Decision, Meta, Vintages } from '../api/types'
import { Card, ChartSkeleton, Kpi, KpiRowSkeleton, Legend, Skeleton, Status, TooltipBox } from '../components/ui'
import { COLORS, axisProps } from '../lib/chart'
import { CUTOFFS } from '../lib/cutoffs'
import {
  dateRange,
  fmtDay,
  fmtDayTime,
  fmtEnergy,
  fmtHours,
  fmtPower,
  fmtSignedPower,
  fmtTime,
  fmtWeekday,
} from '../lib/format'

export default function DecisionView({ meta }: { meta: Meta }) {
  const days = useMemo(() => dateRange(meta.delivery_first_day, meta.delivery_last_day), [meta])
  const [day, setDay] = useState('2026-01-15')
  const [cutoff, setCutoff] = useState(meta.default_cutoff)
  const [showRuns, setShowRuns] = useState(false)

  const decision = useDecision(day, cutoff)
  const vintages = useVintages(day)
  const month = useAccuracy({ mode: 'decision', cutoff })
  const maeByDay = useMemo(() => new Map(month.data?.by_day.map((d) => [d.date, d.mae_mw])), [month.data])
  const maxMae = Math.max(1, ...maeByDay.values())
  // keepPreviousData keeps the old day on screen while the new one loads. Show a skeleton
  // until both requests are for the selected day, so the chart never mixes two days.
  const loading = decision.isPending || decision.isPlaceholderData || vintages.isPending || vintages.isPlaceholderData

  return (
    <div className="space-y-4">
      <Card
        title="Pick a delivery day"
        caption="Each day shows what the desk would have known at the decision time on the day before. The bar under each date is how far off that day's forecast turned out (taller = bigger miss)."
        right={
          <label className="flex items-center gap-2 text-[13px] text-muted">
            Decision time (D-1, UK)
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
        }
      >
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {days.map((d) => {
            const mae = maeByDay.get(d)
            const active = d === day
            return (
              <button
                key={d}
                onClick={() => setDay(d)}
                aria-pressed={active}
                title={mae ? `${fmtDay(d)}: average miss ${fmtPower(mae)}` : fmtDay(d)}
                className={`flex min-w-9 flex-1 shrink-0 flex-col items-center rounded-lg border px-1 pt-1 pb-1.5 transition-colors ${
                  active ? 'border-ink bg-ink text-white' : 'border-line bg-card hover:border-faint'
                }`}
              >
                <span className={`text-[10px] ${active ? 'text-white/70' : 'text-faint'}`}>{fmtWeekday(d)}</span>
                <span className="text-[13px] font-semibold">{Number(d.slice(8))}</span>
                <span className="mt-1 flex h-5 w-2 items-end overflow-hidden rounded-sm bg-black/5">
                  <span
                    className="w-full rounded-sm"
                    style={{
                      height: `${mae ? Math.max(8, (mae / maxMae) * 100) : 0}%`,
                      background: active ? '#fff' : COLORS.over,
                      opacity: active ? 0.9 : 0.35 + 0.65 * ((mae ?? 0) / maxMae),
                    }}
                  />
                </span>
              </button>
            )
          })}
        </div>
      </Card>

      <Status
        loading={loading}
        error={decision.error ?? vintages.error}
        skeleton={<DecisionSkeleton title={`Wind generation on ${fmtWeekday(day)} ${fmtDay(day)}`} />}
      >
        {decision.data && (
          <>
            <Headline d={decision.data} />
            <Card
              title={`Wind generation on ${fmtWeekday(day)} ${fmtDay(day)}`}
              caption={
                <>
                  The grey dashed line is the raw forecast the desk had at {fmtTime(decision.data.cutoff)} on{' '}
                  {fmtDay(decision.data.cutoff)}. The orange line and band adjust it using how wrong January&apos;s
                  forecasts were on <em>other</em> days. Green is what actually happened.
                </>
              }
              right={
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted select-none">
                  <input type="checkbox" checked={showRuns} onChange={(e) => setShowRuns(e.target.checked)} />
                  Show every forecast run
                </label>
              }
            >
              <DayChart d={decision.data} v={vintages.data} showRuns={showRuns} />
              <div className="mt-3">
                <Legend
                  items={[
                    { label: 'Actual (half-hourly)', color: COLORS.actual },
                    { label: 'Raw forecast at decision time', color: COLORS.forecast, dashed: true },
                    { label: 'Expected (P50, adjusted)', color: COLORS.expected },
                    { label: 'Likely range (P10–P90)', color: COLORS.expected, area: true },
                    ...(showRuns ? [{ label: 'Other forecast runs', color: '#c5ccd3' }] : []),
                  ]}
                />
              </div>
            </Card>
            <Hindsight d={decision.data} />
          </>
        )}
      </Status>
    </div>
  )
}

function DecisionSkeleton({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <KpiRowSkeleton />
      <Card title={title} caption={<Skeleton className="mt-1 h-3 w-72 max-w-full" />}>
        <ChartSkeleton className="h-80 sm:h-96" />
      </Card>
      <Card title="In hindsight">
        <KpiRowSkeleton />
      </Card>
    </div>
  )
}

function Headline({ d }: { d: Decision }) {
  const s = d.summary
  const pub = d.publish_times_used
  const horizons = d.hours.map((h) => h.horizon_h).filter((h): h is number => h != null)
  const highPct = Math.round((1 / d.band.p50 - 1) * 100)
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        label="Count on at least (P10)"
        value={fmtEnergy(s.p10_mwh)}
        tone="expected"
        sub="Low case: about 9 in 10 hours beat it. Plan on this, buy the rest."
      />
      <Kpi
        label="Expected wind (P50)"
        value={fmtEnergy(s.p50_mwh)}
        sub={`Raw forecast adjusted down ${highPct}%, the typical January over-forecast`}
      />
      <Kpi
        label="Raw forecast"
        value={fmtEnergy(s.forecast_mwh)}
        sub={
          pub.length === 1
            ? `Run published ${fmtDayTime(pub[0])}, ${fmtHours(Math.min(...horizons))}–${fmtHours(Math.max(...horizons))} ahead`
            : `${pub.length} runs used`
        }
      />
      <Kpi
        label="Actual (hindsight)"
        value={fmtEnergy(s.actual_mwh)}
        tone="actual"
        sub={
          s.hours_with_actual < 24
            ? `Only ${s.hours_with_actual}/24 hours reported so far`
            : 'Elexon FUELHH, at the same hourly points'
        }
      />
    </div>
  )
}

function DayChart({ d, v, showRuns }: { d: Decision; v?: Vintages; showRuns: boolean }) {
  // Every other run published before delivery started, to show how the forecast moved.
  const runs = useMemo(() => {
    const used = new Set(d.publish_times_used)
    const start = new Date(d.hours[0].start_time)
    return (v?.vintages ?? []).filter((r) => !used.has(r.publish_time) && new Date(r.publish_time) <= start)
  }, [v, d])

  const data = useMemo(() => {
    const rows = new Map<number, Record<string, number | [number, number] | null>>()
    const row = (iso: string) => {
      const t = new Date(iso).getTime()
      if (!rows.has(t)) rows.set(t, { t })
      return rows.get(t)!
    }
    for (const h of d.hours) {
      const r = row(h.start_time)
      r.forecast = h.forecast_mw
      r.p50 = h.p50_mw
      r.band = h.p10_mw != null && h.p90_mw != null ? [h.p10_mw, h.p90_mw] : null
    }
    for (const a of v?.actuals ?? []) row(a.start_time).actual = a.mw
    runs.forEach((run, i) => run.points.forEach((p) => (row(p.start_time)[`run${i}`] = p.mw)))
    return [...rows.values()].sort((a, b) => (a.t as number) - (b.t as number))
  }, [d, v, runs])

  const start = new Date(d.hours[0].start_time).getTime()
  const end = start + d.hours.length * 3600_000

  return (
    <div className="h-80 w-full sm:h-96">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[start, end - 1800_000]}
            ticks={Array.from({ length: 9 }, (_, i) => start + i * 3 * 3600_000).filter((t) => t < end)}
            tickFormatter={fmtTime}
            {...axisProps}
          />
          <YAxis
            tickFormatter={(mw) => `${(mw / 1000).toFixed(0)} GW`}
            width={64}
            {...axisProps}
            domain={[0, 'auto']}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload
              const band = p.band as [number, number] | null
              return (
                <TooltipBox
                  title={fmtTime(p.t)}
                  rows={[
                    { label: 'Actual', value: fmtPower(p.actual), color: COLORS.actual },
                    { label: 'Raw forecast', value: fmtPower(p.forecast), color: COLORS.forecast },
                    { label: 'Expected (P50)', value: fmtPower(p.p50), color: COLORS.expected },
                    { label: 'P10–P90', value: band ? `${fmtPower(band[0])} – ${fmtPower(band[1])}` : '—' },
                  ]}
                />
              )
            }}
          />
          <Area
            dataKey="band"
            stroke="none"
            fill={COLORS.expected}
            fillOpacity={0.14}
            connectNulls
            isAnimationActive={false}
          />
          {showRuns &&
            runs.map((_, i) => (
              <Line
                key={i}
                dataKey={`run${i}`}
                stroke="#c5ccd3"
                strokeWidth={1}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          <Line
            dataKey="forecast"
            stroke={COLORS.forecast}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            dataKey="p50"
            stroke={COLORS.expected}
            strokeWidth={2.25}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            dataKey="actual"
            stroke={COLORS.actual}
            strokeWidth={2.25}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function Hindsight({ d }: { d: Decision }) {
  const scored = d.hours.filter((h) => h.actual_mw != null && h.forecast_mw != null)
  if (!scored.length) return null
  const inBand = scored.filter((h) => h.actual_mw! >= h.p10_mw! && h.actual_mw! <= h.p90_mw!).length
  const rawMae = scored.reduce((a, h) => a + Math.abs(h.forecast_mw! - h.actual_mw!), 0) / scored.length
  const p50Mae = scored.reduce((a, h) => a + Math.abs(h.p50_mw! - h.actual_mw!), 0) / scored.length
  const worst = scored.reduce((w, h) =>
    Math.abs(h.forecast_mw! - h.actual_mw!) > Math.abs(w.forecast_mw! - w.actual_mw!) ? h : w,
  )
  const worstErr = worst.forecast_mw! - worst.actual_mw!
  return (
    <Card title="In hindsight" caption="How this day's decision-time view compared with what actually happened.">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Raw forecast, avg miss"
          value={fmtPower(rawMae)}
          tone="over"
          sub="Average hourly |forecast − actual|"
        />
        <Kpi
          label="Adjusted (P50), avg miss"
          value={fmtPower(p50Mae)}
          tone={p50Mae < rawMae ? 'actual' : 'over'}
          sub={
            p50Mae < rawMae
              ? `${Math.round((1 - p50Mae / rawMae) * 100)}% smaller than raw`
              : 'Adjustment did not help on this day'
          }
        />
        <Kpi
          label="Hours inside P10–P90"
          value={`${inBand} / ${scored.length}`}
          sub="Expect about 80% over many days"
        />
        <Kpi
          label="Biggest hourly miss"
          value={fmtSignedPower(worstErr)}
          tone={worstErr > 0 ? 'over' : 'under'}
          sub={`At ${fmtTime(worst.start_time)}, ${worstErr > 0 ? 'less wind than forecast (short)' : 'more wind than forecast (long)'}`}
        />
      </div>
    </Card>
  )
}
