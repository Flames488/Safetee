from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

# Celery tasks run in a sync worker process, so they use psycopg2 rather than
# the asyncpg engine the FastAPI app uses. Swap the driver in the URL rather
# than maintaining a second connection string in .env.
_sync_url = settings.database_url.replace("+asyncpg", "+psycopg2")

sync_engine = create_engine(_sync_url, pool_pre_ping=True, pool_recycle=1800, pool_size=5)
SyncSessionLocal = sessionmaker(bind=sync_engine, class_=Session, expire_on_commit=False)
