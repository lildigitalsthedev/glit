-- Feature 5: Shared AI Prompt Library. Every workspace gets a shared set of
-- reusable prompts. Follows the same access pattern as workspace_members/
-- workspace_invitations: RLS is enabled with no policies for `authenticated`,
-- so the client never talks to these tables directly — every read and write
-- goes through a server function that has already checked the caller's role
-- via `requireCapability`/`requireActiveWorkspaceCapability`, then uses the
-- service-role client.

CREATE TABLE public.workspace_prompts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  body text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspace_prompts_workspace_idx ON public.workspace_prompts (workspace_id);
CREATE INDEX workspace_prompts_category_idx ON public.workspace_prompts (workspace_id, category);

GRANT SELECT ON public.workspace_prompts TO authenticated;
GRANT ALL ON public.workspace_prompts TO service_role;
ALTER TABLE public.workspace_prompts ENABLE ROW LEVEL SECURITY;

-- One row per saved edit, snapshotted *before* the edit is applied, so
-- version N's row always holds what the prompt looked like before it became
-- version N+1 on workspace_prompts itself.
CREATE TABLE public.workspace_prompt_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_id uuid NOT NULL REFERENCES public.workspace_prompts(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL,
  category text NOT NULL,
  body text NOT NULL,
  edited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prompt_id, version)
);
CREATE INDEX workspace_prompt_versions_prompt_idx ON public.workspace_prompt_versions (prompt_id, version DESC);

GRANT SELECT ON public.workspace_prompt_versions TO authenticated;
GRANT ALL ON public.workspace_prompt_versions TO service_role;
ALTER TABLE public.workspace_prompt_versions ENABLE ROW LEVEL SECURITY;

-- Favorites are personal — same shape as repo_prefs.is_favorite, just for
-- prompts instead of repos.
CREATE TABLE public.workspace_prompt_favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt_id uuid NOT NULL REFERENCES public.workspace_prompts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, prompt_id)
);

GRANT SELECT ON public.workspace_prompt_favorites TO authenticated;
GRANT ALL ON public.workspace_prompt_favorites TO service_role;
ALTER TABLE public.workspace_prompt_favorites ENABLE ROW LEVEL SECURITY;
