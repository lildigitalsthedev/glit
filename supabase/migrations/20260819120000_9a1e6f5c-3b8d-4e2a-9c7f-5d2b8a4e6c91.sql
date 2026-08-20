-- Repository Sharing: Temporary Public Repos + Expiring/Limited-Use Access
-- Links. Two independent features that share nothing at the GitHub level
-- (Feature 1 flips real GitHub visibility; Feature 2 never does) but share
-- the same shape of problem: something that must expire *server-side* even
-- if nobody's browser is open to see it happen, and an atomic usage counter
-- that can't be raced past by concurrent requests.
--
-- All four tables follow the existing `rate_limits` / `workspace_activity`
-- convention: RLS enabled with zero policies for `authenticated` (so the
-- client can never read/write them directly, regardless of grants), and
-- every read/write goes through service-role server code gated by the
-- existing per-workspace capability matrix (`repos:manage` for creating/
-- revoking, `activity:view` for the audit trail).

-- ---------------------------------------------------------------------
-- Feature 1: Temporary Public Repository
-- ---------------------------------------------------------------------
CREATE TABLE public.repo_temp_public (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.github_accounts(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Always true in practice (the feature only ever flips private -> public),
  -- kept explicit so a revert always has a source of truth for "back to what".
  previous_private boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'reverting', 'reverted', 'ended', 'error')),
  expires_at timestamptz NOT NULL,
  extended_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  last_error text,
  reverted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one active temporary-public window per repo at a time.
CREATE UNIQUE INDEX repo_temp_public_active_idx
  ON public.repo_temp_public (account_id, full_name)
  WHERE status = 'active';

CREATE INDEX repo_temp_public_sweep_idx
  ON public.repo_temp_public (status, expires_at);
CREATE INDEX repo_temp_public_workspace_idx
  ON public.repo_temp_public (workspace_id, created_at DESC);

ALTER TABLE public.repo_temp_public ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.repo_temp_public TO service_role;

-- Atomically claims due rows so two overlapping sweeps (the lazy check on
-- a status poll and the periodic cron sweep) can never both call GitHub to
-- revert the same repo. FOR UPDATE SKIP LOCKED means a concurrent caller
-- just skips rows another process already has a lock on rather than
-- blocking or double-processing them.
CREATE OR REPLACE FUNCTION public.claim_expired_temp_public(p_limit int DEFAULT 25)
RETURNS SETOF public.repo_temp_public
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.repo_temp_public
  SET status = 'reverting', updated_at = now()
  WHERE id IN (
    SELECT id FROM public.repo_temp_public
    WHERE status = 'active' AND expires_at <= now()
    ORDER BY expires_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_expired_temp_public(int) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.claim_expired_temp_public(int) TO service_role;

CREATE OR REPLACE FUNCTION public.prune_stale_repo_temp_public() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.repo_temp_public
  WHERE status IN ('reverted', 'ended', 'error') AND updated_at < now() - interval '90 days';
$$;

REVOKE ALL ON FUNCTION public.prune_stale_repo_temp_public() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.prune_stale_repo_temp_public() TO service_role;

-- ---------------------------------------------------------------------
-- Feature 2: Expiring / Limited-Use Access Links
-- ---------------------------------------------------------------------
CREATE TABLE public.repo_access_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.github_accounts(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('viewer', 'editor', 'developer', 'admin')),
  -- The link itself (a high-entropy random token) is never stored — only a
  -- SHA-256 hash of it, so a database read can't hand out working links.
  -- `token_prefix` is a short, non-secret slice used only for display
  -- ("Link •••3f9a") so an owner can tell links apart in the list UI.
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  allow_download boolean NOT NULL DEFAULT true,
  max_uses integer,
  uses_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'expired', 'exhausted')),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_uses IS NULL OR max_uses > 0)
);

CREATE INDEX repo_access_links_workspace_idx ON public.repo_access_links (workspace_id, created_at DESC);
CREATE INDEX repo_access_links_sweep_idx ON public.repo_access_links (status, expires_at);

ALTER TABLE public.repo_access_links ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.repo_access_links TO service_role;

CREATE TABLE public.repo_access_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  link_id uuid NOT NULL REFERENCES public.repo_access_links(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL UNIQUE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.github_accounts(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('viewer', 'editor', 'developer', 'admin')),
  allow_download boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX repo_access_sessions_link_idx ON public.repo_access_sessions (link_id);
CREATE INDEX repo_access_sessions_sweep_idx ON public.repo_access_sessions (expires_at);

ALTER TABLE public.repo_access_sessions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.repo_access_sessions TO service_role;

-- The recipient-facing audit trail (Activity Log for a link/temp-public
-- window). Deliberately separate from `workspace_activity` (Feature 6):
-- that table's action enum and RLS grants are built around authenticated
-- workspace members, but events here can legitimately have no actor at
-- all (an anonymous recipient reading a file through a redeemed link).
CREATE TABLE public.repo_share_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  link_id uuid REFERENCES public.repo_access_links(id) ON DELETE SET NULL,
  temp_public_id uuid REFERENCES public.repo_temp_public(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.repo_access_sessions(id) ON DELETE SET NULL,
  full_name text,
  event text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Never the raw IP — a salted hash, kept only for coarse abuse forensics
  -- (e.g. "was this the same requester hammering the endpoint").
  ip_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX repo_share_audit_workspace_idx ON public.repo_share_audit (workspace_id, created_at DESC);
CREATE INDEX repo_share_audit_link_idx ON public.repo_share_audit (link_id, created_at DESC);

GRANT SELECT ON public.repo_share_audit TO authenticated;
GRANT ALL ON public.repo_share_audit TO service_role;
ALTER TABLE public.repo_share_audit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.prune_stale_repo_share_audit() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.repo_share_audit WHERE created_at < now() - interval '180 days';
$$;

REVOKE ALL ON FUNCTION public.prune_stale_repo_share_audit() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.prune_stale_repo_share_audit() TO service_role;

-- Atomically consumes one use of an access link. A single UPDATE with the
-- usage guard in its WHERE clause — not a SELECT followed by an UPDATE —
-- is what makes this race-safe: Postgres takes a row lock on the first
-- matching UPDATE, so if two people redeem a link's last remaining use at
-- the same instant, the second one's WHERE clause simply no longer
-- matches once the first has committed, and it returns zero rows instead
-- of double-spending the use.
CREATE OR REPLACE FUNCTION public.redeem_access_link(p_token_hash text)
RETURNS SETOF public.repo_access_links
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.repo_access_links
  SET uses_count = uses_count + 1,
      last_used_at = now(),
      status = CASE
        WHEN max_uses IS NOT NULL AND uses_count + 1 >= max_uses THEN 'exhausted'
        ELSE status
      END
  WHERE token_hash = p_token_hash
    AND status = 'active'
    AND expires_at > now()
    AND (max_uses IS NULL OR uses_count < max_uses)
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_access_link(text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.redeem_access_link(text) TO service_role;

-- Marks links whose expiry has passed as 'expired' — belt-and-suspenders
-- alongside the `expires_at > now()` guard already in `redeem_access_link`
-- above; this just keeps the status column (and therefore the owner's
-- Access Links list) accurate even for links nobody has tried to open
-- since they lapsed.
CREATE OR REPLACE FUNCTION public.expire_stale_access_links() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.repo_access_links
  SET status = 'expired'
  WHERE status = 'active' AND expires_at <= now();
$$;

REVOKE ALL ON FUNCTION public.expire_stale_access_links() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.expire_stale_access_links() TO service_role;

-- ---------------------------------------------------------------------
-- Generic text-keyed rate limiter for anonymous requests (link redemption
-- attempts, token enumeration/guessing). `rate_limits` can't be reused
-- here since its key is a UUID FK into auth.users — there is no user for
-- an anonymous recipient guessing tokens, only an IP/token-prefix key.
-- ---------------------------------------------------------------------
CREATE TABLE public.link_rate_limits (
  key text NOT NULL PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.link_rate_limits ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.link_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.increment_text_rate_limit(p_key text, p_window_seconds int)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO public.link_rate_limits (key, window_start, count)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN public.link_rate_limits.window_start <= now() - make_interval(secs => p_window_seconds)
        THEN 1
      ELSE public.link_rate_limits.count + 1
    END,
    window_start = CASE
      WHEN public.link_rate_limits.window_start <= now() - make_interval(secs => p_window_seconds)
        THEN now()
      ELSE public.link_rate_limits.window_start
    END
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_text_rate_limit(text, int) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.increment_text_rate_limit(text, int) TO service_role;

CREATE OR REPLACE FUNCTION public.prune_stale_link_rate_limits() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.link_rate_limits WHERE window_start < now() - interval '7 days';
$$;

REVOKE ALL ON FUNCTION public.prune_stale_link_rate_limits() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.prune_stale_link_rate_limits() TO service_role;
