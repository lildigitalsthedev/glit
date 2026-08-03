ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_updated_at timestamptz;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_plan_check CHECK (plan IN ('free','pro'));

CREATE TABLE public.recent_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid,
  full_name text NOT NULL,
  branch text NOT NULL,
  path text NOT NULL,
  open_count integer NOT NULL DEFAULT 1,
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, full_name, branch, path)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recent_files TO authenticated;
GRANT ALL ON public.recent_files TO service_role;
ALTER TABLE public.recent_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own recent files"
  ON public.recent_files FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_recent_files_updated_at
  BEFORE UPDATE ON public.recent_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.feature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gitpush_username text NOT NULL,
  email text NOT NULL,
  feature text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.feature_requests TO authenticated;
GRANT ALL ON public.feature_requests TO service_role;
ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can submit their own feature requests"
  ON public.feature_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own feature requests"
  ON public.feature_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER set_feature_requests_updated_at
  BEFORE UPDATE ON public.feature_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();