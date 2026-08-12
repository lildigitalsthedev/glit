-- Feature 8: Team API Key Management. Shared, workspace-owned AI provider
-- credentials, distinct from `ai_providers` (which is BYO-per-user). A
-- workspace Owner/Admin adds one key per provider for the whole team;
-- Developers can use it for AI tools but never see or export the plaintext;
-- Viewers have no access at all. Enforced two ways:
--   1. Column-level GRANT never exposes `api_key_ciphertext` to `authenticated`.
--   2. RLS is enabled with zero policies for `authenticated` (same pattern as
--      workspace_prompts/workspace_activity), so the client can't read this
--      table directly under any role — every read/write goes through
--      src/lib/workspaces/ai-providers.server.ts, which re-derives the
--      caller's workspace role and checks `keys:manage`/`keys:use` from the
--      `permissions.ts` capability matrix before touching a row.

ALTER TYPE public.workspace_activity_action ADD VALUE IF NOT EXISTS 'team_key_added';
ALTER TYPE public.workspace_activity_action ADD VALUE IF NOT EXISTS 'team_key_removed';

CREATE TABLE public.workspace_ai_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  label text,
  api_key_ciphertext text NOT NULL,
  key_hint text NOT NULL DEFAULT '',
  base_url text,
  model text,
  enabled boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider)
);

CREATE INDEX workspace_ai_providers_workspace_idx ON public.workspace_ai_providers (workspace_id);

-- Same shape as ai_providers' column-level grant: every safe column, never
-- api_key_ciphertext. Irrelevant in practice since RLS below has no
-- authenticated policies (defence in depth, not the actual gate).
GRANT SELECT (
  id, workspace_id, provider, label, key_hint, base_url, model, enabled,
  is_default, created_by, updated_by, created_at, updated_at
) ON public.workspace_ai_providers TO authenticated;
GRANT ALL ON public.workspace_ai_providers TO service_role;

ALTER TABLE public.workspace_ai_providers ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER workspace_ai_providers_updated_at
  BEFORE UPDATE ON public.workspace_ai_providers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
