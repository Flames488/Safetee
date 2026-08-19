from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "development"
    app_name: str = "Safetee"
    api_v1_prefix: str = "/api/v1"

    secret_key: str
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30
    allowed_origins: str = "http://localhost:5173"

    database_url: str
    database_pool_size: int = 5
    database_max_overflow: int = 5

    @field_validator("database_url")
    @classmethod
    def _require_asyncpg_driver(cls, v: str) -> str:
        # Managed Postgres providers (Render, Heroku-style, etc.) generally
        # hand out a plain `postgresql://` connection string, which
        # SQLAlchemy's asyncio engine rejects outright ("requires an async
        # driver") since it defaults to psycopg2. Normalize it here once so
        # every caller of settings.database_url — the app's async engine,
        # alembic's migration runner — just works, regardless of the scheme
        # the hosting provider happens to generate.
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    redis_url: str = "redis://redis:6379/0"

    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""

    termii_api_key: str = ""
    termii_sender_id: str = "Safetee"

    web_push_public_key: str = ""
    web_push_private_key: str = ""
    web_push_contact_email: str = "ops@safetee.app"

    sentry_dsn: str = ""

    sos_cancel_window_seconds: int = 5
    journey_checkin_grace_minutes: int = 10
    sos_fanout_max_retries: int = 4

    paystack_secret_key: str = ""
    paystack_public_key: str = ""
    trial_period_days: int = 30
    # Grace period between an admin-initiated soft delete
    # (POST /admin/users/{id}/delete) and purge_soft_deleted_accounts
    # hard-deleting the row for real. The user's own self-service
    # DELETE /users/me is unaffected — that's still an immediate hard delete.
    account_deletion_grace_days: int = 30
    frontend_url: str = "http://localhost:5173"

    # Evidence upload (Supabase Storage) — bucket must be private; every
    # access goes through a short-lived signed URL minted server-side.
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_evidence_bucket: str = "sos-evidence"
    # Unlike the evidence bucket, this one must be created as *public* in
    # the Supabase dashboard — see User.avatar_url. Uploads still go
    # through a signed URL either way (see create_signed_upload_url).
    supabase_avatar_bucket: str = "avatars"
    evidence_signed_url_ttl_seconds: int = 3600
    # Hard per-event caps so an active SOS can't silently run up storage/
    # bandwidth past what the free-tier backing store actually has —
    # roughly 15 minutes of audio/video at a 20s chunk interval, and 15
    # minutes of photos at a 60s interval. Deliberately conservative;
    # raise these once there's a paid storage tier to back them.
    evidence_max_audio_chunks: int = 45
    evidence_max_video_chunks: int = 45
    evidence_max_photos: int = 15

    # Contact-facing share links (evidence, and — see the tracking
    # websocket — live location) use their own signed, expiring token
    # type, never the account access/refresh tokens. Long-ish default
    # since an SOS's evidence should stay reachable to contacts for a
    # while after the fact, not just during the live incident.
    share_token_expire_hours: int = 72

    # Live location sharing (requests + "share at will") — always
    # time-boxed, never indefinite. Default matches the duration presets
    # the frontend offers (15/30/60); max is a hard backend-enforced
    # ceiling regardless of what a client sends.
    location_share_default_minutes: int = 30
    location_share_max_minutes: int = 120
    # A pending request nobody answered just stops being surfaced after
    # this long — no Celery sweep needed, the incoming-requests query
    # simply excludes it. Still technically 'pending' in the DB (an old
    # link/notification could still accept it), just not shown as new.
    location_request_expire_hours: int = 24

    # Admin dashboard — deliberately separate from normal login. The phone
    # number here is auto-promoted to super_admin on every login/getMe call
    # (see app/api/deps.py) so there's no manual DB write needed to bootstrap
    # your own account; leave it blank and nobody is ever auto-promoted.
    # The master password gates every *mutating* admin action individually
    # (see app/api/v1/admin.py) — a viewer or even a super_admin account
    # alone is never enough to change something, the password must be sent
    # on that specific request too.
    super_admin_phone: str = ""
    admin_master_password: str = ""

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
