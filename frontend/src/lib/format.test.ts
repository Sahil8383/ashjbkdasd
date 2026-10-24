import { describe, expect, it } from 'vitest'
import { dateRange, fmtEnergy, fmtHours, fmtPower, fmtSignedPower, fmtTime } from './format'

describe('format', () => {
  it('switches MW to GW at 1000', () => {
    expect(fmtPower(950)).toBe('950 MW')
    expect(fmtPower(12345)).toBe('12.3 GW')
    expect(fmtPower(null)).toBe('—')
  })

  it('signs errors with a real minus', () => {
    expect(fmtSignedPower(1746)).toBe('+1.7 GW')
    expect(fmtSignedPower(-902)).toBe('−902 MW')
    expect(fmtSignedPower(0)).toBe('0 MW')
  })

  it('formats daily energy', () => {
    expect(fmtEnergy(271234)).toBe('271 GWh')
    expect(fmtEnergy(420)).toBe('420 MWh')
  })

  it('shows UK local time regardless of viewer timezone', () => {
    expect(fmtTime('2026-01-14T07:30:00Z')).toBe('07:30') // GMT
    expect(fmtTime('2026-07-14T07:30:00Z')).toBe('08:30') // BST
  })

  it('formats horizons', () => {
    expect(fmtHours(16.5)).toBe('16.5 h')
    expect(fmtHours(24)).toBe('24 h')
  })

  it('builds an inclusive date range across a month end', () => {
    const days = dateRange('2026-01-30', '2026-02-01')
    expect(days).toEqual(['2026-01-30', '2026-01-31', '2026-02-01'])
  })
})
