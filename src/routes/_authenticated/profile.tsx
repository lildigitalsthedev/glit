import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LogOut, UserRound, Github, SlidersHorizontal, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePlan } from "@/hooks/usePlan";
import { AccountRow, ConnectGithubDialog, useAccounts } from "@/components/connect-github";
import { getPreferences, updatePreferences, type Preferences } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — GitPush" },
      { name: "description", content: "Manage your account, connections and app settings." },
      { property: "og:title", content: "Profile — GitPush" },
      { property: "og:description", content: "Manage your account, connections and app settings." },
    ],
  }),
  component: Profile,
});

const FONT_SIZES = [12, 13, 14, 15, 16, 18];
const TAB_WIDTHS = [2, 4, 8];

function Profile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accounts = useAccounts();
  const { plan, isPro } = usePlan();

  const prefsFn = useServerFn(getPreferences);
  const updatePrefsFn = useServerFn(updatePreferences);
  const prefs = useQuery({ queryKey: ["prefs"], queryFn: () => prefsFn() });

  function setPref(patch: Partial<Preferences>) {
    void updatePrefsFn({ data: patch }).then(() => queryClient.invalidateQueries({ queryKey: ["prefs"] }));
  }

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <p className="label-caps">Account</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Profile</h1>

      {/* User details */}
      <section className="mt-8 flex items-center gap-4 rounded-md border border-border bg-card p-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-sm text-foreground">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user?.email ?? "Unknown user"}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            Signed in · user id {user?.id?.slice(0, 8)}…
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void signOut().then(() => void navigate({ to: "/auth" }))}>
          <LogOut className="size-3.5" />
          Log out
        </Button>
      </section>

      {/* Plan */}
      <section className="mt-8 flex items-center justify-between gap-3 rounded-md border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full",
              isPro ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground",
            )}
          >
            <Sparkles className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{isPro ? "GitPush Pro" : "Free plan"}</p>
              <Badge variant={isPro ? "default" : "secondary"} className="font-mono text-[10px]">
                {plan}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {isPro
                ? "Unlimited accounts and AI-assisted tools are unlocked."
                : "Upgrade for unlimited accounts and AI-assisted tools."}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/pricing">{isPro ? "Manage plan" : "Upgrade"}</Link>
        </Button>
      </section>

      {/* Connected GitHub accounts */}
      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Github className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Connected accounts</h2>
          </div>
          <ConnectGithubDialog />
        </div>

        <div className="mt-3 space-y-2">
          {accounts.isLoading && (
            <div className="flex h-16 items-center justify-center rounded-md border border-border">
              <Loader2 className="size-4 animate-spin text-primary" />
            </div>
          )}
          {!accounts.isLoading && (accounts.data ?? []).length === 0 && (
            <EmptyState
              size="compact"
              icon={UserRound}
              title="No GitHub accounts connected."
              description="Connect an account to browse and push to your repositories."
            />
          )}
          {(accounts.data ?? []).map((account) => (
            <AccountRow key={account.id} {...account} />
          ))}
        </div>
      </section>

      {/* App settings */}
      <section className="mt-8">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Editor settings</h2>
        </div>

        <div className="mt-3 divide-y divide-border rounded-md border border-border bg-card">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <Label className="text-sm">Font size</Label>
              <p className="text-xs text-muted-foreground">Editor text size in pixels.</p>
            </div>
            <Select
              value={String(prefs.data?.editorFontSize ?? 13)}
              onValueChange={(value) => setPref({ editorFontSize: Number(value) })}
            >
              <SelectTrigger className="h-8 w-24 font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)} className="font-mono text-xs">
                    {size}px
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <Label className="text-sm">Tab width</Label>
              <p className="text-xs text-muted-foreground">Spaces inserted per tab.</p>
            </div>
            <Select
              value={String(prefs.data?.tabWidth ?? 2)}
              onValueChange={(value) => setPref({ tabWidth: Number(value) })}
            >
              <SelectTrigger className="h-8 w-24 font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAB_WIDTHS.map((width) => (
                  <SelectItem key={width} value={String(width)} className="font-mono text-xs">
                    {width} spaces
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <Label htmlFor="word-wrap" className="text-sm">
                Word wrap
              </Label>
              <p className="text-xs text-muted-foreground">Wrap long lines instead of scrolling.</p>
            </div>
            <Switch
              id="word-wrap"
              checked={prefs.data?.wordWrap ?? true}
              onCheckedChange={(checked) => setPref({ wordWrap: checked })}
            />
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <Label htmlFor="auto-save" className="text-sm">
                Auto-save drafts
              </Label>
              <p className="text-xs text-muted-foreground">Keep unsaved edits between sessions.</p>
            </div>
            <Switch
              id="auto-save"
              checked={prefs.data?.autoSave ?? true}
              onCheckedChange={(checked) => setPref({ autoSave: checked })}
            />
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <Label htmlFor="notifications" className="text-sm">
                Notifications
              </Label>
              <p className="text-xs text-muted-foreground">Toast alerts for pushes and errors.</p>
            </div>
            <Switch
              id="notifications"
              checked={prefs.data?.notifications ?? true}
              onCheckedChange={(checked) => setPref({ notifications: checked })}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
