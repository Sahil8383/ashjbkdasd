// All display times are UK local, whatever the viewer's own timezone is.
export const UK_TZ = 'Europe/London'

const hm = new Intl.DateTimeFormat('en-GB', { timeZone: UK_TZ, hour: '2-digit', minute: '2-digit' })
const dayMonth = new Intl.DateTimeFormat('en-GB', { timeZone: UK_TZ, day: 'numeric', month: 'short' })
const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: UK_TZ, weekday: 'short' })

export const fmtTime = (iso: string | number) => hm.format(new Date(iso))
export const fmtDay = (iso: string | number) => dayMonth.format(new Date(iso))
export const fmtDayTime = (iso: string | number) => `${fmtDay(iso)} ${fmtTime(iso)}`
export const fmtWeekday = (isoDate: string) => weekday.format(new Date(`${isoDate}T12:00:00Z`))

/** 12345 -> "12.3 GW"; values under 1 GW stay in MW. */
export function fmtPower(mw: number | null | undefined, digits = 1): string {
  if (mw == null || Number.isNaN(mw)) return '—'
  return Math.abs(mw) >= 1000 ? `${(mw / 1000).toFixed(digits)} GW` : `${Math.round(mw)} MW`
}

/** Signed version for errors and bias: "+1.7 GW" / "−0.9 GW". */
export function fmtSignedPower(mw: number | null | undefined, digits = 1): string {
  if (mw == null || Number.isNaN(mw)) return '—'
  const sign = mw > 0 ? '+' : mw < 0 ? '−' : ''
  return sign + fmtPower(Math.abs(mw), digits)
}

/** Daily energy: 271234 MWh -> "271 GWh". */
export function fmtEnergy(mwh: number | null | undefined): string {
  if (mwh == null || Number.isNaN(mwh)) return '—'
  return Math.abs(mwh) >= 1000 ? `${Math.round(mwh / 1000).toLocaleString('en-GB')} GWh` : `${Math.round(mwh)} MWh`
}

export const fmtPct = (x: number | null | undefined, digits = 0) =>
  x == null || Number.isNaN(x) ? '—' : `${(x * 100).toFixed(digits)}%`

export const fmtHours = (h: number | null | undefined) =>
  h == null ? '—' : `${Number.isInteger(h) ? h : h.toFixed(1)} h`

/** Every date between first and last (YYYY-MM-DD), inclusive. */
export function dateRange(first: string, last: string): string[] {
  const out: string[] = []
  const d = new Date(`${first}T00:00:00Z`)
  const end = new Date(`${last}T00:00:00Z`)
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}
