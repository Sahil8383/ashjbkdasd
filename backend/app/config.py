"""Scope and domain constants. Change the window here, nothing else hardcodes dates."""

from datetime import date, time
from pathlib import Path
from zoneinfo import ZoneInfo

UK_TZ = ZoneInfo("Europe/London")

# Purchase decisions made on 1-31 Jan 2026 are for delivery days 2 Jan - 1 Feb 2026.
DELIVERY_FIRST_DAY = date(2026, 1, 2)
DELIVERY_LAST_DAY = date(2026, 2, 1)

# Forecasts reach about 48 h ahead, so pull publishes from 2 days before the first delivery day.
FORECAST_LOOKBACK_DAYS = 2
MAX_HORIZON_H = 48

# Day-ahead decision cutoff on D-1 (UK local). GB day-ahead auctions close around 09:20-09:50.
DEFAULT_CUTOFF = time(9, 0)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
ACTUALS_FILE = DATA_DIR / "actuals.csv.gz"
FORECASTS_FILE = DATA_DIR / "forecasts.csv.gz"

ELEXON_BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
