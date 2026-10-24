import { useEffect, useState } from 'react'

/** The value, once it has stopped changing for `ms`. Used so a slider drag fires one request. */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}
