"""Pull the January 2026 window from Elexon and write the snapshot the API serves.

Run from backend/:  python -m scripts.ingest
"""

import logging
from datetime import datetime, time, timedelta

from app.config import (
    ACTUALS_FILE,
    DATA_DIR,
    DELIVERY_FIRST_DAY,
    DELIVERY_LAST_DAY,
    FORECAST_LOOKBACK_DAYS,
    FORECASTS_FILE,
    UK_TZ,
)
from app.core.elexon import fetch_wind_actuals, fetch_wind_forecasts

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ingest")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # One extra settlement day each side so UTC/local edges are covered.
    actuals = fetch_wind_actuals(DELIVERY_FIRST_DAY - timedelta(days=1), DELIVERY_LAST_DAY + timedelta(days=1))
    actuals.to_csv(ACTUALS_FILE, index=False)
    log.info("actuals: %d rows -> %s", len(actuals), ACTUALS_FILE.name)

    first_publish = datetime.combine(DELIVERY_FIRST_DAY - timedelta(days=FORECAST_LOOKBACK_DAYS), time(0), UK_TZ)
    last_publish = datetime.combine(DELIVERY_LAST_DAY + timedelta(days=1), time(0), UK_TZ)
    forecasts = fetch_wind_forecasts(first_publish, last_publish)
    forecasts.to_csv(FORECASTS_FILE, index=False)
    log.info(
        "forecasts: %d rows, %d publishes -> %s",
        len(forecasts),
        forecasts["publishTime"].nunique(),
        FORECASTS_FILE.name,
    )


if __name__ == "__main__":
    main()
