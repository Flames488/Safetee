# Evidence storage (Supabase)

SOS evidence (audio/video/photo captured during an active alert) is stored
in a private Supabase Storage bucket. Nothing here is ever public — every
read goes through a signed URL minted server-side with the service role
key, valid for `EVIDENCE_SIGNED_URL_TTL_SECONDS` (default 1 hour).

## One-time setup

1. Create a Supabase project (the free tier is enough to start).
2. Storage → New bucket → name it to match `SUPABASE_EVIDENCE_BUCKET`
   (default `sos-evidence`) → **Public bucket: off**. Leave it private —
   the app never relies on bucket-level public access.
3. Settings → API → copy the **Project URL** and the **service_role**
   key (not the anon key — the service role key is required to mint
   signed URLs against a private bucket).
4. Set in `backend/.env`:
   ```
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service role key>
   SUPABASE_EVIDENCE_BUCKET=sos-evidence
   ```

## Free-tier storage budget

Supabase's free tier is capped (roughly 1GB storage / 2GB egress at time
of writing — check current limits before relying on this). Recording is
capped per SOS event via `EVIDENCE_MAX_AUDIO_CHUNKS` /
`EVIDENCE_MAX_VIDEO_CHUNKS` / `EVIDENCE_MAX_PHOTOS` in `config.py`
specifically to keep real usage inside that budget — raise these only
once there's a paid storage tier behind them, and see Phase 7 of the
evidence/emergency-numbers plan for the retention job that expires old
evidence objects automatically.
