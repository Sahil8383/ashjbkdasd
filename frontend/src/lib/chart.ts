// Shared chart palette and axis styling, matching the CSS tokens in index.css.
export const COLORS = {
  actual: '#0e7c6b',
  forecast: '#8a96a3',
  expected: '#d9622b',
  over: '#c2412d',
  under: '#2f6fb3',
  grid: '#e9ece8',
  axis: '#8b98a4',
}

export const axisProps = {
  stroke: COLORS.axis,
  fontSize: 11,
  tickLine: false,
  axisLine: { stroke: COLORS.grid },
} as const
