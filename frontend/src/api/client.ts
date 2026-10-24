import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { Accuracy, AccuracyQuery, Decision, HorizonStat, Meta, Vintages } from './types'

const BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
  const res = await fetch(`${BASE}/api/v1${path}${qs ? `?${qs}` : ''}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const detail = typeof body.detail === 'string' ? body.detail : res.statusText
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

// The data is a fixed historical window, so responses never go stale within a session.
const STATIC = { staleTime: Infinity, gcTime: 30 * 60_000 }

export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: () => get<Meta>('/meta'), ...STATIC })

export const useDecision = (day: string, cutoff: string) =>
  useQuery({
    queryKey: ['decision', day, cutoff],
    queryFn: () => get<Decision>('/decision', { delivery_date: day, cutoff }),
    placeholderData: keepPreviousData,
    ...STATIC,
  })

export const useVintages = (day: string) =>
  useQuery({
    queryKey: ['vintages', day],
    queryFn: () => get<Vintages>('/vintages', { delivery_date: day }),
    placeholderData: keepPreviousData,
    ...STATIC,
  })

export const useAccuracy = (q: AccuracyQuery) =>
  useQuery({
    queryKey: ['accuracy', q],
    queryFn: () => get<Accuracy>('/accuracy', q),
    placeholderData: keepPreviousData,
    ...STATIC,
  })

export const useByHorizon = () =>
  useQuery({ queryKey: ['by-horizon'], queryFn: () => get<HorizonStat[]>('/accuracy/by-horizon'), ...STATIC })
