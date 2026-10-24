import { useEffect, useState } from 'react'
import { useMeta } from './api/client'
import { Segmented, Status } from './components/ui'
import AccuracyView from './pages/AccuracyView'
import DecisionView from './pages/DecisionView'

type Tab = 'decision' | 'accuracy'

// The tab lives in the URL hash so a view can be linked to directly.
const readTab = (): Tab => (window.location.hash === '#accuracy' ? 'accuracy' : 'decision')

export default function App() {
  const [tab, setTab] = useState<Tab>(readTab)
  const meta = useMeta()

  useEffect(() => {
    const onHash = () => setTab(readTab())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (t: Tab) => {
    window.location.hash = t
    setTab(t)
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="" className="h-8 w-8" />
            <div>
              <h1 className="text-[16px] leading-tight font-semibold">Wind Forecast Monitor</h1>
              <p className="text-[12px] text-muted">GB national wind · day-ahead purchasing · pilot, January 2026</p>
            </div>
          </div>
          <Segmented
            label="View"
            value={tab}
            onChange={go}
            options={[
              { value: 'decision', label: 'Decision day' },
              { value: 'accuracy', label: 'Forecast accuracy' },
            ]}
          />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <Status loading={meta.isPending} error={meta.error}>
          {meta.data && (tab === 'decision' ? <DecisionView meta={meta.data} /> : <AccuracyView meta={meta.data} />)}
        </Status>
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 text-[12px] text-faint sm:px-6">
        Data: Elexon BMRS · actuals FUELHH (WIND, half-hourly) · forecasts WINDFOR (hourly). Times are UK local. Error =
        forecast − actual, so positive means wind was over-forecast.
      </footer>
    </div>
  )
}
