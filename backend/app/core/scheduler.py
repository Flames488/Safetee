import asyncio
import logging

from starlette.concurrency import run_in_threadpool

logger = logging.getLogger("safetee.scheduler")

# In-process replacement for Celery's worker + beat. Render's free tier has
# no free instance type for a Background Worker service — safetee-worker and
# safetee-beat were declared in render.yaml but never actually provisioned,
# so every `.delay()`/`.apply_async()` call in the app was silently queuing
# into Redis with nothing ever consuming it (SOS alerts, journey escalation,
# password-reset SMS — none of it was reaching anyone in production).
#
# `@celery_app.task`-decorated functions are still plain callables under the
# decorator — `task.apply(...)` runs the task body synchronously in the
# calling process, exactly like this codebase's own tests already do. These
# two helpers just schedule that call on a background asyncio task instead
# of routing it through a broker queue nothing is listening on, so the
# task bodies themselves (and the tests that call `.apply()` directly)
# needed no changes at all.


# asyncio only holds a *weak* reference to a task once nothing else is
# holding one — a fire-and-forget task with no reference kept anywhere can
# be garbage-collected mid-flight (this is a documented asyncio footgun,
# not hypothetical). Fatal for this specific use: it's how an SOS alert
# would go missing silently. Keeping a strong reference here until the task
# finishes is exactly the workaround the asyncio docs themselves recommend.
_background_tasks: set[asyncio.Task] = set()


def run_soon(celery_task, *args, delay: float = 0.0) -> None:
    """Fire-and-forget: runs `celery_task` once, `delay` seconds from now,
    on this same web process."""

    async def _runner():
        if delay:
            await asyncio.sleep(delay)
        try:
            await run_in_threadpool(celery_task.apply, args=list(args))
        except Exception:
            logger.exception("Background task %s failed", celery_task.name)

    task = asyncio.create_task(_runner())
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


def start_periodic(celery_task, interval_seconds: float) -> asyncio.Task:
    """Runs `celery_task` on a fixed interval for the lifetime of this
    process — only ticks while this web dyno is actually awake. Render's
    free tier sleeps after ~15 minutes idle, so a sweep can be delayed until
    the next request wakes it back up; accepted tradeoff for running this at
    zero extra infrastructure cost (see app/main.py's lifespan)."""

    async def _loop():
        while True:
            await asyncio.sleep(interval_seconds)
            try:
                await run_in_threadpool(celery_task.apply)
            except Exception:
                logger.exception("Periodic task %s failed", celery_task.name)

    return asyncio.create_task(_loop())
