# Architecture notes (for the technical reviewer)

## Shape

```
            Elexon BMRS (FUELHH, WINDFOR)
                       │  scripts/ingest.py  (run on demand)
                       ▼
            backend/data/*.csv.gz  (committed snapshot)
                       │  data/store.py: load + clean once per process (lru_cache)
                       ▼
 core/forecasts.py ──► core/metrics.py ──► api/v1.py (Pydantic models) ──► /api/v1/*
                                                                              │
                         React (TanStack Query, Recharts) ◄───────────────────┘
```

**Production (Vercel):** the static Vite build is served from the CDN, and `/api/*` is rewritten to a single Python function (`api/index.py`) that imports the FastAPI app.
**Docker:** the same backend runs under uvicorn, and nginx serves the build and proxies `/api`, so both setups are same-origin with no CORS needed.

## Decisions and why

| Decision                                                                | Why                                                                                                                          | Trade-off / next step                                                                                                             |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Serve a committed snapshot, not live Elexon calls                       | January 2026 never changes. Cold starts stay fast, the demo can't break if Elexon is down, and tests are reproducible        | For live use: a scheduled ingest into Postgres/Timescale, with incremental pulls by `publishTime`                                 |
| CSV.gz rather than Parquet                                              | Keeps pyarrow (~100 MB) out of the serverless bundle; the data is about 100 KB                                               | Parquet or a DB once data grows                                                                                                   |
| Pure functions in `core/`, no FastAPI imports                           | The domain logic is unit-tested on small synthetic frames, separate from HTTP                                                | —                                                                                                                                 |
| `latest_available(forecasts, cutoffs)` takes a per-target cutoff series | One function covers both "decision time on D-1" and "at least H hours ahead"; only the cutoff series differs                 | —                                                                                                                                 |
| Ratio band, leave-one-day-out                                           | The error is mostly multiplicative bias (larger at high wind). Leaving the day out stops the band from seeing its own answer | A proper model: quantile regression on forecast level, lead time and hour; a longer training history; conditioning on curtailment |
| Versioned `/api/v1`, typed responses                                    | The contract shows up in OpenAPI, and adding fields won't break clients                                                      | Generate the TS types from OpenAPI instead of mirroring them by hand                                                              |
| `lru_cache` on computed frames per cutoff/horizon                       | Data is static, so results are deterministic per input                                                                       | An explicit cache layer if data becomes live                                                                                      |
| Hash-based tab routing                                                  | No server routing needed on Vercel or nginx, and links still work                                                            | —                                                                                                                                 |

## Edge cases handled (and tested)

- WINDFOR rows for hours already elapsed at publish time are dropped (`startTime <= publishTime`).
- A forecast published exactly at the cutoff counts as available; one published a minute later does not.
- A target with no qualifying forecast is left out, not filled, so gaps stay visible (e.g. the one day the 11:30 run came at 12:25).
- Duplicate publishes or republished actuals: the latest one wins.
- UK local delivery days in UTC: 23- and 25-hour DST days, and a BST cutoff of 09:00 = 08:00 UTC.
- Half-hourly actuals vs hourly forecasts: joined on the hourly timestamp; a missing actual stays NaN and is left out of the stats.
- Bad input: a date outside the window, an invalid time or an out-of-range horizon returns a clear 422.

## Observability

- One JSON log line per request: request id, path, status, latency.
- `x-request-id` (taken from the caller when present, so nginx/Vercel ids carry through) and a `server-timing` header on every response.
- `/api/health` for the Docker healthcheck and uptime probes.

## Quality gates (CI)

`ruff check` + `ruff format --check` + `pytest` (30 tests) · `oxlint` + `prettier --check` + `vitest` + `tsc` + `vite build` · `docker compose build` · a check that the root `requirements.txt` matches `backend/requirements.txt`.

## What I would do next

1. Bring in demand (or the client's own load forecast) to show the **residual to buy** directly, not just the wind side.
2. Add a cost view: price the over/under error with system imbalance prices, so the band choice (P10 vs P20) becomes a cost decision.
3. Run a scheduled ingest and alert when a forecast run is late or missing at decision time.
4. Build a better correction model (quantile regression or gradient boosting on lead time, level and hour), evaluated on a rolling out-of-sample split.
