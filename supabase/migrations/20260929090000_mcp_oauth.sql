-- OAuth support for remote MCP clients such as Claude.
CREATE TABLE public.mcp_oauth_clients (
  client_id text PRIMARY KEY,
  client_name text NOT NULL,
  redirect_uris jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.mcp_oauth_clients TO service_role;

CREATE TABLE public.mcp_oauth_codes (
  code_hash text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.mcp_oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  resource text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mcp_oauth_codes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.mcp_oauth_codes TO service_role;
CREATE INDEX mcp_oauth_codes_expiry_idx ON public.mcp_oauth_codes (expires_at);

CREATE TABLE public.mcp_oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.mcp_oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource text NOT NULL,
  access_token_hash text NOT NULL UNIQUE,
  refresh_token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mcp_oauth_tokens ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.mcp_oauth_tokens TO service_role;
CREATE INDEX mcp_oauth_tokens_expiry_idx ON public.mcp_oauth_tokens (expires_at);
