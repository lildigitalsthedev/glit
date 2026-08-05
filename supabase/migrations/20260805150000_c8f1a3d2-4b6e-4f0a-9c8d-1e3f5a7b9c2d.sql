-- Server-side rate limiting for abuse-prone actions (AI calls, GitHub
-- writes, feature-request submissions). Counts are tracked in fixed windows
-- per (user_id, bucket) and incremented atomically via a SECURITY DEFINER
-- function, so concurrent requests can't race past the limit the way a
-- naive select-then-update in application code would allow.
--
-- Like `user_roles`, this table is never touched by client code — only the
-- service-role key from *.server.ts, via the RPC function below.
CREATE TABLE public.rate_limits (
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies at all: RLS with zero policies denies every row to every
-- role except service_role, which bypasses RLS entirely.
GRANT ALL ON public.rate_limits TO service_role;

-- Atomically increments the counter for (user_id, bucket), resetting it to
-- 1 if the fixed window has rolled over, and returns the count *after*
-- this request. Callers compare that against their own limit — see
-- `assertRateLimit` in src/lib/rate-limit.server.ts.
CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_user_id UUID,
  p_bucket TEXT,
  p_window_seconds INT
) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO public.rate_limits (user_id, bucket, window_start, count)
  VALUES (p_user_id, p_bucket, now(), 1)
  ON CONFLICT (user_id, bucket) DO UPDATE SET
    count = CASE
      WHEN public.rate_limits.window_start <= now() - make_interval(secs => p_window_seconds)
        THEN 1
      ELSE public.rate_limits.count + 1
    END,
    window_start = CASE
      WHEN public.rate_limits.window_start <= now() - make_interval(secs => p_window_seconds)
        THEN now()
      ELSE public.rate_limits.window_start
    END
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_rate_limit(UUID, TEXT, INT) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(UUID, TEXT, INT) TO service_role;

-- Periodic cleanup isn't required for correctness (rows are tiny and keyed
-- by bucket, not by request), but keeps the table from growing forever as
-- new buckets get added over time. Safe to run manually or on a schedule;
-- not wired to a cron job here.
CREATE OR REPLACE FUNCTION public.prune_stale_rate_limits() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '7 days';
$$;

REVOKE ALL ON FUNCTION public.prune_stale_rate_limits() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.prune_stale_rate_limits() TO service_role;
