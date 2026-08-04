import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Bring Your Own AI + AI code generation / file editing.
 *
 * Every mutating function here is Pro-gated on the server (`assertPro`) —
 * the UI's Pro checks are convenience only. API keys are stored encrypted
 * and are never returned to the client: the frontend only ever sees a
 * masked hint like `••••4f2a`.
 */

export interface AiProviderDto {
  id: string;
  provider: string;
  label: string | null;
  keyHint: string;
  baseUrl: string | null;
  model: string | null;
  enabled: boolean;
  isDefault: boolean;
  createdAt: string;
}

export const listAiProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiProviderDto[]> => {
    const { listProvidersForUser } = await import("./ai/store.server");
    return listProvidersForUser(context.userId);
  });

export const saveAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      provider: string;
      apiKey?: string;
      label?: string | null;
      baseUrl?: string | null;
      model?: string | null;
      enabled?: boolean;
    }) => data,
  )
  .handler(async ({ data, context }): Promise<AiProviderDto> => {
    const { assertPro } = await import("./ai/gate.server");
    await assertPro(context.userId);
    const { upsertProviderForUser } = await import("./ai/store.server");
    return upsertProviderForUser(context.userId, data);
  });

export const setAiProviderEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { provider: string; enabled: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { assertPro } = await import("./ai/gate.server");
    await assertPro(context.userId);
    const { upsertProviderForUser } = await import("./ai/store.server");
    await upsertProviderForUser(context.userId, {
      provider: data.provider,
      enabled: data.enabled,
    });
    return { ok: true };
  });

export const setDefaultAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { assertPro } = await import("./ai/gate.server");
    await assertPro(context.userId);
    const { setDefaultProviderForUser } = await import("./ai/store.server");
    await setDefaultProviderForUser(context.userId, data.id);
    return { ok: true };
  });

export const deleteAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { deleteProviderForUser } = await import("./ai/store.server");
    await deleteProviderForUser(context.userId, data.id);
    return { ok: true };
  });

/** Cheap round-trip so users can confirm a key works before relying on it. */
export const testAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { assertPro } = await import("./ai/gate.server");
    await assertPro(context.userId);
    const { resolveProviderForUser } = await import("./ai/store.server");
    const { chat } = await import("./ai/call.server");
    const credential = await resolveProviderForUser(context.userId, data.id);
    const reply = await chat({
      credential,
      system: "Reply with the single word: ok",
      prompt: "ping",
      maxTokens: 16,
    });
    return { ok: true, model: credential.model, reply: reply.slice(0, 80) };
  });

const GENERATE_SYSTEM = [
  "You are a senior engineer generating a single source file.",
  "Return ONLY the file's raw contents — no explanations, no markdown fences.",
  "Write complete, production-quality, idiomatic code with correct imports.",
  "Match the conventions implied by the file path and extension.",
].join(" ");

export const generateCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { prompt: string; path?: string; providerId?: string | null; context?: string }) => data,
  )
  .handler(async ({ data, context }) => {
    const { assertPro } = await import("./ai/gate.server");
    await assertPro(context.userId);
    const { resolveProviderForUser } = await import("./ai/store.server");
    const { chat, stripCodeFences } = await import("./ai/call.server");

    const prompt = data.prompt.trim();
    if (!prompt) throw new Error("Describe what you want generated.");

    const credential = await resolveProviderForUser(context.userId, data.providerId ?? null);
    const parts = [
      data.path ? `Target file path: ${data.path}` : "No file path given; infer a suitable one.",
      data.context ? `Existing file contents for reference:\n${data.context.slice(0, 8000)}` : "",
      `Request: ${prompt}`,
    ].filter(Boolean);

    const raw = await chat({ credential, system: GENERATE_SYSTEM, prompt: parts.join("\n\n") });
    const code = stripCodeFences(raw);
    if (!code) throw new Error("The provider returned an empty response. Try again.");
    return { code, model: credential.model, provider: credential.provider };
  });

const EDIT_SYSTEM = [
  "You are a senior engineer editing one existing source file.",
  "Apply the requested change and return ONLY the complete updated file contents.",
  "No explanations, no markdown fences, no partial diffs or ellipses.",
  "Preserve unrelated code, formatting and comments exactly as-is.",
].join(" ");

export const editFileWithAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { instruction: string; path: string; content: string; providerId?: string | null }) =>
      data,
  )
  .handler(async ({ data, context }) => {
    const { assertPro } = await import("./ai/gate.server");
    await assertPro(context.userId);
    const { resolveProviderForUser } = await import("./ai/store.server");
    const { chat, stripCodeFences } = await import("./ai/call.server");

    const instruction = data.instruction.trim();
    if (!instruction) throw new Error("Describe the change you want.");
    if (!data.content.trim()) throw new Error("Open a file with contents first.");

    const credential = await resolveProviderForUser(context.userId, data.providerId ?? null);
    const raw = await chat({
      credential,
      system: EDIT_SYSTEM,
      prompt: [
        `File path: ${data.path}`,
        `Instruction: ${instruction}`,
        `Current contents:\n${data.content}`,
      ].join("\n\n"),
      maxTokens: 8192,
    });
    const code = stripCodeFences(raw);
    if (!code) throw new Error("The provider returned an empty response. Try again.");
    return { code, model: credential.model, provider: credential.provider };
  });