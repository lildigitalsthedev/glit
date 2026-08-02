CREATE TABLE public.recent_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  account_id UUID REFERENCES public.github_accounts ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  branch TEXT NOT NULL,
  path TEXT NOT NULL,
  open_count INTEGER NOT NULL DEFAULT 1,
  last_opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, full_name, branch, path)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recent_files TO authenticated;
GRANT ALL ON public.recent_files TO service_role;
ALTER TABLE public.recent_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recent_files_own" ON public.recent_files FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX recent_files_user_repo_branch_idx ON public.recent_files (user_id, full_name, branch, last_opened_at DESC);
