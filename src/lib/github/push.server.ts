import type { SupabaseClient } from "@supabase/supabase-js";
import { GithubError, getFileSha, putFile } from "./api.server";
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