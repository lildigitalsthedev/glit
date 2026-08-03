import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GithubError,
  getFileSha,
  putFile,
  deleteFile,
  getRef,
  createBlob,
  createTree,
  createCommit,
  updateRef,
  type GhNewTreeEntry,
} from "./api.server";
import { loadAccountToken } from "./tokens.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export interface PushArgs {
  accountId: string;
  fullName: string;
  branch: string;
  path: string;
  content: string;
  message: string;
  description?: string | undefined;
}

export function normalizePath(folder: string, fileName: string): string {
  return [...folder.split("/"), ...fileName.split("/")]
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== ".")
    .join("/");
}

export async function pushSingleFile(supabase: Client, userId: string, args: PushArgs) {
  const path = normalizePath("", args.path);
  if (!path) throw new Error("A file path is required.");
  if (path.includes("..")) throw new Error("File paths cannot contain '..'.");
  if (!args.message.trim()) throw new Error("A commit message is required.");
  if (!args.branch.trim()) throw new Error("A branch is required.");

  const { token } = await loadAccountToken(supabase, args.accountId);
  const commitMessage = args.description?.trim()
    ? `${args.message.trim()}\n\n${args.description.trim()}`
    : args.message.trim();

  try {
    const existingSha = await getFileSha(token, args.fullName, args.branch, path);
    const result = await putFile(token, args.fullName, {
      path,
      branch: args.branch,
      message: commitMessage,
      content: args.content,
      sha: existingSha,
    });
    await supabase.from("recent_pushes").insert({
      user_id: userId,
      account_id: args.accountId,
      full_name: args.fullName,
      branch: args.branch,
      path,
      commit_message: args.message.trim(),
      commit_sha: result.commit.sha,
      commit_url: result.commit.html_url,
      action: existingSha ? "update" : "create",
      status: "success",
    });
    return {
      ok: true as const,
      action: existingSha ? ("update" as const) : ("create" as const),
      path,
      sha: result.content.sha,
      commitSha: result.commit.sha.slice(0, 7),
      commitUrl: result.commit.html_url,
    };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    await supabase.from("recent_pushes").insert({
      user_id: userId,
      account_id: args.accountId,
      full_name: args.fullName,
      branch: args.branch,
      path,
      commit_message: args.message.trim(),
      action: "update",
      status: "failed",
      error_message: messageText.slice(0, 500),
    });
    throw new Error(error instanceof GithubError ? messageText : messageText);
  }
}

export interface DeleteArgs {
  accountId: string;
  fullName: string;
  branch: string;
  path: string;
  message: string;
}

export async function deleteSingleFile(supabase: Client, userId: string, args: DeleteArgs) {
  const path = normalizePath("", args.path);
  if (!path) throw new Error("A file path is required.");
  if (path.includes("..")) throw new Error("File paths cannot contain '..'.");
  if (!args.message.trim()) throw new Error("A commit message is required.");
  if (!args.branch.trim()) throw new Error("A branch is required.");

  const { token } = await loadAccountToken(supabase, args.accountId);
  const commitMessage = args.message.trim();

  try {
    const existingSha = await getFileSha(token, args.fullName, args.branch, path);
    if (!existingSha) {
      throw new Error("That file no longer exists on this branch — it may have already been deleted.");
    }

    const result = await deleteFile(token, args.fullName, {
      path,
      branch: args.branch,
      message: commitMessage,
      sha: existingSha,
    });

    await supabase.from("recent_pushes").insert({
      user_id: userId,
      account_id: args.accountId,
      full_name: args.fullName,
      branch: args.branch,
      path,
      commit_message: commitMessage,
      commit_sha: result.commit.sha,
      commit_url: result.commit.html_url,
      action: "delete",
      status: "success",
    });

    return {
      ok: true as const,
      path,
      commitSha: result.commit.sha.slice(0, 7),
      commitUrl: result.commit.html_url,
    };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    await supabase.from("recent_pushes").insert({
      user_id: userId,
      account_id: args.accountId,
      full_name: args.fullName,
      branch: args.branch,
      path,
      commit_message: commitMessage,
      action: "delete",
      status: "failed",
      error_message: messageText.slice(0, 500),
    });
    throw new Error(error instanceof GithubError ? messageText : messageText);
  }
}

export interface BulkFileInput {
  /** Repo-relative path, e.g. "src/components/Button.tsx". */
  path: string;
  /** Base64-encoded file content. */
  content: string;
}

export interface BulkPushArgs {
  accountId: string;
  fullName: string;
  branch: string;
  message: string;
  description?: string | undefined;
  files: BulkFileInput[];
}

export interface BulkPushResult {
  ok: true;
  commitSha: string;
  commitUrl: string;
  branch: string;
  filesPushed: number;
  paths: string[];
}

/**
 * Pushes many files to a branch as a single atomic commit using the Git
 * Data API (blobs -> tree -> commit -> ref update), instead of one REST
 * "contents" PUT per file.
 */
export async function pushMultipleFiles(
  supabase: Client,
  userId: string,
  args: BulkPushArgs,
): Promise<BulkPushResult> {
  if (!args.files.length) throw new Error("Select at least one file to push.");
  if (!args.message.trim()) throw new Error("A commit message is required.");
  if (!args.branch.trim()) throw new Error("A branch is required.");

  const normalizedFiles = args.files.map((file) => {
    const path = normalizePath("", file.path);
    if (!path) throw new Error("Every file needs a path.");
    if (path.includes("..")) throw new Error("File paths cannot contain '..'.");
    return { path, content: file.content };
  });

  const seen = new Set<string>();
  for (const file of normalizedFiles) {
    if (seen.has(file.path)) throw new Error(`Duplicate file path: ${file.path}`);
    seen.add(file.path);
  }

  const { token } = await loadAccountToken(supabase, args.accountId);
  const commitMessage = args.description?.trim()
    ? `${args.message.trim()}\n\n${args.description.trim()}`
    : args.message.trim();

  try {
    const ref = await getRef(token, args.fullName, args.branch);
    const baseCommitSha = ref.object.sha;

    // Create one blob per file, in parallel batches to stay well under
    // GitHub's rate limits while keeping bulk uploads fast.
    const BATCH_SIZE = 6;
    const blobShas: string[] = new Array(normalizedFiles.length);
    for (let i = 0; i < normalizedFiles.length; i += BATCH_SIZE) {
      const batch = normalizedFiles.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((file) =>
          createBlob(token, args.fullName, { content: file.content, encoding: "base64" }),
        ),
      );
      results.forEach((blob, offset) => {
        blobShas[i + offset] = blob.sha;
      });
    }

    const treeEntries: GhNewTreeEntry[] = normalizedFiles.map((file, index) => ({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blobShas[index] ?? null,
    }));

    const tree = await createTree(token, args.fullName, {
      tree: treeEntries,
      base_tree: baseCommitSha,
    });

    const commit = await createCommit(token, args.fullName, {
      message: commitMessage,
      tree: tree.sha,
      parents: [baseCommitSha],
    });

    await updateRef(token, args.fullName, args.branch, { sha: commit.sha });

    await supabase.from("recent_pushes").insert(
      normalizedFiles.map((file) => ({
        user_id: userId,
        account_id: args.accountId,
        full_name: args.fullName,
        branch: args.branch,
        path: file.path,
        commit_message: args.message.trim(),
        commit_sha: commit.sha,
        commit_url: commit.html_url,
        action: "create",
        status: "success",
      })),
    );

    return {
      ok: true,
      commitSha: commit.sha.slice(0, 7),
      commitUrl: commit.html_url,
      branch: args.branch,
      filesPushed: normalizedFiles.length,
      paths: normalizedFiles.map((file) => file.path),
    };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    await supabase.from("recent_pushes").insert({
      user_id: userId,
      account_id: args.accountId,
      full_name: args.fullName,
      branch: args.branch,
      path: `${normalizedFiles.length} file(s)`,
      commit_message: args.message.trim(),
      action: "create",
      status: "failed",
      error_message: messageText.slice(0, 500),
    });
    throw new Error(error instanceof GithubError ? messageText : messageText);
  }
}