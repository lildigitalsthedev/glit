-- Appearance + code-editor customization.
--
-- `theme` already existed (default 'dark') but was never actually wired up
-- to anything client-side — the app always rendered dark, so it just sat
-- there unused. It's now the source of truth for the app-wide Light / Dark
-- / System setting, so no migration of existing values is needed: everyone
-- already has 'dark' stored, which is exactly the appearance they're used
-- to seeing.
--
-- accent_color is nullable and defaults to NULL, meaning "use the built-in
-- default cyan accent" — existing users see zero change until they
-- deliberately pick a color in Settings.
ALTER TABLE public.user_preferences
  ADD COLUMN accent_color TEXT,
  ADD COLUMN editor_theme TEXT NOT NULL DEFAULT 'dark',
  ADD COLUMN editor_font TEXT NOT NULL DEFAULT 'jetbrains-mono',
  ADD COLUMN editor_line_height NUMERIC NOT NULL DEFAULT 1.5,
  ADD COLUMN editor_minimap BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_theme_check CHECK (theme IN ('light', 'dark', 'system'));

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_accent_color_check
  CHECK (accent_color IS NULL OR accent_color ~* '^#[0-9a-f]{6}$');

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_editor_line_height_check
  CHECK (editor_line_height BETWEEN 1 AND 2.5);
