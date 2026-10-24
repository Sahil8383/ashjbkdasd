"""Loads the committed snapshot once per process."""

from functools import lru_cache

import pandas as pd

from app.config import ACTUALS_FILE, DELIVERY_FIRST_DAY, DELIVERY_LAST_DAY, FORECASTS_FILE
from app.core.forecasts import clean_actuals, clean_forecasts, delivery_hours


@lru_cache(maxsize=1)
def actuals() -> pd.DataFrame:
    return clean_actuals(pd.read_csv(ACTUALS_FILE))


@lru_cache(maxsize=1)
def forecasts() -> pd.DataFrame:
    return clean_forecasts(pd.read_csv(FORECASTS_FILE))


@lru_cache(maxsize=1)
def targets() -> pd.DatetimeIndex:
    return delivery_hours(DELIVERY_FIRST_DAY, DELIVERY_LAST_DAY)
