# Wind Forecast Monitor

A web app for a UK utility's day-ahead trading desk. For each delivery day it shows the **wind forecast that was actually available when the purchase decision had to be made**, plus a corrected expectation and a P10–P90 range. It also measures **how accurate those forecasts were** over the pilot window, so the desk can buy with the error in mind.

Data: Elexon BMRS national wind only. Actuals come from [FUELHH](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream) (`fuelType = WIND`, half-hourly). Forecasts come from [WINDFOR](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream) (hourly). The window is the purchase decisions made in January 2026.

**Live app:** https://gb-wind-monitor.vercel.app · **API docs:** https://gb-wind-monitor.vercel.app/api/docs

## What the pilot found (decisions at 09:00 on D-1, delivery 2 Jan – 1 Feb 2026)

|                                                                      |                                                                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Average hourly miss (MAE) of the forecast available at decision time | **2.0 GW** (18% of mean output), RMSE 2.5 GW                                                                             |
| Bias                                                                 | **+1.7 GW**: the forecast was too high in **85%** of hours                                                               |
| Bias by wind level                                                   | +0.3 GW at 6–9 GW forecast, **+3.4 GW** above 18 GW                                                                      |
| Error vs lead time                                                   | MAE 1.7 GW at 0 h ahead, 2.3 GW at 48 h ahead                                                                            |
| Simple ratio correction, scored out of sample (leave-one-day-out)    | MAE **2.0 → 1.2 GW (−40%)**. The P10–P90 band holds 79% of hours (target 80%); 11% fall below P10 (target 10%)           |
| Moving the decision from 09:00 to 09:45 (N2EX closes 09:50)          | Uses the 09:30 run instead of 07:30, but MAE only improves from 2,022 to 1,996 MW. The bias matters more than the timing |

## Key definitions and assumptions

- **Delivery window.** Decisions made on 1–31 Jan 2026 are for delivery days **2 Jan – 1 Feb 2026** (UK local days). Forecasts published from 31 Dec are loaded so every lead time up to 48 h has data. One constant changes this: `backend/app/config.py`.
- **Decision time.** The default is **09:00 UK on D-1**, ahead of the GB day-ahead auctions (EPEX closes 09:20, N2EX 09:50). The user can change it.
- **Forecast available at decision time** = the latest WINDFOR run with `publishTime <= cutoff`. Each WINDFOR publish also includes about a day of already-elapsed hours. Those rows (`startTime <= publishTime`) are not forecasts and are dropped.
- **Lead time (horizon)** = `startTime − publishTime`. "Fixed lead time H" means the latest forecast published at least H hours before the target.
- **Matching.** WINDFOR is hourly and FUELHH half-hourly, so they are compared at the shared hourly timestamps (the `:00` half-hour). Averaging both half-hours is a possible alternative.
- **Sign convention.** `error = forecast − actual`. Positive means wind was over-forecast: the desk is short and buys at imbalance prices.
- **Correction and band.** P10/P50/P90 multipliers are the quantiles of `actual ÷ forecast` at the same decision time, learned from **other** delivery days only, so a day never sees its own answer. A ratio is used rather than a MW offset because the bias grows with wind level.
- **Daily energy.** Each hourly value stands for one hour of delivery, so the sum of hourly MW gives MWh.
- **Times.** Stored in UTC and shown in UK local time (`Europe/London`). The code handles BST and the 23/25-hour days, and tests cover them.

## Run it

**Docker (one command):**

```bash
docker compose up --build
# app: http://localhost:8088   API docs: http://localhost:8000/api/docs
# use WEB_PORT=9000 docker compose up to pick another port
```

**Without Docker:**

```bash
# backend (Python 3.12+)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload          # http://localhost:8000/api/docs
pytest                                 # 30 tests
ruff check . && ruff format --check .

# frontend (Node 22)
cd frontend
npm ci
npm run dev                            # http://localhost:5173, proxies /api to :8000
npm test && npm run lint && npm run build
```

**Refresh the data snapshot from Elexon:** `cd backend && python -m scripts.ingest`

## Repository layout

```
.
├── backend/                     FastAPI service (Python 3.12, pandas)
│   ├── app/
│   │   ├── main.py              App setup, JSON request logging, request id + timing headers
│   │   ├── config.py            Window, default cutoff, paths: the only place dates live
│   │   ├── api/v1.py            Versioned routes (/api/v1/...)
│   │   ├── api/schemas.py       Pydantic response models (the API contract, shown in /api/docs)
│   │   ├── core/elexon.py       Elexon client (chunked requests, retries)
│   │   ├── core/forecasts.py    Cleaning, decision cutoffs, "latest forecast available" selection
│   │   ├── core/metrics.py      Error stats, by-horizon curve, ratio band, leave-one-day-out backtest
│   │   └── data/store.py        Loads the snapshot once per process
│   ├── scripts/ingest.py        Pulls Elexon data and writes data/*.csv.gz
│   ├── data/                    Snapshot: actuals.csv.gz, forecasts.csv.gz
│   ├── tests/                   Unit tests (synthetic edge cases) and API tests (real snapshot)
│   └── Dockerfile
├── frontend/                    React 19 + TypeScript + Vite, TanStack Query, Recharts, Tailwind v4
│   ├── src/App.tsx              Shell and tabs (tab kept in the URL hash)
│   ├── src/pages/DecisionView.tsx   Pick a delivery day: forecast at decision time, P50, P10–P90, actual
│   ├── src/pages/AccuracyView.tsx   Pilot-wide accuracy: KPIs, correction backtest, charts
│   ├── src/api/                 Typed client and hooks, types mirroring the Pydantic schemas
│   ├── src/lib/                 Formatting (UK time, GW/GWh) with tests, chart tokens, cutoffs
│   ├── nginx.conf, Dockerfile   Production image; nginx proxies /api to the backend
├── api/index.py                 Vercel serverless entry that re-exports the FastAPI app
├── vercel.json                  Static frontend + Python function, /api/* rewrite
├── requirements.txt             Copy of backend/requirements.txt for Vercel (CI checks they match)
├── docker-compose.yml           backend :8000 + frontend :8088
├── docs/ARCHITECTURE.md         Design notes for reviewers
└── .github/workflows/ci.yml     Lint, format, tests, build, docker build
```

## API

| Endpoint                                                                          | What it returns                                                                                |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /api/v1/meta`                                                                | Window, default cutoff, data coverage                                                          |
| `GET /api/v1/decision?delivery_date=2026-01-15&cutoff=09:00`                      | 24 hourly rows: forecast used, publish time, lead time, P10/P50/P90, actual; daily MWh summary |
| `GET /api/v1/vintages?delivery_date=2026-01-15`                                   | Every forecast run covering that day, plus half-hourly actuals                                 |
| `GET /api/v1/accuracy?mode=decision&cutoff=09:00` or `?mode=horizon&horizon_h=24` | KPIs, correction backtest, by hour, by day, histogram, hourly series                           |
| `GET /api/v1/accuracy/by-horizon`                                                 | MAE / RMSE / bias / P90 for lead times 0–48 h                                                  |
| `GET /api/health`                                                                 | Liveness and row counts                                                                        |

## Use of AI tools

This project was built with help from **Claude Code** (Anthropic). I used it to scaffold code, write tests and draft docs, working from my own design decisions. I reviewed every change, and the numbers above come from running the code on the real data.
