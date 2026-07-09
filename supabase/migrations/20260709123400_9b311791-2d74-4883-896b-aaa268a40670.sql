
ALTER TABLE public.video_matches ADD COLUMN IF NOT EXISTS stance TEXT;

CREATE TABLE IF NOT EXISTS public.stance_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stance TEXT NOT NULL,
  positive_count INTEGER NOT NULL DEFAULT 0,
  neutral_count INTEGER NOT NULL DEFAULT 0,
  negative_count INTEGER NOT NULL DEFAULT 0,
  affinity NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, stance)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stance_preferences TO authenticated;
GRANT ALL ON public.stance_preferences TO service_role;

ALTER TABLE public.stance_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own stance prefs"
  ON public.stance_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER stance_preferences_touch
  BEFORE UPDATE ON public.stance_preferences
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
