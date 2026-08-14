import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bell,
  UserPlus,
  UserMinus,
  Share2,
  Sparkles,
  UploadCloud,
  Archive,
  Check,
  X,
  BellOff,
  ChevronDown,
  Undo2,
  Mail,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markNotificationUnread,
  markAllNotificationsRead,
  deleteNotification,
  type NotificationRecord,
  type NotificationType,
} from "@/lib/notifications.functions";
import { undoPush } from "@/lib/github.functions";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  workspace_invited: UserPlus,
  workspace_removed: UserMinus,
  repository_shared: Share2,
  ai_generation_completed: Sparkles,
  push_completed: UploadCloud,
  repository_archived: Archive,
};

/** A push is only undoable for a short window server-side (see undoPush in github.functions.ts) — mirrored here just to hide a button that's guaranteed to fail rather than to enforce anything, since the server re-checks this regardless. */
const UNDO_WINDOW_MS = 15 * 60 * 1000;

/**
 * Header bell + slide-over notification center (Feature 7). Lives in
 * AppShell so it's available from every authenticated route, same as the
 * nav drawer it sits next to. Unread count polls in the background so the
 * badge stays current without the user needing to open the panel.
 *
 * Tapping a notification expands it in place — beyond just marking it
 * read, this surfaces whatever extra actions apply (Undo on a recent push,
 * toggling read state, deleting), matching the same tap-to-expand pattern
 * as the workspace Activity feed. This also doubles as the only reachable
 * way to delete on a touchscreen: the inline "×" button next to each row
 * only shows on hover, which never fires on mobile.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Session-local memory of which pushes were just undone, so the button
  // disappears immediately after a successful undo without needing the
  // notification's own metadata (which never changes) to reflect it.
  const [undoneIds, setUndoneIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const listFn = useServerFn(listNotifications);
  const countFn = useServerFn(getUnreadNotificationCount);
  const markReadFn = useServerFn(markNotificationRead);
  const markUnreadFn = useServerFn(markNotificationUnread);
  const markAllReadFn = useServerFn(markAllNotificationsRead);
  const deleteFn = useServerFn(deleteNotification);
  const undoPushFn = useServerFn(undoPush);

  const countQuery = useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: () => countFn(),
    refetchInterval: 30_000,
  });

  const listQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listFn({ data: {} }),
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => markReadFn({ data: { id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  const markUnread = useMutation({
    mutationFn: (id: string) => markUnreadFn({ data: { id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => markAllReadFn(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  const undo = useMutation({
    mutationFn: (pushId: string) => undoPushFn({ data: { pushId } }),
    onSuccess: (result, pushId) => {
      toast.success(`Undone — ${result.fullName} (${result.branch}) reverted to ${result.revertedTo}.`);
      setUndoneIds((prev) => new Set(prev).add(pushId));
      void queryClient.invalidateQueries({ queryKey: ["tree"] });
      void queryClient.invalidateQueries({ queryKey: ["commits"] });
      void queryClient.invalidateQueries({ queryKey: ["branches"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const entries = listQuery.data?.entries ?? [];
  const unreadCount = countQuery.data?.count ?? 0;

  function handleItemClick(notification: NotificationRecord) {
    if (!notification.readAt) markRead.mutate(notification.id);
    setExpandedId((current) => (current === notification.id ? null : notification.id));
  }

  function toggleReadState(notification: NotificationRecord) {
    if (notification.readAt) markUnread.mutate(notification.id);
    else markRead.mutate(notification.id);
  }

  function undoablePushId(notification: NotificationRecord): string | null {
    if (notification.type !== "push_completed") return null;
    const pushId = notification.metadata.pushId;
    if (typeof pushId !== "string") return null;
    if (undoneIds.has(pushId)) return null;
    if (Date.now() - new Date(notification.createdAt).getTime() > UNDO_WINDOW_MS) return null;
    return pushId;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className="relative -mr-1 flex size-8 items-center justify-center rounded-md transition-colors duration-150 hover:bg-white/5 active:scale-95"
      >
        <Bell className="size-4 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex size-2 items-center justify-center rounded-full bg-primary">
            <span className="absolute inline-flex size-2 animate-ping rounded-full bg-primary opacity-75" />
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="flex-row items-center justify-between space-y-0 border-b border-border px-4 py-3">
            <SheetTitle className="text-base">Notifications</SheetTitle>
            {unreadCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="mr-6 h-7 gap-1 px-2 text-xs"
                disabled={markAllRead.isPending}
                onClick={() => markAllRead.mutate()}
              >
                <Check className="size-3" />
                Mark all read
              </Button>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {listQuery.isLoading && (
              <div className="divide-y divide-border">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3">
                    <Skeleton className="size-7 shrink-0 rounded-md" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-2/3" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!listQuery.isLoading && entries.length === 0 && (
              <EmptyState
                className="mt-4"
                icon={BellOff}
                title="No notifications yet."
                description="Invites, pushes, shares, and AI runs will show up here."
              />
            )}

            {!listQuery.isLoading && entries.length > 0 && (
              <ul className="divide-y divide-border">
                {entries.map((notification, index) => {
                  const Icon = TYPE_ICON[notification.type] ?? Bell;
                  const unread = !notification.readAt;
                  const isExpanded = expandedId === notification.id;
                  const pushIdToUndo = undoablePushId(notification);
                  const branch =
                    typeof notification.metadata.branch === "string" ? notification.metadata.branch : null;
                  const commitSha =
                    typeof notification.metadata.commitSha === "string" ? notification.metadata.commitSha : null;
                  return (
                    <li
                      key={notification.id}
                      style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
                      className="group relative animate-in fade-in px-4 py-3 transition-colors duration-150 hover:bg-secondary/30"
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => handleItemClick(notification)}
                          className="flex min-w-0 flex-1 items-start gap-3 text-left"
                        >
                          <span
                            className={cn(
                              "flex size-7 shrink-0 items-center justify-center rounded-md border",
                              unread
                                ? "border-primary/30 bg-primary/10 text-primary"
                                : "border-border bg-card text-muted-foreground",
                            )}
                          >
                            <Icon className="size-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span
                                className={cn("truncate text-sm", unread ? "font-medium" : "text-muted-foreground")}
                              >
                                {notification.title}
                              </span>
                              {unread && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                            </span>
                            {notification.body && (
                              <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                                {notification.body}
                              </span>
                            )}
                            <span className="mt-1 flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                              {formatDistanceToNowStrict(new Date(notification.createdAt), { addSuffix: true })}
                              <ChevronDown
                                className={cn(
                                  "size-3 shrink-0 transition-transform duration-150",
                                  isExpanded && "rotate-180",
                                )}
                              />
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label="Delete notification"
                          onClick={() => remove.mutate(notification.id)}
                          className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-white/5 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="ml-10 mt-2 space-y-2 border-t border-border pt-2">
                          {(notification.repoFullName || branch || commitSha) && (
                            <p className="truncate font-mono text-[11px] text-muted-foreground">
                              {notification.repoFullName}
                              {branch && ` · ${branch}`}
                              {commitSha && ` · ${commitSha}`}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {pushIdToUndo && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 px-2 text-xs"
                                disabled={undo.isPending}
                                onClick={() => undo.mutate(pushIdToUndo)}
                              >
                                <Undo2 className="size-3" />
                                {undo.isPending ? "Undoing…" : "Undo push"}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={() => toggleReadState(notification)}
                            >
                              {unread ? <Check className="size-3" /> : <Mail className="size-3" />}
                              {unread ? "Mark as read" : "Mark as unread"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                              onClick={() => remove.mutate(notification.id)}
                            >
                              <X className="size-3" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
