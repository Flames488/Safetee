import os

# Must happen before any `app.*` import — pydantic-settings reads these at
# import time when `Settings()` is instantiated in app.core.config.
os.environ.setdefault("SECRET_KEY", "test-secret-key-do-not-use-in-prod")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://safetee:safetee@localhost:5432/safetee_test"
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")  # DB 1, kept separate from dev
os.environ.setdefault("SOS_CANCEL_WINDOW_SECONDS", "5")
os.environ.setdefault("JOURNEY_CHECKIN_GRACE_MINUTES", "10")

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.db.session import Base, engine
from app.main import app

# Every model must be imported somewhere for its table to register on
# Base.metadata before _create_schema runs. `from app.main import app`
# above pulls in every router, which pulls in every model — so this is
# covered implicitly. Noted here so the next person doesn't have to
# rediscover it while debugging a "table doesn't exist" test failure.


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _create_schema():
    """Drops and recreates every table fresh, once per test session,
    against SAFETEE_TEST_DB (kept separate from the dev database so
    running tests never touches data you're looking at in a local
    frontend session).

    Deliberately drop-then-create rather than create_all alone:
    create_all only adds tables/columns that don't exist yet — it never
    alters an existing one. If the test DB persists across runs (it does;
    nothing here otherwise drops it) and a model gains a new column,
    create_all silently leaves the real test schema behind the Python
    model, and every test touching that column fails with a
    column-does-not-exist error that has nothing to do with the test
    itself — that drift alone is what broke the bulk of this suite.
    Dropping first means the schema is always generated fresh from
    whatever the models say right now.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def _clean_tables():
    """Truncates every app table before each test so tests don't leak
    state into one another.

    Table list is read from Base.metadata at run time rather than
    hand-maintained — a hardcoded list silently stops covering new
    tables the moment a model is added (subscriptions/payments were
    missing from it until this fix), which reintroduces the exact
    cross-test leakage this fixture exists to prevent, without ever
    raising an error to say so.
    """
    table_names = [t.name for t in Base.metadata.sorted_tables]
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {', '.join(table_names)} RESTART IDENTITY CASCADE"))

    # Postgres isn't the only place state lives — rate-limit counters are
    # in Redis (REDIS_URL points at DB 1, separate from dev's DB 0) and
    # were never cleared here. Without this, re-running the suite twice
    # within a rate-limit window fails with unrelated-looking 429s, since
    # counters from the first run are still live.
    import redis.asyncio as aioredis

    from app.core.config import settings as _settings

    r = aioredis.from_url(_settings.redis_url)
    await r.flushdb()
    await r.aclose()

    yield


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def auth_client(client):
    """A client pre-authenticated as a freshly signed-up user, plus that
    user's token and id for tests that need to act as a second party."""
    r = await client.post(
        "/api/v1/auth/signup",
        json={
            "full_name": "Chidi Okafor",
            "phone": "+2348100005521",
            "email": "chidi@example.com",
            "password": "supersecret123",
        },
    )
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client
