-- GitPush Pro billing, for real: Paystack-verified subscriptions.
--
-- SECURITY FIX: `user_preferences` grants `authenticated` full ALL access
-- to their own row (see `prefs_own` policy), which meant `plan` — despite
-- `setPlan` looking like the only way to change it — could be flipped to
-- 'pro' by anyone calling `supabase.from('user_preferences').update(...)`
-- directly with their own session, completely bypassing application code
-- (and `assertPro` in ai/gate.server.ts trusted that same column). That
-- column is dropped below. `user_roles.subscription_plan` becomes the sole
-- source of truth for plan — it already has zero client write grants, the
-- same pattern this table has always used for `role` and `developer_mode`.
-- Only the service-role key (used exclusively by the Paystack webhook
-- handler after signature verification) may ever set it to 'pro'.
ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_plan_check;

ALTER TABLE public.user_preferences
  DROP COLUMN IF EXISTS plan,
  DROP COLUMN IF EXISTS plan_updated_at;

-- One row per user tracking their Paystack subscription. Mirrors the
-- `oauth_states`/`rate_limits` pattern: RLS enabled with zero policies, and
-- no GRANT to `authenticated` at all, so this is unreadable and unwritable
-- from the browser under any circumstance — only `supabaseAdmin` (service
-- role), from `src/lib/paystack/*.server.ts`, ever touches it.
--
-- `paystack_email_token` is required by Paystack's "Disable Subscription"
-- endpoint alongside the subscription code — it's not a secret in the same
-- sense as an API key, but there's no reason to expose it to the client
-- either, so it lives here rather than anywhere client-readable.
CREATE TABLE public.subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  paystack_customer_code TEXT,
  paystack_subscription_code TEXT,
  paystack_email_token TEXT,
  paystack_plan_code TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  current_period_end TIMESTAMPTZ,
  last_event TEXT,
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('inactive', 'active', 'non-renewing', 'attention', 'completed', 'cancelled'));

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
-- No policies at all: RLS with zero policies denies every row to every
-- role except service_role, which bypasses RLS entirely.
GRANT ALL ON public.subscriptions TO service_role;

CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
