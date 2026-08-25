import os

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/status")
async def system_status():
    """Public, non-sensitive readiness signals the frontend uses for its
    reliability indicators — booleans only, never the credentials themselves.

    deploy_commit lets Settings show which backend build is actually live —
    GIT_COMMIT is baked into the image at build time by
    .github/workflows/deploy.yml (as github.sha), not read from anything
    host-specific. Without this there was no way to tell "the fix isn't
    deployed yet" apart from "the fix has a bug" short of SSHing into the
    VPS — deploy.yml only runs on a version tag or a manual dispatch, never
    on a plain push to main, so it's easy for a push to look deployed
    (CI green) when it never actually reached production."""
    return {
        "sms_primary_configured": bool(settings.twilio_account_sid and settings.twilio_auth_token),
        "sms_fallback_configured": bool(settings.termii_api_key),
        "deploy_commit": os.environ.get("GIT_COMMIT", "")[:7] or None,
    }
