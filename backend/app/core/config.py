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
    frontend_url: str = "http://localhost:5173"

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
