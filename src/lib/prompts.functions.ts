import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type {
  WorkspacePrompt,
  PromptVersionRecord,
  PromptAuthor,
} from "@/lib/workspaces/prompts.server";

/**
 * Read access (list, view version history) only needs `workspace:view`, so
 * every role including Viewer can browse and favorite the library. Writing
 * a prompt — create/edit/delete/duplicate/restore/import — is gated on
 * `ai:use`, the same tier that already governs AI generation/chat: prompts
 * are AI tooling, and there's no dedicated capability for them in the
 * Feature 3 matrix, so this reuses the closest existing one rather than
 * inventing a new capability that the server/client matrix wouldn't agree on.
 */
const WRITE_CAPABILITY = "ai:use" as const;

export const listPrompts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getActiveWorkspaceId, requireCapability } = await import("./workspaces/store.server");
    const workspaceId = await getActiveWorkspaceId(context.userId);
    await requireCapability(context.userId, workspaceId, "workspace:view");
    const { listWorkspacePrompts } = await import("./workspaces/prompts.server");
    return listWorkspacePrompts(workspaceId, context.userId);
  });

export const createWorkspacePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { title: string; category: string; body: string }) => data)
  .handler(async ({ data, context }) => {
    const { requireActiveWorkspaceCapability } = await import("./workspaces/store.server");
    const { workspaceId } = await requireActiveWorkspaceCapability(context.userId, WRITE_CAPABILITY);
    if (!data.title.trim()) throw new Error("Give the prompt a title.");
    if (!data.body.trim()) throw new Error("The prompt body can't be empty.");
    const { createPrompt } = await import("./workspaces/prompts.server");
    return createPrompt({ workspaceId, callerId: context.userId, ...data });
  });

export const updateWorkspacePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { promptId: string; title: string; category: string; body: string }) => data)
  .handler(async ({ data, context }) => {
    const { requireActiveWorkspaceCapability } = await import("./workspaces/store.server");
    const { workspaceId } = await requireActiveWorkspaceCapability(context.userId, WRITE_CAPABILITY);
    if (!data.title.trim()) throw new Error("Give the prompt a title.");
    if (!data.body.trim()) throw new Error("The prompt body can't be empty.");
    const { updatePrompt } = await import("./workspaces/prompts.server");
    await updatePrompt({ workspaceId, callerId: context.userId, ...data });
    return { ok: true };
  });

export const deleteWorkspacePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { promptId: string }) => data)
  .handler(async ({ data, context }) => {
    const { requireActiveWorkspaceCapability } = await import("./workspaces/store.server");
    const { workspaceId } = await requireActiveWorkspaceCapability(context.userId, WRITE_CAPABILITY);
    const { deletePrompt } = await import("./workspaces/prompts.server");
    await deletePrompt(data.promptId, workspaceId);
    return { ok: true };
  });

export const duplicateWorkspacePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { promptId: string }) => data)
  .handler(async ({ data, context }) => {
    const { requireActiveWorkspaceCapability } = await import("./workspaces/store.server");
    const { workspaceId } = await requireActiveWorkspaceCapability(context.userId, WRITE_CAPABILITY);
    const { duplicatePrompt } = await import("./workspaces/prompts.server");
    return duplicatePrompt({ promptId: data.promptId, workspaceId, callerId: context.userId });
  });

export const setPromptFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { promptId: string; isFavorite: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { getActiveWorkspaceId, requireCapability } = await import("./workspaces/store.server");
    const workspaceId = await getActiveWorkspaceId(context.userId);
    await requireCapability(context.userId, workspaceId, "workspace:view");
    const { setPromptFavorite: setFavorite } = await import("./workspaces/prompts.server");
    await setFavorite({ promptId: data.promptId, workspaceId, callerId: context.userId, isFavorite: data.isFavorite });
    return { ok: true };
  });

export const listPromptVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { promptId: string }) => data)
  .handler(async ({ data, context }) => {
    const { getActiveWorkspaceId, requireCapability } = await import("./workspaces/store.server");
    const workspaceId = await getActiveWorkspaceId(context.userId);
    await requireCapability(context.userId, workspaceId, "workspace:view");
    const { listPromptVersions: listVersions } = await import("./workspaces/prompts.server");
    return listVersions(data.promptId, workspaceId);
  });

export const restorePromptVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { promptId: string; version: number }) => data)
  .handler(async ({ data, context }) => {
    const { requireActiveWorkspaceCapability } = await import("./workspaces/store.server");
    const { workspaceId } = await requireActiveWorkspaceCapability(context.userId, WRITE_CAPABILITY);
    const { restorePromptVersion: restore } = await import("./workspaces/prompts.server");
    await restore({ promptId: data.promptId, workspaceId, callerId: context.userId, version: data.version });
    return { ok: true };
  });

/** Bulk-creates prompts from an imported JSON export. Skipped rows (missing title/body) are counted, not thrown, so one bad entry doesn't fail the whole import. */
export const importWorkspacePrompts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { prompts: { title: string; category?: string; body: string }[] }) => data)
  .handler(async ({ data, context }) => {
    const { requireActiveWorkspaceCapability } = await import("./workspaces/store.server");
    const { workspaceId } = await requireActiveWorkspaceCapability(context.userId, WRITE_CAPABILITY);
    if (data.prompts.length > 200) {
      throw new Error("That's more than 200 prompts in one file — split it up and import in batches.");
    }
    const { createPrompt } = await import("./workspaces/prompts.server");
    let imported = 0;
    let skipped = 0;
    for (const entry of data.prompts) {
      if (!entry.title?.trim() || !entry.body?.trim()) {
        skipped += 1;
        continue;
      }
      await createPrompt({
        workspaceId,
        callerId: context.userId,
        title: entry.title,
        category: entry.category ?? "General",
        body: entry.body,
      });
      imported += 1;
    }
    return { imported, skipped };
  });
