#!/usr/bin/env bash
# Pulls the latest CI-built image and redeploys the backend stack on the
# production VPS. Run this FROM the server, inside ~/safetee (the deploy
# user's own checkout — not /root, which the deploy SSH user has no
# access to).
#
# Deliberately does NOT run `docker compose build` — the production VPS is
# low-spec (see README), and a pip-install build under load has already
# caused OOM issues on a sibling project. CI builds the image; this script
# only pulls and restarts.
set -euo pipefail

cd "$(dirname "$0")/../../backend"

echo "==> Pulling latest code (for compose files, migrations, nginx config)"
git pull origin main

echo "==> Pulling latest image(s)"
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull

echo "==> Running migrations"
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm api alembic upgrade head

echo "==> Restarting stack"
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --remove-orphans

echo "==> Pruning old images"
docker image prune -f

echo "==> Health check"
sleep 5
curl -sf http://localhost:8000/health && echo "OK" || (echo "Health check failed"; exit 1)
