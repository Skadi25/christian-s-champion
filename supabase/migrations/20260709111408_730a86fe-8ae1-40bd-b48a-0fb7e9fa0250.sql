
-- Videos: enrich for Discovery (transcript, raw metadata) and enforce uniqueness per platform
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS transcript text,
  ADD COLUMN IF NOT EXISTS raw_metadata jsonb;

ALTER TABLE public.videos
  DROP CONSTRAINT IF EXISTS videos_platform_external_id_key;
ALTER TABLE public.videos
  ADD CONSTRAINT videos_platform_external_id_key UNIQUE (platform, external_id);

-- Video matches: track AI reasoning + prevent duplicates per user/video/claim
ALTER TABLE public.video_matches
  ADD COLUMN IF NOT EXISTS matched_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_reasoning text,
  ADD COLUMN IF NOT EXISTS ai_confidence numeric;

ALTER TABLE public.video_matches
  DROP CONSTRAINT IF EXISTS video_matches_user_video_claim_key;
ALTER TABLE public.video_matches
  ADD CONSTRAINT video_matches_user_video_claim_key UNIQUE (user_id, video_id, claim_id);

-- Discovery run log
CREATE TABLE IF NOT EXISTS public.discovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  videos_scanned int NOT NULL DEFAULT 0,
  videos_matched int NOT NULL DEFAULT 0,
  error text
);

GRANT SELECT ON public.discovery_runs TO authenticated;
GRANT ALL ON public.discovery_runs TO service_role;

ALTER TABLE public.discovery_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discovery_runs_select_own ON public.discovery_runs;
CREATE POLICY discovery_runs_select_own ON public.discovery_runs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS discovery_runs_user_started_idx
  ON public.discovery_runs (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS video_matches_user_score_idx
  ON public.video_matches (user_id, opportunity_score DESC NULLS LAST);
