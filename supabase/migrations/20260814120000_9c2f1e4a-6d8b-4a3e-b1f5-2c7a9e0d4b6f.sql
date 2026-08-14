-- Undo-push support. `recent_pushes` already records every push (see the
-- original migration) with its commit sha, so the only thing missing to
-- support "undo this push" safely is a marker for whether it's already
-- been undone — undoPush() (github.functions.ts) checks this, plus that the
-- branch ref still points at that exact commit, before force-moving the
-- ref back to the commit's parent.
ALTER TABLE public.recent_pushes ADD COLUMN IF NOT EXISTS undone_at TIMESTAMPTZ;

-- New workspace_activity action for the audit trail (Feature 9's enum —
-- see the 20260812* migrations for the same pattern).
ALTER TYPE public.workspace_activity_action ADD VALUE IF NOT EXISTS 'push_undone';
