-- Feature 10: Workspace Settings. `workspaces` already had name, description,
-- avatar_url, default_branch, and default_folder from earlier migrations —
-- this only adds what was still missing: repository creation defaults, one
-- real security policy (force everyone onto the team's shared AI keys
-- instead of personal BYO ones), and a default role to prefill invites with.

ALTER TABLE public.workspaces
  ADD COLUMN default_repo_visibility text NOT NULL DEFAULT 'private',
  ADD COLUMN default_repo_auto_init boolean NOT NULL DEFAULT true,
  ADD COLUMN default_gitignore_template text,
  ADD COLUMN default_license_template text,
  ADD COLUMN require_team_ai_keys boolean NOT NULL DEFAULT false,
  ADD COLUMN default_invite_role text NOT NULL DEFAULT 'developer';

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_default_repo_visibility_check
    CHECK (default_repo_visibility IN ('private', 'public')),
  ADD CONSTRAINT workspaces_default_invite_role_check
    CHECK (default_invite_role IN ('admin', 'developer', 'viewer'));
