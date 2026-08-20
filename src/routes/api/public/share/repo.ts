import { createFileRoute } from "@tanstack/react-router";
import { readCookie, SHARE_SESSION_COOKIE, json } from "@/lib/github/share-cookie.server";
import type { ActiveSession, ShareCapability } from "@/lib/github/share-links.server";

async function requireSession(request: Request): Promise<ActiveSession> {
  const raw = readCookie(request, SHARE_SESSION_COOKIE);
  if (!raw) throw new Error("SESSION_MISSING");
  const { validateSession } = await import("@/lib/github/share-links.server");
  const session = await validateSession(raw);
  if (!session) throw new Error("SESSION_INVALID");
  return session;
}

async function requireCap(session: ActiveSession, capability: ShareCapability) {
  const { shareRoleCan } = await import("@/lib/github/share-links.server");
  if (!shareRoleCan(session.role, capability)) {
    throw new Error(`Your access role (${session.role}) doesn't allow that.`);
  }
}

export const Route = createFileRoute("/api/public/share/repo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        let session: ActiveSession;
        try {
          session = await requireSession(request);
        } catch {
          return json({ error: "This session has expired or is no longer valid. Reopen your access link." }, 401);
        }

        const url = new URL(request.url);
        const action = url.searchParams.get("action") ?? "";
        const branch = url.searchParams.get("branch") ?? "";
        const path = url.searchParams.get("path") ?? "";

        try {
          await requireLinkRateLimit(session.id);
          const { loadAccountTokenAdmin } = await import("@/lib/github/tokens.server");
          const { getRepo, listTree, readFile, listCommits, listBranches, downloadZipball } = await import(
            "@/lib/github/api.server"
          );
          const { logSessionEvent } = await import("@/lib/github/share-links.server");
          const { token } = await loadAccountTokenAdmin(session.accountId);

          switch (action) {
            case "info": {
              await requireCap(session, "repo:view");
              const repo = await getRepo(token, session.fullName);
              await logSessionEvent(session, "session_repo_accessed", { action });
              return json({
                fullName: repo.full_name,
                description: repo.description,
                defaultBranch: repo.default_branch,
                sizeKb: repo.size ?? 0,
                updatedAt: repo.pushed_at ?? repo.updated_at,
                role: session.role,
                allowDownload: session.allowDownload,
              });
            }
            case "branches": {
              await requireCap(session, "repo:branches");
              const branches = await listBranches(token, session.fullName);
              return json({ branches: branches.map((b) => ({ name: b.name, protected: b.protected })) });
            }
            case "tree": {
              await requireCap(session, "repo:browse");
              if (!branch) return json({ error: "branch is required" }, 400);
              const data = await listTree(token, session.fullName, branch);
              const nodes = data.tree
                .filter((e) => e.type === "blob" || e.type === "tree")
                .map((e) => ({ path: e.path, type: e.type, size: e.size ?? 0 }));
              return json({ nodes, truncated: data.truncated });
            }
            case "file": {
              await requireCap(session, "repo:readFile");
              if (!branch || !path) return json({ error: "branch and path are required" }, 400);
              const file = await readFile(token, session.fullName, branch, path);
              await logSessionEvent(session, "session_file_read", { branch, path });
              return json({ content: file.content, sha: file.sha, size: file.size });
            }
            case "commits": {
              await requireCap(session, "repo:commits");
              if (!branch) return json({ error: "branch is required" }, 400);
              const commits = await listCommits(token, session.fullName, branch, path || undefined);
              return json({
                commits: commits.map((c) => ({
                  sha: c.sha.slice(0, 7),
                  message: c.commit.message.split("\n")[0] ?? "",
                  author: c.commit.author.name,
                  date: c.commit.author.date,
                })),
              });
            }
            case "download": {
              await requireCap(session, "repo:download");
              if (!session.allowDownload) {
                return json({ error: "Downloads are disabled for this access link." }, 403);
              }
              if (!branch) return json({ error: "branch is required" }, 400);
              const { buffer } = await downloadZipball(token, session.fullName, branch);
              await logSessionEvent(session, "session_download", { branch });
              const repoName = session.fullName.split("/").pop() ?? session.fullName;
              return new Response(buffer, {
                status: 200,
                headers: {
                  "Content-Type": "application/zip",
                  "Content-Disposition": `attachment; filename="${repoName}-${branch}.zip"`,
                },
              });
            }
            default:
              return json({ error: "Unknown action." }, 400);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Request failed.";
          return json({ error: message }, 400);
        }
      },
    },
  },
});

/** Coarse per-session throttle so a redeemed session can't be scripted into scraping the whole repo instantly. */
async function requireLinkRateLimit(sessionId: string): Promise<void> {
  const { assertLinkRateLimit } = await import("@/lib/github/share-links.server");
  await assertLinkRateLimit(`session_read:${sessionId}`, 120, 60);
}
