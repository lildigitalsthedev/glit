-- Role & Admin system: owner / admin / user.
--
-- IMPORTANT: unlike user_preferences, this table is NOT writable by
-- authenticated clients at all — there is no RLS policy and no GRANT for
-- INSERT/UPDATE/DELETE to `authenticated`. The only writers are the
-- service-role key (used exclusively from *.server.ts files on the
-- backend). Clients can only ever read their own row. This is what makes
-- role/plan/developer-mode tampering impossible from the browser, even if
-- someone calls Supabase directly with their own JWT instead of going
-- through our server functions.
CREATE TABLE public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user',
  subscription_plan TEXT NOT NULL DEFAULT 'free',
  developer_mode BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check CHECK (role IN ('user', 'admin', 'owner'));

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_plan_check CHECK (subscription_plan IN ('free', 'pro'));

-- Only ever one owner.
CREATE UNIQUE INDEX user_roles_single_owner_idx ON public.user_roles ((role = 'owner')) WHERE role = 'owner';

-- Clients may only SELECT their own row — no INSERT/UPDATE/DELETE grants at
-- all, so RLS policies for those operations would be moot; we simply never
-- grant the privilege in the first place.
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER user_roles_updated_at BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Every new account (email or Google) gets a role row the moment it's
-- created, same as profiles/user_preferences. Starts out as a plain "user"
-- on the "free" plan — there is intentionally no signup-time way to pick
-- owner or admin.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_preferences (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_roles (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
