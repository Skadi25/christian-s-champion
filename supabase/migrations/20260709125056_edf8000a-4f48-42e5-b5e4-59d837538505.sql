
-- 1. Suchanfragen-Cache auf Claims
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS query_variants jsonb,
  ADD COLUMN IF NOT EXISTS query_variants_generated_at timestamptz;

-- 2. Pipeline-Protokoll pro Discovery-Run
CREATE TABLE public.discovery_run_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.discovery_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage_index integer NOT NULL,
  stage_name text NOT NULL,
  input_count integer NOT NULL DEFAULT 0,
  output_count integer NOT NULL DEFAULT 0,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_run_stages TO authenticated;
GRANT ALL ON public.discovery_run_stages TO service_role;
ALTER TABLE public.discovery_run_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_run_stages" ON public.discovery_run_stages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ix_run_stages_run ON public.discovery_run_stages(run_id, stage_index);

-- 3. Video-Statistik-Schnappschüsse (für Trend-Wachstum)
CREATE TABLE public.video_stats_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  view_count bigint,
  like_count bigint,
  comment_count bigint
);

GRANT SELECT ON public.video_stats_snapshots TO authenticated;
GRANT ALL ON public.video_stats_snapshots TO service_role;
ALTER TABLE public.video_stats_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all_snapshots" ON public.video_stats_snapshots
  FOR SELECT TO authenticated USING (true);
CREATE INDEX ix_snapshots_video_time ON public.video_stats_snapshots(video_id, captured_at DESC);

-- 4. Watchlist (Kanäle & Videos)
CREATE TABLE public.watchlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('channel','video')),
  platform text NOT NULL,
  external_id text NOT NULL,
  label text,
  thumbnail_url text,
  url text,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, kind, external_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist_items TO authenticated;
GRANT ALL ON public.watchlist_items TO service_role;
ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_watchlist" ON public.watchlist_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER watchlist_touch BEFORE UPDATE ON public.watchlist_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- 5. Claim × Stance Lern-Präferenzen
CREATE TABLE public.claim_stance_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  stance text NOT NULL,
  positive_count integer NOT NULL DEFAULT 0,
  negative_count integer NOT NULL DEFAULT 0,
  neutral_count integer NOT NULL DEFAULT 0,
  affinity numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, claim_id, stance)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.claim_stance_preferences TO authenticated;
GRANT ALL ON public.claim_stance_preferences TO service_role;
ALTER TABLE public.claim_stance_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_claim_stance_prefs" ON public.claim_stance_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER claim_stance_prefs_touch BEFORE UPDATE ON public.claim_stance_preferences
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
