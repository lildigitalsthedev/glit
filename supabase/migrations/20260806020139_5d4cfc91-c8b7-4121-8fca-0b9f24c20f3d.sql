REVOKE ALL ON FUNCTION public.increment_rate_limit(uuid, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(uuid, text, integer) TO service_role;