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
      "User-Agent": "GitPush",
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

export interface GhTreeEntry {
  path: string;
  type: "blob" | "tree" | "commit";
  sha: string;
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

export interface GhCommit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } };
}

export function listCommits(token: string, fullName: string, branch: string, path?: string) {
  const q = new URLSearchParams({ sha: branch, per_page: "10" });
  if (path) q.set("path", path);
  return ghFetch<GhCommit[]>(token, `/repos/${fullName}/commits?${q.toString()}`);
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
      "User-Agent": "GitPush",
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