CREATE TABLE public.mcp_access_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.mcp_access_keys TO authenticated;
GRANT ALL ON public.mcp_access_keys TO service_role;
ALTER TABLE public.mcp_access_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own MCP keys" ON public.mcp_access_keys FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own MCP keys" ON public.mcp_access_keys FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX mcp_access_keys_user_idx ON public.mcp_access_keys(user_id);