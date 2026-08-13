-- Feature 9: Audit Logs. Reuses `workspace_activity` (Feature 6) as the
-- single source of truth rather than a parallel table — an audit log is
-- fundamentally "every event that already happens, made searchable" and
-- duplicating storage would just risk the two falling out of sync. This
-- migration only adds the previously-missing action types so every
-- category the audit page tracks (Login, Repository changes, Pushes,
-- Settings changes, Member actions, AI usage, API key changes) actually
-- has a matching enum value, plus an index for the action-type filter.

ALTER TYPE public.workspace_activity_action ADD VALUE IF NOT EXISTS 'login';
ALTER TYPE public.workspace_activity_action ADD VALUE IF NOT EXISTS 'member_invited';
ALTER TYPE public.workspace_activity_action ADD VALUE IF NOT EXISTS 'member_left';
ALTER TYPE public.workspace_activity_action ADD VALUE IF NOT EXISTS 'member_role_changed';
ALTER TYPE public.workspace_activity_action ADD VALUE IF NOT EXISTS 'ownership_transferred';
ALTER TYPE public.workspace_activity_action ADD VALUE IF NOT EXISTS 'workspace_archived';
ALTER TYPE public.workspace_activity_action ADD VALUE IF NOT EXISTS 'ai_chat';
ALTER TYPE public.workspace_activity_action ADD VALUE IF NOT EXISTS 'ai_commit_message';
ALTER TYPE public.workspace_activity_action ADD VALUE IF NOT EXISTS 'team_key_updated';

-- The existing workspace_activity_workspace_idx (workspace_id, created_at)
-- already serves the plain newest-first feed. The audit page additionally
-- filters by action type constantly (the category chips), so a composite
-- index on (workspace_id, action, created_at) keeps that filtered+sorted
-- query index-only instead of falling back to a sequential scan per page.
CREATE INDEX workspace_activity_workspace_action_idx
  ON public.workspace_activity (workspace_id, action, created_at DESC);
