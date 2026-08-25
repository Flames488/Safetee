import os

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/status")
async def system_status():
    """Public, non-sensitive readiness signals the frontend uses for its
    reliability indicators — booleans only, never the credentials themselves.

    deploy_commit lets Settings show which backend build is actually live —
    Render sets RENDER_GIT_COMMIT automatically on every deploy, no config
    needed. Without this there was no way to tell "the fix isn't deployed
    yet" apart from "the fix has a bug" short of Render dashboard access."""
    return {
        "sms_primary_configured": bool(settings.twilio_account_sid and settings.twilio_auth_token),
        "sms_fallback_configured": bool(settings.termii_api_key),
        "deploy_commit": os.environ.get("RENDER_GIT_COMMIT", "")[:7] or None,
    }
