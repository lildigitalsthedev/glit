import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  LogOut,
  Monitor,
  UserRound,
  Github,
  SlidersHorizontal,
  Loader2,
  Sparkles,
  Navigation,
  PanelBottom,
  Move,
  PanelLeft,
  PanelRight,
  RotateCcw,
  Lightbulb,
  Crown,
  Code2,
  KeyRound,
  Copy,
  Check,
  GitBranch,
  FolderOpen,
  Bot,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePlan } from "@/hooks/usePlan";
import { useRole } from "@/hooks/useRole";
import { useNavPrefs, type NavPosition, type NavSize } from "@/hooks/useNavPrefs";
import { supabase } from "@/integrations/supabase/client";
import { AccountRow, ConnectGithubDialog, useAccounts } from "@/components/connect-github";
import { RequestFeatureDialog } from "@/components/request-feature-dialog";
import { AiProvidersSection } from "@/components/ai-providers-section";
import { getPreferences, updatePreferences, type Preferences } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

const NAV_POSITIONS: { value: NavPosition; label: string; description: string; icon: typeof PanelBottom }[] = [
  { value: "bottom", label: "Bottom", description: "Docked to the bottom edge — the phone default.", icon: PanelBottom },
  { value: "floating-bottom", label: "Floating", description: "Draggable floating dock.", icon: Move },
  { value: "left", label: "Left side", description: "Side rail — the tablet/desktop default.", icon: PanelLeft },
  { value: "right", label: "Right side", description: "Side rail, opposite edge.", icon: PanelRight },
];

const NAV_SIZES: { value: NavSize; label: string }[] = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
];

const TABS = [
  { value: "account", label: "Account", icon: UserRound },
  { value: "preferences", label: "Preferences", icon: SlidersHorizontal },
  { value: "connections", label: "Connections", icon: Github },
  { value: "ai", label: "AI", icon: Bot },
  { value: "feedback", label: "Feedback", icon: Lightbulb },
] as const;

type TabValue = (typeof TABS)[number]["value"];

function isTabValue(value: string): value is TabValue {
  return TABS.some((tab) => tab.value === value);
}

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: (search: Record<string, unknown>): { tab?: TabValue } => {
    const raw = typeof search.tab === "string" ? search.tab : undefined;
    return { tab: raw && isTabValue(raw) ? raw : undefined };
  },
  head: () => ({
    meta: [
      { title: "Settings — GitPush" },
      { name: "description", content: "Manage your account, connections and app settings." },
      { property: "og:title", content: "Settings — GitPush" },
      { property: "og:description", content: "Manage your account, connections and app settings." },
    ],
  }),
  component: Settings,
});

const FONT_SIZES = [12, 13, 14, 15, 16, 18];
const TAB_WIDTHS = [2, 4, 8];

/** Change-password dialog. Talks to Supabase auth directly on the client —
 * there's no server function involved, so it works even if the caller
 * doesn't remember their current password (Supabase only requires an
 * active session). */
function ChangePasswordDialog() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setPassword("");
    setConfirm("");
  }

  async function handleSave() {
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated.");
      setOpen(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <KeyRound className="size-3.5" />
        Change password
      </Button>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Choose a new password for your account.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-password" className="text-sm">
              New password
            </Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password" className="text-sm">
              Confirm password
            </Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter password"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Save password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accounts = useAccounts();
  const { plan, isPro } = usePlan();
  const { isOwner, isDeveloper } = useRole();
  const navPrefs = useNavPrefs();
  const search = Route.useSearch();

  const prefsFn = useServerFn(getPreferences);
  const updatePrefsFn = useServerFn(updatePreferences);
  const prefs = useQuery({ queryKey: ["prefs"], queryFn: () => prefsFn() });

  const [copied, setCopied] = useState(false);
  const [signingOutEverywhere, setSigningOutEverywhere] = useState(false);
  const [defaultBranchInput, setDefaultBranchInput] = useState("");
  const [defaultFolderInput, setDefaultFolderInput] = useState("");
  const [branchFocused, setBranchFocused] = useState(false);
  const [folderFocused, setFolderFocused] = useState(false);

  // Keep the text fields in sync with the server once preferences load —
  // but only while the user isn't actively editing them, so a background
  // refetch never clobbers an in-progress keystroke.
  useEffect(() => {
    if (!branchFocused) setDefaultBranchInput(prefs.data?.defaultBranch ?? "");
  }, [prefs.data?.defaultBranch, branchFocused]);
  useEffect(() => {
    if (!folderFocused) setDefaultFolderInput(prefs.data?.defaultFolder ?? "");
  }, [prefs.data?.defaultFolder, folderFocused]);

  function setPref(patch: Partial<Preferences>) {
    void updatePrefsFn({ data: patch }).then(() => queryClient.invalidateQueries({ queryKey: ["prefs"] }));
  }

  function handleTabChange(value: string) {
    if (!isTabValue(value)) return;
    void navigate({ to: "/settings", search: { tab: value }, replace: true });
  }

  async function handleCopyUserId() {
    if (!user?.id) return;
    try {
      await navigator.clipboard.writeText(user.id);
      setCopied(true);
      toast.success("User ID copied.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard.");
    }
  }

  async function handleSignOutEverywhere() {
    setSigningOutEverywhere(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;
      toast.success("Signed out of all devices.");
      await navigate({ to: "/auth" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't sign out everywhere.");
    } finally {
      setSigningOutEverywhere(false);
    }
  }

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();
  const activeTab: TabValue = search.tab ?? "account";

  return (
    <main className="mx-auto max-w-3xl px-3 py-4 lg:max-w-4xl lg:px-6 lg:py-8">
      <p className="label-caps">Account</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Settings</h1>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-6 w-full">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto p-1">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 whitespace-nowrap px-3 py-1.5">
              <tab.icon className="size-3.5" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Account: identity, plan, security, staff dashboards */}
        <TabsContent value="account" className="mt-4 space-y-4">
          <section className="flex items-center gap-4 rounded-md border border-border bg-card p-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-sm text-foreground">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.email ?? "Unknown user"}</p>
              <button
                type="button"
                onClick={() => void handleCopyUserId()}
                className="mt-0.5 flex items-center gap-1 truncate font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {user?.id?.slice(0, 8)}…
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void signOut().then(() => void navigate({ to: "/auth" }))}
            >
              <LogOut className="size-3.5" />
              Log out
            </Button>
          </section>

          <section className="rounded-md border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
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
            </div>
          </section>

          <section className="rounded-md border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Security</h2>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <ChangePasswordDialog />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={signingOutEverywhere}>
                    <Monitor className="size-3.5" />
                    Sign out of all devices
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sign out everywhere?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This ends every active session for your account, including this one. You'll need
                      to sign in again.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void handleSignOutEverywhere()}>
                      Sign out everywhere
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </section>

          {(isOwner || isDeveloper) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {isOwner && (
                <section className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Crown className="size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Owner Dashboard</p>
                      <p className="text-xs text-muted-foreground">Manage user roles across GitPush.</p>
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/owner">Open</Link>
                  </Button>
                </section>
              )}

              {isDeveloper && (
                <section className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Code2 className="size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Developer Dashboard</p>
                      <p className="text-xs text-muted-foreground">Feature flags, diagnostics, and debugging tools.</p>
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/developer">Open</Link>
                  </Button>
                </section>
              )}
            </div>
          )}
        </TabsContent>

        {/* Preferences: editor, defaults, navigation */}
        <TabsContent value="preferences" className="mt-4 space-y-6">
          <section>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Editor</h2>
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

          <section>
            <div className="flex items-center gap-2">
              <FolderOpen className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Defaults</h2>
            </div>

            <div className="mt-3 divide-y divide-border rounded-md border border-border bg-card">
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Label htmlFor="default-branch" className="flex items-center gap-1.5 text-sm">
                    <GitBranch className="size-3.5 text-muted-foreground" />
                    Default branch
                  </Label>
                  <p className="text-xs text-muted-foreground">Branch new repos open to, when it exists.</p>
                </div>
                <Input
                  id="default-branch"
                  className="h-8 w-32 font-mono text-xs"
                  placeholder="main"
                  value={defaultBranchInput}
                  onFocus={() => setBranchFocused(true)}
                  onChange={(e) => setDefaultBranchInput(e.target.value)}
                  onBlur={(e) => {
                    setBranchFocused(false);
                    setPref({ defaultBranch: e.target.value.trim() || null });
                  }}
                />
              </div>

              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Label htmlFor="default-folder" className="text-sm">
                    Default folder
                  </Label>
                  <p className="text-xs text-muted-foreground">Path a repo's file tree opens to first.</p>
                </div>
                <Input
                  id="default-folder"
                  className="h-8 w-32 font-mono text-xs"
                  placeholder="/"
                  value={defaultFolderInput}
                  onFocus={() => setFolderFocused(true)}
                  onChange={(e) => setDefaultFolderInput(e.target.value)}
                  onBlur={(e) => {
                    setFolderFocused(false);
                    setPref({ defaultFolder: e.target.value.trim() || null });
                  }}
                />
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Navigation className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Navigation</h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => navPrefs.reset()}
              >
                <RotateCcw className="size-3.5" />
                Reset layout
              </Button>
            </div>

            <div className="mt-3 space-y-4 rounded-md border border-border bg-card p-4">
              <div>
                <Label className="text-sm">Position</Label>
                <p className="text-xs text-muted-foreground">
                  Where the nav bar sits. Floating can be dragged anywhere on screen; left/right rails
                  apply on tablets and larger, and fall back to the bottom on phones.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {NAV_POSITIONS.map((option) => {
                    const active = navPrefs.position === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => navPrefs.setPosition(option.value)}
                        aria-pressed={active}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-md border px-3 py-3 text-center transition-colors",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                        )}
                      >
                        <option.icon className="size-4" />
                        <span className="text-xs font-medium">{option.label}</span>
                        <span className="text-[10px] leading-tight text-muted-foreground">{option.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label className="text-sm">Size</Label>
                <p className="text-xs text-muted-foreground">Controls height, icon size, and touch targets.</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {NAV_SIZES.map((option) => {
                    const active = navPrefs.size === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => navPrefs.setSize(option.value)}
                        aria-pressed={active}
                        className={cn(
                          "rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
                <div>
                  <Label htmlFor="nav-auto-hide" className="text-sm">
                    Auto-hide navigation
                  </Label>
                  <p className="text-xs text-muted-foreground">Fades after a few seconds idle; taps or scrolling bring it back.</p>
                </div>
                <Switch
                  id="nav-auto-hide"
                  checked={navPrefs.autoHide}
                  onCheckedChange={(checked) => navPrefs.setAutoHide(checked)}
                />
              </div>
            </div>
          </section>
        </TabsContent>

        {/* Connections: linked GitHub accounts */}
        <TabsContent value="connections" className="mt-4">
          <section>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Github className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Connected accounts</h2>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {isPro ? "Unlimited" : `${(accounts.data ?? []).length} of 1`}
                </Badge>
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
        </TabsContent>

        {/* AI providers */}
        <TabsContent value="ai" className="mt-4">
          <AiProvidersSection />
        </TabsContent>

        {/* Feedback */}
        <TabsContent value="feedback" className="mt-4">
          <section>
            <div className="flex items-center gap-2">
              <Lightbulb className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Feedback</h2>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-border bg-card p-4">
              <div>
                <p className="text-sm font-medium">Request a feature</p>
                <p className="text-xs text-muted-foreground">
                  Tell us what you&apos;d like to see next — if we build it, you get 1 year free,
                  even on Pro features.
                </p>
              </div>
              <RequestFeatureDialog />
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </main>
  );
}
