import httpx

from app.core.config import settings

STORAGE_API_PATH = "/storage/v1"


class SupabaseStorageError(Exception):
    pass


class SupabaseStorageClient:
    """Thin wrapper over the Supabase Storage REST API — same shape as
    PaystackClient (raise on non-2xx/malformed JSON, no SDK dependency).

    The service role key bypasses row-level security entirely, so this
    client must never be reachable from anything a request body/query
    string can influence beyond a validated storage path — see the
    extension allowlist in app.schemas.sos before this is ever called with
    a caller-supplied path.
    """

    def _base_url(self) -> str:
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise SupabaseStorageError("Supabase Storage is not configured (missing URL or service role key)")
        return f"{settings.supabase_url.rstrip('/')}{STORAGE_API_PATH}"

    def _headers(self) -> dict:
        key = settings.supabase_service_role_key
        return {"apikey": key, "Authorization": f"Bearer {key}"}

    @staticmethod
    def _parse(response: httpx.Response) -> dict:
        try:
            body = response.json()
        except ValueError as err:
            raise SupabaseStorageError(
                f"Supabase Storage returned a non-JSON response (HTTP {response.status_code})"
            ) from err
        if response.status_code >= 400:
            raise SupabaseStorageError(body.get("message", f"Supabase Storage request failed (HTTP {response.status_code})"))
        return body

    async def create_signed_upload_url(self, path: str) -> dict:
        """Returns {"upload_url": <absolute PUT target, token embedded>,
        "path": path}. The client PUTs raw file bytes there directly — the
        file never passes through our backend."""
        base = self._base_url()
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{base}/object/upload/sign/{settings.supabase_evidence_bucket}/{path}",
                headers=self._headers(),
                json={},
            )
        body = self._parse(response)
        relative_url = body.get("url")
        if not relative_url:
            raise SupabaseStorageError("Supabase Storage did not return an upload url")
        return {"upload_url": f"{base}{relative_url}", "path": path}

    async def create_signed_download_url(self, path: str) -> str:
        """Returns a short-lived, absolute signed GET URL. Never cache or
        persist this — mint a fresh one on every read."""
        base = self._base_url()
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{base}/object/sign/{settings.supabase_evidence_bucket}/{path}",
                headers=self._headers(),
                json={"expiresIn": settings.evidence_signed_url_ttl_seconds},
            )
        body = self._parse(response)
        relative_url = body.get("signedURL")
        if not relative_url:
            raise SupabaseStorageError("Supabase Storage did not return a signed download url")
        return f"{base}{relative_url}"


supabase_storage = SupabaseStorageClient()
