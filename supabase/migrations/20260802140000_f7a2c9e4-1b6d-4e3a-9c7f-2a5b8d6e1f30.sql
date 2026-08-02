-- Feature requests: users can suggest a feature from Settings. If it ships,
-- support follows up using the email/username given here to grant 1 year of
-- free access — including to Pro features — as a thank-you. There's no
-- automatic entitlement wired up yet; this table just captures the request
-- (see the note on `setPlan` in workspace.functions.ts re: plan changes
-- still being manual while billing is in development).
CREATE TABLE public.feature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  gitpush_username TEXT NOT NULL,
  email TEXT NOT NULL,
  feature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.feature_requests TO authenticated;
GRANT ALL ON public.feature_requests TO service_role;
ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feature_requests_select_own" ON public.feature_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "feature_requests_insert_own" ON public.feature_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX feature_requests_user_created_idx ON public.feature_requests (user_id, created_at DESC);
