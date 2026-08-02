CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_own" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_preferences (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TABLE public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'dark',
  editor_font_size INTEGER NOT NULL DEFAULT 13,
  tab_width INTEGER NOT NULL DEFAULT 2,
  word_wrap BOOLEAN NOT NULL DEFAULT true,
  auto_save BOOLEAN NOT NULL DEFAULT true,
  notifications BOOLEAN NOT NULL DEFAULT true,
  default_branch TEXT,
  default_folder TEXT,
  active_account_id UUID,
  active_repo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prefs_own" ON public.user_preferences FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER prefs_updated_at BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.github_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  login TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  label TEXT,
  connection_type TEXT NOT NULL DEFAULT 'pat',
  encrypted_token TEXT NOT NULL,
  token_hint TEXT NOT NULL DEFAULT '',
  scopes TEXT,
  repo_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'connected',
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, login)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.github_accounts TO authenticated;
GRANT ALL ON public.github_accounts TO service_role;
ALTER TABLE public.github_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts_own" ON public.github_accounts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER accounts_updated_at BEFORE UPDATE ON public.github_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.repo_prefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  account_id UUID REFERENCES public.github_accounts ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  preferred_branch TEXT,
  working_folder TEXT,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, full_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repo_prefs TO authenticated;
GRANT ALL ON public.repo_prefs TO service_role;
ALTER TABLE public.repo_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "repo_prefs_own" ON public.repo_prefs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER repo_prefs_updated_at BEFORE UPDATE ON public.repo_prefs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.favorite_paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT,
  path TEXT NOT NULL,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  use_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, full_name, path)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorite_paths TO authenticated;
GRANT ALL ON public.favorite_paths TO service_role;
ALTER TABLE public.favorite_paths ENABLE ROW LEVEL SECURITY;
CREATE POLICY "favorite_paths_own" ON public.favorite_paths FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.recent_pushes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  account_id UUID REFERENCES public.github_accounts ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  branch TEXT NOT NULL,
  path TEXT NOT NULL,
  commit_message TEXT NOT NULL,
  commit_sha TEXT,
  commit_url TEXT,
  action TEXT NOT NULL DEFAULT 'update',
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recent_pushes TO authenticated;
GRANT ALL ON public.recent_pushes TO service_role;
ALTER TABLE public.recent_pushes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recent_pushes_own" ON public.recent_pushes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX recent_pushes_user_created_idx ON public.recent_pushes (user_id, created_at DESC);

CREATE TABLE public.drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  branch TEXT NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  base_sha TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, full_name, branch, path)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drafts TO authenticated;
GRANT ALL ON public.drafts TO service_role;
ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drafts_own" ON public.drafts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER drafts_updated_at BEFORE UPDATE ON public.drafts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();