import logging
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.fastapi import FastApiIntegration

from app.api.v1 import (
    admin,
    auth,
    billing,
    contacts,
    devices,
    history,
    journeys,
    locations,
    sos,
    system,
    users,
)
from app.core.config import settings
from app.core.scheduler import start_periodic
from app.websockets.location_sharing import router as location_ws_router
from app.websockets.tracking import router as ws_router
from app.workers.tasks.billing_tasks import sweep_expired_subscriptions
from app.workers.tasks.journey_tasks import sweep_overdue_journeys
from app.workers.tasks.sos_tasks import retry_failed_alerts

logging.basicConfig(level=logging.INFO)

if settings.sentry_dsn:
    sentry_sdk.init(dsn=settings.sentry_dsn, integrations=[FastApiIntegration()], traces_sample_rate=0.1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # In-process replacement for Celery beat — see app/core/scheduler.py for
    # why (no free Background Worker instance type on Render). Intervals
    # mirror the old celery_app.conf.beat_schedule.
    background = [
        start_periodic(sweep_overdue_journeys, 30),
        start_periodic(retry_failed_alerts, 120),
        start_periodic(sweep_expired_subscriptions, 3600),
    ]
    yield
    for task in background:
        task.cancel()


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix=settings.api_v1_prefix)
app.include_router(users.router, prefix=settings.api_v1_prefix)
app.include_router(billing.router, prefix=settings.api_v1_prefix)
app.include_router(admin.router, prefix=settings.api_v1_prefix)
app.include_router(contacts.router, prefix=settings.api_v1_prefix)
app.include_router(devices.router, prefix=settings.api_v1_prefix)
app.include_router(locations.router, prefix=settings.api_v1_prefix)
app.include_router(journeys.router, prefix=settings.api_v1_prefix)
app.include_router(sos.router, prefix=settings.api_v1_prefix)
app.include_router(history.router, prefix=settings.api_v1_prefix)
app.include_router(system.router, prefix=settings.api_v1_prefix)
app.include_router(ws_router)
app.include_router(location_ws_router)


@app.get("/health")
async def health():
    """Used by the Docker healthcheck and the load balancer — deliberately
    has no DB/Redis dependency so it can't false-negative during a brief
    connection blip and trigger an unnecessary container restart."""
    return {"status": "ok", "service": settings.app_name}
