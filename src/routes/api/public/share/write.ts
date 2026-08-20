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

interface WriteBody {
  action?: string;
  branch?: string;
  path?: string;
  content?: string;
  message?: string;
  sha?: string | null;
  newBranch?: string;
  fromBranch?: string;
  newName?: string;
  archived?: boolean;
}

export const Route = createFileRoute("/api/public/share/write")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let session: ActiveSession;
        try {
          session = await requireSession(request);
        } catch {
          return json({ error: "This session has expired or is no longer valid. Reopen your access link." }, 401);
        }

        let body: WriteBody;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid request body." }, 400);
        }

        try {
          const { assertLinkRateLimit, logSessionEvent } = await import("@/lib/github/share-links.server");
          await assertLinkRateLimit(`session_write:${session.id}`, 30, 300);

          const { loadAccountTokenAdmin } = await import("@/lib/github/tokens.server");
          const { token } = await loadAccountTokenAdmin(session.accountId);

          switch (body.action) {
            case "putFile": {
              await requireCap(session, "repo:writeFile");
              if (!body.branch || !body.path || body.content === undefined || !body.message) {
                return json({ error: "branch, path, content and message are required." }, 400);
              }
              if (body.path.includes("..")) return json({ error: "Invalid path." }, 400);
              const { getFileSha, putFile } = await import("@/lib/github/api.server");
              const existingSha = await getFileSha(token, session.fullName, body.branch, body.path);
              const result = await putFile(token, session.fullName, {
                path: body.path,
                branch: body.branch,
                message: `${body.message.trim()} (via shared access link)`,
                content: body.content,
                sha: existingSha,
              });
              await logSessionEvent(session, "session_file_written", {
                branch: body.branch,
                path: body.path,
                commitSha: result.commit.sha,
              });
              await notifyOwner(session, `A file was changed in ${session.fullName} through a shared access link.`);
              return json({ commitSha: result.commit.sha, sha: result.content.sha });
            }
            case "deleteFile": {
              await requireCap(session, "repo:deleteFile");
              if (!body.branch || !body.path || !body.message) {
                return json({ error: "branch, path and message are required." }, 400);
              }
              const { getFileSha, deleteFile } = await import("@/lib/github/api.server");
              const sha = await getFileSha(token, session.fullName, body.branch, body.path);
              if (!sha) return json({ error: "File not found." }, 404);
              const result = await deleteFile(token, session.fullName, {
                path: body.path,
                branch: body.branch,
                message: `${body.message.trim()} (via shared access link)`,
                sha,
              });
              await logSessionEvent(session, "session_file_deleted", { branch: body.branch, path: body.path });
              await notifyOwner(session, `A file was deleted in ${session.fullName} through a shared access link.`);
              return json({ commitSha: result.commit.sha });
            }
            case "createBranch": {
              await requireCap(session, "repo:createBranch");
              if (!body.newBranch || !body.fromBranch) {
                return json({ error: "newBranch and fromBranch are required." }, 400);
              }
              const { getRef, createRef } = await import("@/lib/github/api.server");
              const head = await getRef(token, session.fullName, body.fromBranch);
              await createRef(token, session.fullName, body.newBranch, head.object.sha);
              await logSessionEvent(session, "session_branch_created", {
                newBranch: body.newBranch,
                fromBranch: body.fromBranch,
              });
              return json({ branch: body.newBranch });
            }
            case "renameRepository": {
              await requireCap(session, "repo:adminSettings");
              if (!body.newName) return json({ error: "newName is required." }, 400);
              const { renameRepo } = await import("@/lib/github/api.server");
              const repo = await renameRepo(token, session.fullName, body.newName);
              await logSessionEvent(session, "session_repo_renamed", { newName: body.newName });
              await notifyOwner(session, `${session.fullName} was renamed through a shared access link.`);
              return json({ fullName: repo.full_name });
            }
            case "setArchived": {
              await requireCap(session, "repo:adminSettings");
              if (typeof body.archived !== "boolean") return json({ error: "archived is required." }, 400);
              const { setRepoArchived } = await import("@/lib/github/api.server");
              const repo = await setRepoArchived(token, session.fullName, body.archived);
              await logSessionEvent(session, "session_repo_archived", { archived: body.archived });
              return json({ archived: repo.archived ?? body.archived });
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

/** Best-effort heads-up to the repo owner — mirrors the notifications already sent for ordinary pushes. */
async function notifyOwner(session: ActiveSession, body: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data: link } = await db
      .from("repo_access_links")
      .select("created_by")
      .eq("id", session.linkId)
      .maybeSingle();
    if (!link?.created_by) return;
    const { notifyUser } = await import("@/lib/notifications/store.server");
    await notifyUser(link.created_by, {
      type: "repository_shared",
      title: "Change via shared access link",
      body,
      workspaceId: session.workspaceId,
      repoFullName: session.fullName,
    });
  } catch (err) {
    console.error("[share write] owner notification failed:", err);
  }
}
