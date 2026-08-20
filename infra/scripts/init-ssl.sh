#!/usr/bin/env bash
# Issues the Let's Encrypt certificate for the API domain, via certbot's
# standalone mode — certbot briefly binds port 80 itself to complete the
# HTTP-01 challenge, so nginx must not already be holding that port. Run
# this once, before the stack's first `docker compose up`, from the repo
# root on the VPS. DNS (an A record for API_DOMAIN pointing at this
# server) must already be live, or the challenge will fail.
#
# Usage: API_DOMAIN=api.getsafetee.com CERTBOT_EMAIL=you@example.com bash infra/scripts/init-ssl.sh
set -euo pipefail

DOMAIN="${API_DOMAIN:-api.getsafetee.com}"
EMAIL="${CERTBOT_EMAIL:?Set CERTBOT_EMAIL to your address for Let's Encrypt expiry notices}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/../../backend"
CERT_DIR="$SCRIPT_DIR/../nginx/certs"
LETSENCRYPT_DIR="$SCRIPT_DIR/../nginx/letsencrypt"

mkdir -p "$CERT_DIR" "$LETSENCRYPT_DIR"

echo "==> Stopping nginx (if running) so certbot can bind port 80"
(cd "$BACKEND_DIR" && docker compose -f docker-compose.yml -f docker-compose.prod.yml stop nginx) 2>/dev/null || true

echo "==> Requesting certificate for $DOMAIN"
docker run --rm -p 80:80 -v "$LETSENCRYPT_DIR":/etc/letsencrypt \
  certbot/certbot certonly --standalone --non-interactive --agree-tos \
  --email "$EMAIL" -d "$DOMAIN"

echo "==> Copying certificate into place for nginx"
cp "$LETSENCRYPT_DIR/live/$DOMAIN/fullchain.pem" "$CERT_DIR/fullchain.pem"
cp "$LETSENCRYPT_DIR/live/$DOMAIN/privkey.pem" "$CERT_DIR/privkey.pem"

echo "==> Done. Start the stack with infra/scripts/deploy.sh (or docker compose up -d)."
echo
echo "Certificates renew automatically every 90 days. Add this to cron"
echo "(crontab -e) so renewal actually happens and nginx picks it up:"
echo
echo "0 3 * * * cd $(cd "$BACKEND_DIR" && pwd) && docker compose -f docker-compose.yml -f docker-compose.prod.yml stop nginx && docker run --rm -p 80:80 -v $LETSENCRYPT_DIR:/etc/letsencrypt certbot/certbot renew --quiet && cp $LETSENCRYPT_DIR/live/$DOMAIN/fullchain.pem $CERT_DIR/fullchain.pem && cp $LETSENCRYPT_DIR/live/$DOMAIN/privkey.pem $CERT_DIR/privkey.pem && docker compose -f docker-compose.yml -f docker-compose.prod.yml start nginx"
