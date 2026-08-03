-- Add the "developer" role.
--
-- Hierarchy:
--   Owner
--   ├── Admin
--   ├── Developer
--   └── User
--
-- Developers get development/debugging tooling (feature flags, logs, cache,
-- diagnostics) without business or security-sensitive administration —
-- Admin does NOT imply Developer, and Developer does NOT imply Admin.
-- Only the Owner may create, remove, promote, or demote Developers; this
-- migration only widens the allowed values, it does not change who is
-- allowed to write to `user_roles` (still service-role only, see the
-- original table comment).

ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_role_check;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check CHECK (role IN ('user', 'developer', 'admin', 'owner'));

-- Feature flags: managed from the Developer Dashboard by Developers and the
-- Owner. Readable by any authenticated user (so app code can gate UI behind
-- a flag), but — same pattern as `user_roles` — there is no INSERT/UPDATE/
-- DELETE grant for `authenticated` at all, so only the service-role client
-- (used exclusively from *.server.ts, after re-checking the caller's role)
-- can ever change one.
CREATE TABLE public.feature_flags (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feature_flags_select_all" ON public.feature_flags FOR SELECT TO authenticated USING (true);
CREATE TRIGGER feature_flags_updated_at BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.feature_flags (key, label, description, enabled) VALUES
  ('ai_commit_assist', 'AI commit message assist', 'AI-suggested commit messages in the push dialog.', false),
  ('mobile_upload_v2', 'Mobile upload workflow v2', 'Reworked drag/drop + camera upload flow for small screens.', false),
  ('new_diff_viewer', 'New diff viewer', 'Side-by-side diff rendering in the file editor.', false)
ON CONFLICT (key) DO NOTHING;
