CREATE TABLE public.ai_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  provider text NOT NULL,
  label text,
  api_key_ciphertext text NOT NULL,
  key_hint text NOT NULL DEFAULT '',
  base_url text,
  model text,
  enabled boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX ai_providers_user_idx ON public.ai_providers (user_id);

GRANT SELECT (id, user_id, provider, label, key_hint, base_url, model, enabled, is_default, created_at, updated_at) ON public.ai_providers TO authenticated;
GRANT ALL ON public.ai_providers TO service_role;

ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own AI providers"
  ON public.ai_providers FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER ai_providers_updated_at
  BEFORE UPDATE ON public.ai_providers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();