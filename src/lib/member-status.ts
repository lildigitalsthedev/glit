import { formatDistanceToNowStrict } from "date-fns";

export type MemberPresence = "online" | "recent" | "offline";

export interface MemberStatus {
  presence: MemberPresence;
  /** Short label for list rows, e.g. "Online now", "Active 12m ago". */
  label: string;
}

/**
 * GitPush has no realtime presence socket, so "status" is derived from
 * `workspace_members.last_active_at` — refreshed server-side whenever a
 * member switches into this workspace (`setActiveWorkspace`). That's a
 * good enough signal for "is this person around" without pretending to
 * track live connections.
 */
export function getMemberStatus(lastActiveAt: string | null): MemberStatus {
  if (!lastActiveAt) return { presence: "offline", label: "Never active" };

  const ms = Date.now() - new Date(lastActiveAt).getTime();
  const minutes = ms / 60_000;

  if (minutes < 5) return { presence: "online", label: "Online now" };
  if (minutes < 60) return { presence: "recent", label: `Active ${Math.max(1, Math.round(minutes))}m ago` };

  return {
    presence: "offline",
    label: `Active ${formatDistanceToNowStrict(new Date(lastActiveAt), { addSuffix: true })}`,
  };
}

/** Tailwind classes for the small status dot shown on a member's avatar. */
export function presenceDotClass(presence: MemberPresence): string {
  switch (presence) {
    case "online":
      return "bg-success";
    case "recent":
      return "bg-success/50";
    case "offline":
      return "bg-muted-foreground/40";
  }
}
