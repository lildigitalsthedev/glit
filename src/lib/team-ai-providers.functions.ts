import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type { TeamProviderRow, TeamProviderAuthor } from "@/lib/workspaces/ai-providers.server";

/**
 * Feature 8: Team API Key Management. Shared, workspace-owned AI provider
 * keys, distinct from the personal "Bring Your Own AI" keys in
 * `ai.functions.ts`. Permissions follow the workspace capability matrix:
 *   - Owner / Admin (`keys:manage`): add, edit, remove
 *   - Developer (`keys:use`): can list (masked) and use the keys for AI tools
 *   - Viewer (neither capability): no access — `listTeamAiProviders` throws,
 *     so the settings UI never even shows the section to them
 *
 * Keys are AES-256-GCM encrypted at rest (`ai/crypto.server`) and the
 * plaintext never round-trips to the client — every DTO here only ever
 * carries a masked `keyHint` like `••••4f2a`.
 */

export const listTeamAiProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getActiveWorkspaceId, requireCapability } = await import("./workspaces/store.server");
    const workspaceId = await getActiveWorkspaceId(context.userId);
    await requireCapability(context.userId, workspaceId, "keys:use");
    const { listTeamProviders } = await import("./workspaces/ai-providers.server");
    return listTeamProviders(workspaceId);
  });

/**
 * Adding a key or rotating an existing one's secret is validated live
 * before it's ever written to the database: a cheap round-trip call to the
 * provider confirms the key actually works, so a workspace never ends up
 * with a shared key that silently fails for every Developer relying on it.
 * Edits that only touch label/base URL/model/enabled (no `apiKey`) skip
 * validation since there's no new secret to verify.
 */
export const saveTeamAiProvider = createServerFn({ method: "POST" })
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
  .handler(async ({ data, context }) => {
    const { assertPro } = await import("./ai/gate.server");
    await assertPro(context.userId);
    const { requireActiveWorkspaceCapability } = await import("./workspaces/store.server");
    const { workspaceId } = await requireActiveWorkspaceCapability(context.userId, "keys:manage");

    const apiKey = data.apiKey?.trim();
    if (apiKey) {
      const { providerMeta } = await import("./ai/catalog");
      const meta = providerMeta(data.provider);
      if (!meta) throw new Error(`Unknown provider: ${data.provider}`);
      const baseUrl = (data.baseUrl?.trim() || meta.baseUrl).replace(/\/+$/, "");
      const model = data.model?.trim() || meta.defaultModel;
      if (!baseUrl) throw new Error("A base URL is required for this provider.");
      if (!model) throw new Error("A model is required for this provider.");

      const { chat } = await import("./ai/call.server");
      try {
        await chat({
          credential: { id: "pending", provider: data.provider, apiKey, baseUrl, model },
          system: "Reply with the single word: ok",
          prompt: "ping",
          maxTokens: 16,
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Key validation failed — this key doesn't work: ${detail}`);
      }
    }

    const { upsertTeamProvider } = await import("./workspaces/ai-providers.server");
    const saved = await upsertTeamProvider(workspaceId, context.userId, data);

    const { logActivity } = await import("./workspaces/activity.server");
    await logActivity({
      workspaceId,
      actorId: context.userId,
      action: "team_key_added",
      summary: `Added the shared ${data.provider} key for the team`,
      metadata: { provider: data.provider },
    });

    return saved;
  });

export const setTeamAiProviderEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; provider: string; enabled: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { requireActiveWorkspaceCapability } = await import("./workspaces/store.server");
    const { workspaceId } = await requireActiveWorkspaceCapability(context.userId, "keys:manage");
    const { upsertTeamProvider } = await import("./workspaces/ai-providers.server");
    await upsertTeamProvider(workspaceId, context.userId, {
      provider: data.provider,
      enabled: data.enabled,
    });
    return { ok: true };
  });

export const setDefaultTeamAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { requireActiveWorkspaceCapability } = await import("./workspaces/store.server");
    const { workspaceId } = await requireActiveWorkspaceCapability(context.userId, "keys:manage");
    const { setDefaultTeamProvider } = await import("./workspaces/ai-providers.server");
    await setDefaultTeamProvider(workspaceId, data.id);
    return { ok: true };
  });

export const deleteTeamAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; provider: string }) => data)
  .handler(async ({ data, context }) => {
    const { requireActiveWorkspaceCapability } = await import("./workspaces/store.server");
    const { workspaceId } = await requireActiveWorkspaceCapability(context.userId, "keys:manage");
    const { deleteTeamProvider } = await import("./workspaces/ai-providers.server");
    await deleteTeamProvider(workspaceId, data.id);

    const { logActivity } = await import("./workspaces/activity.server");
    await logActivity({
      workspaceId,
      actorId: context.userId,
      action: "team_key_removed",
      summary: `Removed the shared ${data.provider} key from the team`,
      metadata: { provider: data.provider },
    });

    return { ok: true };
  });

/** Manual re-check for a key already saved — e.g. after a provider outage. */
export const testTeamAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { assertPro } = await import("./ai/gate.server");
    await assertPro(context.userId);
    const { requireActiveWorkspaceCapability } = await import("./workspaces/store.server");
    const { workspaceId } = await requireActiveWorkspaceCapability(context.userId, "keys:manage");
    const { assertRateLimit } = await import("./rate-limit.server");
    await assertRateLimit(context.userId, { bucket: "team_ai_test", limit: 10, windowSeconds: 60 });
    const { resolveTeamProvider } = await import("./workspaces/ai-providers.server");
    const { chat } = await import("./ai/call.server");
    const credential = await resolveTeamProvider(workspaceId, context.userId, data.id);
    const reply = await chat({
      credential,
      system: "Reply with the single word: ok",
      prompt: "ping",
      maxTokens: 16,
    });
    return { ok: true, model: credential.model, reply: reply.slice(0, 80) };
  });
