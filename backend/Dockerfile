FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Set by .github/workflows/deploy.yml as a build-arg (github.sha) — the one
# way to tell "the fix isn't deployed yet" apart from "the fix has a bug"
# from inside the running app itself (see GET /system/status), without SSH
# access to the VPS. Empty by default so a plain local `docker build` (no
# --build-arg) just shows nothing rather than a misleading fake value.
ARG GIT_COMMIT=""
ENV GIT_COMMIT=$GIT_COMMIT

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

RUN useradd --create-home safetee && chown -R safetee:safetee /app
USER safetee

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Shell form (not exec-array) so `&&` runs migrations before the server
# starts — the fallback for any setup with no separate pre-deploy step
# (e.g. the base docker-compose.yml, for local dev). The production VPS
# deploy (infra/scripts/deploy.sh) runs migrations as its own explicit
# step instead, so this ends up idempotently re-running them, which is
# harmless. Only the web service uses this default CMD; the worker/beat
# processes override it with their own command and never run migrations
# themselves.
CMD alembic upgrade head && gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 2 -b 0.0.0.0:8000 --timeout 60
