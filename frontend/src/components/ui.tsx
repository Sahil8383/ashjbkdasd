import type { ReactNode } from 'react'

export function Card({
  title,
  caption,
  right,
  children,
  className = '',
}: {
  title?: string
  caption?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-xl border border-line bg-card p-4 sm:p-5 ${className}`}>
      {(title || right) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {caption && <p className="mt-0.5 max-w-3xl text-[13px] leading-snug text-muted">{caption}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  )
}

type Tone = 'default' | 'actual' | 'expected' | 'over' | 'under'
const toneClass: Record<Tone, string> = {
  default: 'text-ink',
  actual: 'text-actual',
  expected: 'text-expected',
  over: 'text-over',
  under: 'text-under',
}

export function Kpi({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string
  value: string
  sub?: ReactNode
  tone?: Tone
}) {
  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="text-[12px] font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass[tone]}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] leading-snug text-muted">{sub}</div>}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-paper p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
            value === o.value ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean; area?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.area ? (
            <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: i.color, opacity: 0.25 }} />
          ) : (
            <span
              className="inline-block w-4 border-t-2"
              style={{ borderColor: i.color, borderStyle: i.dashed ? 'dashed' : 'solid' }}
            />
          )}
          {i.label}
        </span>
      ))}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-line/70 ${className}`} />
}

export function KpiSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2.5 h-7 w-28" />
      <Skeleton className="mt-2 h-3 w-full max-w-44" />
    </div>
  )
}

export function KpiRowSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <KpiSkeleton key={i} />
      ))}
    </div>
  )
}

export function ChartSkeleton({ className = 'h-64' }: { className?: string }) {
  // Faint gridlines and bars so the placeholder reads as "a chart is coming".
  return (
    <div className={`relative w-full overflow-hidden rounded-lg ${className}`}>
      <div className="absolute inset-0 flex flex-col justify-between py-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="border-t border-line/70" />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-2 flex h-3/4 items-end gap-1 px-2">
        {[38, 52, 47, 63, 71, 58, 66, 49, 41, 55, 62, 45, 36, 50, 57, 44].map((h, i) => (
          <div key={i} className="flex-1 animate-pulse rounded-t-sm bg-line/70" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  )
}

export function Status({
  loading,
  error,
  children,
  skeleton,
}: {
  loading: boolean
  error: unknown
  children: ReactNode
  skeleton?: ReactNode
}) {
  if (error) {
    return (
      <div className="rounded-lg border border-over/30 bg-over/5 px-4 py-3 text-[13px] text-over">
        Could not load data: {error instanceof Error ? error.message : 'unknown error'}
      </div>
    )
  }
  if (loading) {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading</span>
        {skeleton ?? <ChartSkeleton />}
      </div>
    )
  }
  return <>{children}</>
}

export function TooltipBox({
  title,
  rows,
}: {
  title: string
  rows: { label: string; value: string; color?: string }[]
}) {
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2 text-[12px] shadow-md">
      <div className="mb-1 font-semibold text-ink">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-muted">
            {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="font-medium tabular-nums text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  )
}
