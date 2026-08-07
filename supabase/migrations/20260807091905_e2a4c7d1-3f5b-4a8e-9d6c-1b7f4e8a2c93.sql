-- Favorite paths previously only tracked folders. This adds a `kind` column
-- so individual files can be pinned too, alongside folders, without needing
-- a second table (the existing full_name+path uniqueness still applies).
ALTER TABLE public.favorite_paths
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'folder' CHECK (kind IN ('file', 'folder'));
