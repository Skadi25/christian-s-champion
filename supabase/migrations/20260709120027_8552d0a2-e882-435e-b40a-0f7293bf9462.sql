
-- 1. Feedback column on video_matches
ALTER TABLE public.video_matches
  ADD COLUMN IF NOT EXISTS user_feedback text
    CHECK (user_feedback IN ('relevant', 'neutral', 'not_relevant')),
  ADD COLUMN IF NOT EXISTS feedback_at timestamptz;

CREATE INDEX IF NOT EXISTS video_matches_user_feedback_idx
  ON public.video_matches (user_id, user_feedback)
  WHERE user_feedback IS NOT NULL;

-- 2. channel_preferences (learned per-user, per-channel)
CREATE TABLE IF NOT EXISTS public.channel_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  platform text NOT NULL DEFAULT 'youtube',
  channel_id text NOT NULL,
  channel_name text,
  positive_count integer NOT NULL DEFAULT 0,
  negative_count integer NOT NULL DEFAULT 0,
  neutral_count integer NOT NULL DEFAULT 0,
  affinity numeric NOT NULL DEFAULT 0, -- -1..+1
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, channel_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_preferences TO authenticated;
GRANT ALL ON public.channel_preferences TO service_role;

ALTER TABLE public.channel_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY channel_preferences_own_all ON public.channel_preferences
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER channel_preferences_touch
  BEFORE UPDATE ON public.channel_preferences
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
