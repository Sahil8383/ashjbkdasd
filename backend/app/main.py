import json
import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import router
from app.data import store


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {"level": record.levelname, "logger": record.name, "msg": record.getMessage()}
        payload.update(getattr(record, "extra_fields", {}))
        return json.dumps(payload)


handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("api")

app = FastAPI(
    title="Wind Forecast Monitor API",
    version="1.0.0",
    description="Day-ahead view of GB wind forecasts (Elexon WINDFOR) against actuals (FUELHH), January 2026.",
    # Everything lives under /api so one rewrite (Vercel) or proxy rule (nginx) covers it.
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


@app.middleware("http")
async def request_log(request: Request, call_next):
    request_id = request.headers.get("x-request-id", uuid.uuid4().hex[:12])
    start = time.perf_counter()
    response = await call_next(request)
    ms = round((time.perf_counter() - start) * 1000, 1)
    response.headers["x-request-id"] = request_id
    response.headers["server-timing"] = f"app;dur={ms}"
    log.info(
        "request",
        extra={
            "extra_fields": {
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "ms": ms,
            }
        },
    )
    return response


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "forecast_rows": len(store.forecasts()), "actual_rows": len(store.actuals())}


app.include_router(router)
