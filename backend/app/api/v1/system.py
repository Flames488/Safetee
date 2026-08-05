from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/status")
async def system_status():
    """Public, non-sensitive readiness signals the frontend uses for its
    reliability indicators — booleans only, never the credentials themselves."""
    return {
        "sms_primary_configured": bool(settings.twilio_account_sid and settings.twilio_auth_token),
        "sms_fallback_configured": bool(settings.termii_api_key),
    }
