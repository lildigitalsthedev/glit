// Server-only. Uses the service-role Supabase client (bypasses RLS) — see
// the migration for why: workspace_prompts and friends have RLS enabled
// with no client policies at all, so every read/write goes through here.
// Every exported function takes the *caller's* id and assumes the handler
// already ran `requireCapability`/`requireActiveWorkspaceCapability` before
// calling in; this file does not re-check roles itself.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface PromptAuthor {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface WorkspacePrompt {
  id: string;
  workspaceId: string;
  title: string;
  category: string;
  body: string;
  version: number;
  createdBy: PromptAuthor | null;
  updatedBy: PromptAuthor | null;
  isFavoriteForCaller: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromptVersionRecord {
  id: string;
  version: number;
  title: string;
  category: string;
  body: string;
  editedBy: PromptAuthor | null;
  createdAt: string;
}

async function loadAuthors(userIds: (string | null)[]): Promise<Map<string, PromptAuthor>> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return new Map();
  const { data, error } = await supabaseAdmin.from("profiles").select("id, display_name, avatar_url").in("id", ids);
  if (error) throw new Error(error.message);
  return new Map(
    (data ?? []).map((p) => [
      p.id as string,
      { userId: p.id as string, displayName: p.display_name as string | null, avatarUrl: p.avatar_url as string | null },
    ]),
  );
}

export async function listWorkspacePrompts(workspaceId: string, callerId: string): Promise<WorkspacePrompt[]> {
  const { data: rows, error } = await supabaseAdmin
    .from("workspace_prompts")
    .select("id, workspace_id, title, category, body, version, created_by, updated_by, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];

  const { data: favRows, error: favError } = await supabaseAdmin
    .from("workspace_prompt_favorites")
    .select("prompt_id")
    .eq("user_id", callerId)
    .in(
      "prompt_id",
      rows.map((r) => r.id as string),
    );
  if (favError) throw new Error(favError.message);
  const favoriteIds = new Set((favRows ?? []).map((r) => r.prompt_id as string));

  const authors = await loadAuthors(rows.flatMap((r) => [r.created_by as string | null, r.updated_by as string | null]));

  return rows.map((r) => ({
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    title: r.title as string,
    category: r.category as string,
    body: r.body as string,
    version: r.version as number,
    createdBy: r.created_by ? (authors.get(r.created_by as string) ?? null) : null,
    updatedBy: r.updated_by ? (authors.get(r.updated_by as string) ?? null) : null,
    isFavoriteForCaller: favoriteIds.has(r.id as string),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));
}

async function assertPromptInWorkspace(promptId: string, workspaceId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("workspace_prompts")
    .select("id")
    .eq("id", promptId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That prompt was not found in this workspace.");
}

export async function createPrompt(args: {
  workspaceId: string;
  callerId: string;
  title: string;
  category: string;
  body: string;
}): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from("workspace_prompts")
    .insert({
      workspace_id: args.workspaceId,
      title: args.title.trim(),
      category: args.category.trim() || "General",
      body: args.body,
      created_by: args.callerId,
      updated_by: args.callerId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

export async function updatePrompt(args: {
  promptId: string;
  workspaceId: string;
  callerId: string;
  title: string;
  category: string;
  body: string;
}): Promise<void> {
  await assertPromptInWorkspace(args.promptId, args.workspaceId);

  const { data: current, error: fetchError } = await supabaseAdmin
    .from("workspace_prompts")
    .select("version, title, category, body")
    .eq("id", args.promptId)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  // Snapshot what the prompt looked like *before* this edit, then bump the
  // version on the live row — so `version` on workspace_prompts is always
  // "how many edits has this prompt had," and the versions table holds
  // every prior state.
  const { error: versionError } = await supabaseAdmin.from("workspace_prompt_versions").insert({
    prompt_id: args.promptId,
    version: current.version as number,
    title: current.title as string,
    category: current.category as string,
    body: current.body as string,
    edited_by: args.callerId,
  });
  if (versionError) throw new Error(versionError.message);

  const { error } = await supabaseAdmin
    .from("workspace_prompts")
    .update({
      title: args.title.trim(),
      category: args.category.trim() || "General",
      body: args.body,
      version: (current.version as number) + 1,
      updated_by: args.callerId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.promptId);
  if (error) throw new Error(error.message);
}

export async function deletePrompt(promptId: string, workspaceId: string): Promise<void> {
  await assertPromptInWorkspace(promptId, workspaceId);
  const { error } = await supabaseAdmin.from("workspace_prompts").delete().eq("id", promptId);
  if (error) throw new Error(error.message);
}

export async function duplicatePrompt(args: {
  promptId: string;
  workspaceId: string;
  callerId: string;
}): Promise<{ id: string }> {
  const { data: source, error } = await supabaseAdmin
    .from("workspace_prompts")
    .select("title, category, body")
    .eq("id", args.promptId)
    .eq("workspace_id", args.workspaceId)
    .single();
  if (error) throw new Error(error.message);
  return createPrompt({
    workspaceId: args.workspaceId,
    callerId: args.callerId,
    title: `${source.title as string} (copy)`,
    category: source.category as string,
    body: source.body as string,
  });
}

export async function setPromptFavorite(args: {
  promptId: string;
  workspaceId: string;
  callerId: string;
  isFavorite: boolean;
}): Promise<void> {
  await assertPromptInWorkspace(args.promptId, args.workspaceId);
  if (args.isFavorite) {
    const { error } = await supabaseAdmin
      .from("workspace_prompt_favorites")
      .upsert({ user_id: args.callerId, prompt_id: args.promptId }, { onConflict: "user_id,prompt_id" });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabaseAdmin
      .from("workspace_prompt_favorites")
      .delete()
      .eq("user_id", args.callerId)
      .eq("prompt_id", args.promptId);
    if (error) throw new Error(error.message);
  }
}

export async function listPromptVersions(promptId: string, workspaceId: string): Promise<PromptVersionRecord[]> {
  await assertPromptInWorkspace(promptId, workspaceId);
  const { data: rows, error } = await supabaseAdmin
    .from("workspace_prompt_versions")
    .select("id, version, title, category, body, edited_by, created_at")
    .eq("prompt_id", promptId)
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  const authors = await loadAuthors((rows ?? []).map((r) => r.edited_by as string | null));
  return (rows ?? []).map((r) => ({
    id: r.id as string,
    version: r.version as number,
    title: r.title as string,
    category: r.category as string,
    body: r.body as string,
    editedBy: r.edited_by ? (authors.get(r.edited_by as string) ?? null) : null,
    createdAt: r.created_at as string,
  }));
}

export async function restorePromptVersion(args: {
  promptId: string;
  workspaceId: string;
  callerId: string;
  version: number;
}): Promise<void> {
  const { data: snapshot, error } = await supabaseAdmin
    .from("workspace_prompt_versions")
    .select("title, category, body")
    .eq("prompt_id", args.promptId)
    .eq("version", args.version)
    .single();
  if (error) throw new Error(error.message);
  await updatePrompt({
    promptId: args.promptId,
    workspaceId: args.workspaceId,
    callerId: args.callerId,
    title: snapshot.title as string,
    category: snapshot.category as string,
    body: snapshot.body as string,
  });
}
