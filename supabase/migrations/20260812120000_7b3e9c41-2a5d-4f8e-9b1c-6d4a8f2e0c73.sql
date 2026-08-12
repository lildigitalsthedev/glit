-- Feature 6: Team Activity Feed. One append-only table shared by every
-- event type the feed shows (repo created/deleted, push completed, AI
-- generation/edit, prompt created, member joined/removed, workspace
-- updated) rather than a table per event — the feed only ever needs to
-- read "the last N things that happened in this workspace", and a single
-- ordered table is the simplest thing that supports that.
--
-- Follows the exact same access pattern as workspace_prompts/workspace_members:
-- RLS is enabled with no policies for `authenticated`, so the client never
-- talks to this table directly — every write goes through `logActivity`
-- (best-effort, called after the real action already succeeded) and every
-- read goes through `listActivity`, both in workspaces/activity.server.ts,
-- gated on the caller's `activity:view` capability.

CREATE TYPE public.workspace_activity_action AS ENUM (
  'repository_created',
  'repository_deleted',
  'push_completed',
  'ai_generation',
  'ai_edit',
  'prompt_created',
  'member_joined',
  'member_removed',
  'workspace_updated'
);

CREATE TABLE public.workspace_activity (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action public.workspace_activity_action NOT NULL,
  repo_full_name text,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workspace_activity_workspace_idx ON public.workspace_activity (workspace_id, created_at DESC);

GRANT SELECT ON public.workspace_activity TO authenticated;
GRANT ALL ON public.workspace_activity TO service_role;
ALTER TABLE public.workspace_activity ENABLE ROW LEVEL SECURITY;

-- Bounds the table's growth the same way rate_limits is pruned — activity
-- older than 180 days has no product use and this keeps the feed's
-- indexes small indefinitely. Not wired to a schedule here, same as
-- prune_stale_rate_limits; safe to invoke manually or from a cron job.
CREATE OR REPLACE FUNCTION public.prune_stale_workspace_activity() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.workspace_activity WHERE created_at < now() - interval '180 days';
$$;

REVOKE ALL ON FUNCTION public.prune_stale_workspace_activity() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.prune_stale_workspace_activity() TO service_role;
