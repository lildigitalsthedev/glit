const GH = "https://api.github.com";

export class GithubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function explain(status: number, body: string): string {
  const detail = (() => {
    try {
      const parsed = JSON.parse(body) as { message?: string };
      return parsed.message ?? body;
    } catch {
      return body;
    }
  })();
  if (status === 401) return `GitHub rejected the token (401). Reconnect this account. ${detail}`;
  if (status === 403)
    return `GitHub denied the request (403). The token may be missing repo permissions or you hit a rate limit. ${detail}`;
  if (status === 404)
    return `Not found (404). The repository, branch or path does not exist, or the token cannot see it. ${detail}`;
  if (status === 409)
    return `Conflict (409). The file changed on GitHub since it was loaded — reload the file and push again. ${detail}`;
  if (status === 422)
    return `GitHub could not process the change (422). The branch may be protected or the file is out of date. ${detail}`;
  return `GitHub request failed (${status}). ${detail}`;
}

export async function ghFetch<T>(
  token: string,
  path: string,
  init?: RequestInit & { raw?: boolean },
): Promise<T> {
  const res = await fetch(`${GH}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Glit",
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new GithubError(res.status, explain(res.status, text));
  return (text ? JSON.parse(text) : null) as T;
}

export interface GhViewer {
  login: string;
  name: string | null;
  avatar_url: string;
  public_repos: number;
}

export interface GhRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string | null;
  default_branch: string;
  updated_at: string;
  pushed_at: string | null;
  size?: number;
  visibility?: string;
  html_url?: string;
  language?: string | null;
  archived?: boolean;
  owner: { login: string; avatar_url: string };
  permissions?: { push?: boolean; admin?: boolean };
}

export function getViewer(token: string) {
  return ghFetch<GhViewer>(token, "/user");
}

export async function listAllRepos(token: string): Promise<GhRepo[]> {
  const out: GhRepo[] = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await ghFetch<GhRepo[]>(
      token,
      `/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member&page=${page}`,
    );
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

export function getRepo(token: string, fullName: string) {
  return ghFetch<GhRepo>(token, `/repos/${fullName}`);
}

export interface GhBranch {
  name: string;
  protected: boolean;
  commit: { sha: string };
}

export function listBranches(token: string, fullName: string) {
  return ghFetch<GhBranch[]>(token, `/repos/${fullName}/branches?per_page=100`);
}

export function renameRepo(token: string, fullName: string, newName: string) {
  return ghFetch<GhRepo>(token, `/repos/${fullName}`, {
    method: "PATCH",
    body: JSON.stringify({ name: newName }),
  });
}

export function setRepoArchived(token: string, fullName: string, archived: boolean) {
  return ghFetch<GhRepo>(token, `/repos/${fullName}`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  });
}

/** Flips a repo between private and public via the same "update a repository" endpoint used for rename/archive. */
export function setRepoVisibility(token: string, fullName: string, isPrivate: boolean) {
  return ghFetch<GhRepo>(token, `/repos/${fullName}`, {
    method: "PATCH",
    body: JSON.stringify({ private: isPrivate }),
  });
}

export interface CreateRepoArgs {
  name: string;
  description?: string | undefined;
  isPrivate: boolean;
  autoInit: boolean;
  gitignoreTemplate?: string | undefined;
  licenseTemplate?: string | undefined;
}

export function createRepo(token: string, args: CreateRepoArgs) {
  // GitHub only applies a .gitignore or license template when the repo is
  // initialized with a first commit, so force auto_init on in that case.
  const autoInit = args.autoInit || Boolean(args.gitignoreTemplate) || Boolean(args.licenseTemplate);
  return ghFetch<GhRepo>(token, "/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name: args.name,
      description: args.description || undefined,
      private: args.isPrivate,
      auto_init: autoInit,
      gitignore_template: args.gitignoreTemplate || undefined,
      license_template: args.licenseTemplate || undefined,
    }),
  });
}

export interface GhTreeEntry {
  path: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  mode?: string;
  size?: number;
}

export async function listTree(token: string, fullName: string, branch: string) {
  const data = await ghFetch<{ tree: GhTreeEntry[]; truncated: boolean }>(
    token,
    `/repos/${fullName}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  return data;
}

export async function readFile(token: string, fullName: string, branch: string, path: string) {
  const data = await ghFetch<{
    content?: string;
    encoding?: string;
    sha: string;
    size: number;
    html_url: string;
  }>(
    token,
    `/repos/${fullName}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`,
  );
  const content =
    data.content && data.encoding === "base64"
      ? Buffer.from(data.content, "base64").toString("utf8")
      : "";
  return { content, sha: data.sha, size: data.size, htmlUrl: data.html_url };
}

export async function getFileSha(
  token: string,
  fullName: string,
  branch: string,
  path: string,
): Promise<string | null> {
  try {
    const file = await readFile(token, fullName, branch, path);
    return file.sha;
  } catch (error) {
    if (error instanceof GithubError && error.status === 404) return null;
    throw error;
  }
}

export interface PutFileResult {
  commit: { sha: string; html_url: string; message: string };
  content: { path: string; sha: string; html_url: string };
}

export function putFile(
  token: string,
  fullName: string,
  args: { path: string; branch: string; message: string; content: string; sha?: string | null },
) {
  return ghFetch<PutFileResult>(
    token,
    `/repos/${fullName}/contents/${args.path.split("/").map(encodeURIComponent).join("/")}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message: args.message,
        content: Buffer.from(args.content, "utf8").toString("base64"),
        branch: args.branch,
        ...(args.sha ? { sha: args.sha } : {}),
      }),
    },
  );
}

export interface DeleteFileResult {
  commit: { sha: string; html_url: string; message: string };
}

export function deleteFile(
  token: string,
  fullName: string,
  args: { path: string; branch: string; message: string; sha: string },
) {
  return ghFetch<DeleteFileResult>(
    token,
    `/repos/${fullName}/contents/${args.path.split("/").map(encodeURIComponent).join("/")}`,
    {
      method: "DELETE",
      body: JSON.stringify({
        message: args.message,
        sha: args.sha,
        branch: args.branch,
      }),
    },
  );
}

export interface GhCommit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } };
}

export function listCommits(
  token: string,
  fullName: string,
  branch: string,
  path?: string,
  perPage = 10,
  page = 1,
) {
  const q = new URLSearchParams({ sha: branch, per_page: String(perPage), page: String(page) });
  if (path) q.set("path", path);
  return ghFetch<GhCommit[]>(token, `/repos/${fullName}/commits?${q.toString()}`);
}

export interface GhCommitWithFiles extends GhCommit {
  files?: {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
  }[];
}

export function getCommitWithFiles(token: string, fullName: string, sha: string) {
  return ghFetch<GhCommitWithFiles>(token, `/repos/${fullName}/commits/${encodeURIComponent(sha)}`);
}

export interface GhCodeSearchResult {
  total_count: number;
  incomplete_results: boolean;
  items: {
    name: string;
    path: string;
    html_url: string;
    text_matches?: { fragment: string }[];
  }[];
}

export function searchCode(
  token: string,
  fullName: string,
  query: string,
  page = 1,
  perPage = 50,
) {
  const q = new URLSearchParams({ q: `${query} repo:${fullName}`, page: String(page), per_page: String(perPage) });
  return ghFetch<GhCodeSearchResult>(token, `/search/code?${q.toString()}`, {
    headers: { Accept: "application/vnd.github.text-match+json" },
  });
}

export interface GhWorkflow {
  id: number;
  name: string;
  path: string;
  state: string;
  html_url: string;
}

export function listWorkflows(token: string, fullName: string) {
  return ghFetch<{ total_count: number; workflows: GhWorkflow[] }>(
    token,
    `/repos/${fullName}/actions/workflows?per_page=100`,
  );
}

export function dispatchWorkflow(
  token: string,
  fullName: string,
  workflow: string | number,
  ref: string,
  inputs: Record<string, string>,
) {
  return ghFetch<null>(token, `/repos/${fullName}/actions/workflows/${encodeURIComponent(String(workflow))}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref, inputs }),
  });
}

export interface GhWorkflowRun {
  id: number;
  name: string;
  event: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  head_sha: string;
  head_branch: string;
  run_number: number;
  created_at: string;
  updated_at: string;
}

export function listWorkflowRuns(token: string, fullName: string, branch: string | undefined, perPage = 10) {
  const q = new URLSearchParams({ per_page: String(perPage) });
  if (branch) q.set("branch", branch);
  return ghFetch<{ total_count: number; workflow_runs: GhWorkflowRun[] }>(
    token,
    `/repos/${fullName}/actions/runs?${q.toString()}`,
  );
}

export interface GhCheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  started_at: string | null;
  completed_at: string | null;
  output?: { title?: string | null; summary?: string | null };
}

export function listCheckRuns(token: string, fullName: string, ref: string) {
  return ghFetch<{ total_count: number; check_runs: GhCheckRun[] }>(
    token,
    `/repos/${fullName}/commits/${encodeURIComponent(ref)}/check-runs?per_page=100`,
  );
}

export interface GhCombinedStatus {
  state: "error" | "failure" | "pending" | "success";
  total_count: number;
  statuses: { context: string; state: string; description: string | null; target_url: string | null }[];
}

export function getCombinedStatus(token: string, fullName: string, ref: string) {
  return ghFetch<GhCombinedStatus>(
    token,
    `/repos/${fullName}/commits/${encodeURIComponent(ref)}/status`,
  );
}

export interface GhPullRequest {
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft: boolean;
  merged: boolean;
  mergeable: boolean | null;
  html_url: string;
  head: { ref: string; sha: string; repo: { full_name: string } | null };
  base: { ref: string; sha: string; repo: { full_name: string } };
}

export function listPullRequests(token: string, fullName: string, state: "open" | "closed" | "all", perPage: number) {
  const q = new URLSearchParams({ state, per_page: String(perPage), sort: "updated", direction: "desc" });
  return ghFetch<GhPullRequest[]>(token, `/repos/${fullName}/pulls?${q.toString()}`);
}

export function createPullRequest(
  token: string,
  fullName: string,
  args: { title: string; head: string; base: string; body?: string; draft: boolean },
) {
  return ghFetch<GhPullRequest>(token, `/repos/${fullName}/pulls`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export function getPullRequest(token: string, fullName: string, number: number) {
  return ghFetch<GhPullRequest>(token, `/repos/${fullName}/pulls/${number}`);
}

export function mergePullRequest(
  token: string,
  fullName: string,
  number: number,
  method: "merge" | "squash" | "rebase",
) {
  return ghFetch<{ sha: string; merged: boolean; message: string }>(
    token,
    `/repos/${fullName}/pulls/${number}/merge`,
    { method: "PUT", body: JSON.stringify({ merge_method: method }) },
  );
}

export interface GhRef {
  ref: string;
  object: { sha: string; type: string };
}

export function getRef(token: string, fullName: string, branch: string) {
  return ghFetch<GhRef>(
    token,
    `/repos/${fullName}/git/ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`,
  );
}

export interface GhCommitDetail {
  sha: string;
  parents: { sha: string }[];
}

/** Git Data API commit lookup — used by undoPush to find the parent of the commit being undone. */
export function getCommit(token: string, fullName: string, sha: string) {
  return ghFetch<GhCommitDetail>(token, `/repos/${fullName}/git/commits/${sha}`);
}

export interface GhBlob {
  sha: string;
  url: string;
}

export function createBlob(
  token: string,
  fullName: string,
  args: { content: string; encoding: "utf-8" | "base64" },
) {
  return ghFetch<GhBlob>(token, `/repos/${fullName}/git/blobs`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export interface GhNewTreeEntry {
  path: string;
  mode: "100644" | "100755" | "040000" | "160000" | "120000";
  type: "blob" | "tree" | "commit";
  sha: string | null;
}

export interface GhNewTree {
  sha: string;
  tree: GhTreeEntry[];
}

export function createTree(
  token: string,
  fullName: string,
  args: { tree: GhNewTreeEntry[]; base_tree?: string },
) {
  return ghFetch<GhNewTree>(token, `/repos/${fullName}/git/trees`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export interface GhNewCommit {
  sha: string;
  html_url: string;
  message: string;
}

export function createCommit(
  token: string,
  fullName: string,
  args: { message: string; tree: string; parents: string[] },
) {
  return ghFetch<GhNewCommit>(token, `/repos/${fullName}/git/commits`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export function updateRef(
  token: string,
  fullName: string,
  branch: string,
  args: { sha: string; force?: boolean },
) {
  return ghFetch<GhRef>(
    token,
    `/repos/${fullName}/git/refs/heads/${branch.split("/").map(encodeURIComponent).join("/")}`,
    {
      method: "PATCH",
      body: JSON.stringify(args),
    },
  );
}

/** Creates a new branch pointing at `sha` — used to rename a repo's default branch on creation (Feature 10). */
export function createRef(token: string, fullName: string, branch: string, sha: string) {
  return ghFetch<GhRef>(token, `/repos/${fullName}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
  });
}

export function deleteRef(token: string, fullName: string, branch: string) {
  return ghFetch<void>(
    token,
    `/repos/${fullName}/git/refs/heads/${branch.split("/").map(encodeURIComponent).join("/")}`,
    { method: "DELETE" },
  );
}

export function setDefaultBranch(token: string, fullName: string, branch: string) {
  return ghFetch<GhRepo>(token, `/repos/${fullName}`, {
    method: "PATCH",
    body: JSON.stringify({ default_branch: branch }),
  });
}

export async function downloadZipball(
  token: string,
  fullName: string,
  branch: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(`${GH}/repos/${fullName}/zipball/${encodeURIComponent(branch)}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Glit",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new GithubError(res.status, explain(res.status, text));
  }
  const arrayBuffer = await res.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: res.headers.get("content-type") ?? "application/zip",
  };
}