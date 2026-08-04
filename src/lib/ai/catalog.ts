/**
 * The "Bring Your Own AI" provider catalog.
 *
 * Client-safe on purpose: it holds no secrets, just the metadata both the
 * settings UI and the server-side caller need — display name, API base URL,
 * a sensible default model, and which request shape the provider speaks.
 *
 * Everything except Anthropic and Google Gemini speaks the OpenAI
 * `/chat/completions` shape, which is why `wire` only has three values.
 */
export type ProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "openrouter"
  | "deepseek"
  | "mistral"
  | "together"
  | "compatible";

export type ProviderWire = "openai" | "anthropic" | "google";

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  wire: ProviderWire;
  /** Default API base URL. Empty for "OpenAI-compatible", where the user supplies it. */
  baseUrl: string;
  defaultModel: string;
  keyPlaceholder: string;
  /** True when the user must type their own base URL. */
  requiresBaseUrl?: boolean;
  docsUrl: string;
}

export const AI_PROVIDERS: readonly ProviderMeta[] = [
  {
    id: "openai",
    label: "OpenAI",
    wire: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    keyPlaceholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    wire: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
    keyPlaceholder: "sk-ant-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "google",
    label: "Google Gemini",
    wire: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.5-flash",
    keyPlaceholder: "AIza...",
    docsUrl: "https://aistudio.google.com/app/apikey",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    wire: "openai",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-3",
    keyPlaceholder: "xai-...",
    docsUrl: "https://console.x.ai",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    wire: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    keyPlaceholder: "sk-or-...",
    docsUrl: "https://openrouter.ai/keys",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    wire: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    keyPlaceholder: "sk-...",
    docsUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "mistral",
    label: "Mistral",
    wire: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    keyPlaceholder: "...",
    docsUrl: "https://console.mistral.ai/api-keys",
  },
  {
    id: "together",
    label: "Together AI",
    wire: "openai",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    keyPlaceholder: "...",
    docsUrl: "https://api.together.ai/settings/api-keys",
  },
  {
    id: "compatible",
    label: "OpenAI-compatible API",
    wire: "openai",
    baseUrl: "",
    defaultModel: "",
    keyPlaceholder: "...",
    requiresBaseUrl: true,
    docsUrl: "https://platform.openai.com/docs/api-reference/chat",
  },
] as const;

export function providerMeta(id: string): ProviderMeta | undefined {
  return AI_PROVIDERS.find((provider) => provider.id === id);
}

export function providerLabel(id: string): string {
  return providerMeta(id)?.label ?? id;
}