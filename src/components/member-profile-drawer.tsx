import { format } from "date-fns";
import { Loader2, Shield, UserMinus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MemberDto } from "@/lib/workspaces.functions";
import {
  WORKSPACE_ROLE_DESCRIPTIONS,
  WORKSPACE_ROLE_LABELS,
  type WorkspaceRole,
} from "@/lib/workspaces/permissions";
import { getMemberStatus, presenceDotClass } from "@/lib/member-status";
import { cn } from "@/lib/utils";

interface MemberProfileDrawerProps {
  member: MemberDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSelf: boolean;
  roleOptions: readonly WorkspaceRole[];
  canSetRole: boolean;
  canRemove: boolean;
  canTransfer: boolean;
  onSetRole: (role: WorkspaceRole) => void;
  onRemove: () => void;
  onTransfer: () => void;
  isSettingRole?: boolean;
  isRemoving?: boolean;
  isTransferring?: boolean;
}

/**
 * Tap-through detail view for a single workspace member. Pulled out of the
 * member list row so the row itself can stay compact — role changes,
 * ownership transfer and removal all live here instead.
 */
export function MemberProfileDrawer({
  member,
  open,
  onOpenChange,
  isSelf,
  roleOptions,
  canSetRole,
  canRemove,
  canTransfer,
  onSetRole,
  onRemove,
  onTransfer,
  isSettingRole,
  isRemoving,
  isTransferring,
}: MemberProfileDrawerProps) {
  if (!member) return null;

  const status = getMemberStatus(member.lastActiveAt);
  const name = member.displayName ?? member.email ?? "Unknown";
  const isOwner = member.role === "owner";
  const showRoleControl = canSetRole && !isOwner && !isSelf && roleOptions.length > 0;
  const showTransfer = canTransfer && !isOwner && !isSelf;
  const showRemove = canRemove && !isOwner && !isSelf;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="items-center pb-2 text-center">
          <div className="relative">
            <Avatar className="size-16">
              {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" /> : null}
              <AvatarFallback className="text-lg">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span
              className={cn(
                "absolute bottom-0.5 right-0.5 size-3.5 rounded-full border-2 border-background",
                presenceDotClass(status.presence),
              )}
              aria-hidden
            />
          </div>
          <DrawerTitle className="mt-1">{name}</DrawerTitle>
          <DrawerDescription className="font-mono text-xs">
            {member.email ?? member.userId}
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-3 px-4 pb-2">
          <div className="flex items-center justify-between rounded-md border border-border p-2.5">
            <span className="text-xs text-muted-foreground">Status</span>
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <span className={cn("size-1.5 rounded-full", presenceDotClass(status.presence))} aria-hidden />
              {status.label}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-2.5">
            <span className="text-xs text-muted-foreground">Role</span>
            <Badge variant="secondary" className="gap-1">
              {isOwner ? <Shield className="size-3" /> : null}
              {WORKSPACE_ROLE_LABELS[member.role]}
            </Badge>
          </div>
          <p className="px-0.5 text-xs text-muted-foreground">{WORKSPACE_ROLE_DESCRIPTIONS[member.role]}</p>

          <div className="flex items-center justify-between rounded-md border border-border p-2.5">
            <span className="text-xs text-muted-foreground">Joined</span>
            <span className="text-xs">{format(new Date(member.joinedAt), "MMM d, yyyy")}</span>
          </div>
        </div>

        {showRoleControl || showTransfer || showRemove ? (
          <div className="space-y-2 border-t border-border px-4 py-3">
            {showRoleControl ? (
              <div className="space-y-1.5">
                <span className="label-caps text-muted-foreground">Change role</span>
                <Select
                  value={member.role}
                  disabled={isSettingRole}
                  onValueChange={(value) => onSetRole(value as WorkspaceRole)}
                >
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((option) => (
                      <SelectItem key={option} value={option} className="text-xs">
                        {WORKSPACE_ROLE_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-1">
              {showTransfer ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={isTransferring}
                  onClick={onTransfer}
                >
                  {isTransferring ? <Loader2 className="size-4 animate-spin" /> : <Shield className="size-4" />}
                  Transfer ownership
                </Button>
              ) : null}
              {showRemove ? (
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1.5"
                  disabled={isRemoving}
                  onClick={onRemove}
                >
                  {isRemoving ? <Loader2 className="size-4 animate-spin" /> : <UserMinus className="size-4" />}
                  Remove from workspace
                </Button>
              ) : null}
            </div>
          </div>
        ) : isSelf ? (
          <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            This is you. Roles and removal can't be changed from your own profile.
          </p>
        ) : null}

        <DrawerFooter className="pt-2">
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
