-- GitPush Pro: track each user's plan on their preferences row.
ALTER TABLE public.user_preferences
  ADD COLUMN plan TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN plan_updated_at TIMESTAMPTZ;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_plan_check CHECK (plan IN ('free', 'pro'));
