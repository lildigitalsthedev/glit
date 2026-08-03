import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  Code2,
  Flag,
  Terminal,
  ScrollText,
  Radio,
  Trash2,
  Gauge,
  FlaskConical,
  Github,
  FolderSync,
  Workflow,
  Info,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import {
  listFeatureFlags,
  setFeatureFlag,
  getSystemInfo,
  getPerformanceMetrics,
  getGithubDiagnostics,
  clearDevCache,
  refreshRepositoryIndexes,
} from "@/lib/devtools.functions";
import { setMyDeveloperMode } from "@/lib/roles.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/_authenticated/developer")({
  head: () => ({
    meta: [
      { title: "Developer Dashboard — GitPush" },
      { name: "description", content: "Feature flags, diagnostics, and debugging tools." },
    ],
  }),
  component: DeveloperDashboard,
});

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function DeveloperDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isDeveloper, developerMode, isLoading: roleLoading } = useRole();
  const [tab, setTab] = useState("flags");

  // Not a Developer or the Owner: hidden, not just visually — bounce back
  // to the main app. Real enforcement lives on every devtools.functions.ts
  // handler, which re-checks the role server-side; this is just so a
  // non-developer never sees the screen.
  if (!roleLoading && !isDeveloper) {
    void navigate({ to: "/app" });
    return null;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <p className="label-caps">Developer</p>
      <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Code2 className="size-5 text-primary" />
        Developer Dashboard
      </h1>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">
        Signed in as {user?.email}. Development and debugging tools — no billing, user
        management, or Owner settings live here.
      </p>

      <DeveloperModeToggle enabled={developerMode} />

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="flags">Flags</TabsTrigger>
          <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        <TabsContent value="flags" className="mt-4 space-y-4">
          <FeatureFlagsSection />
        </TabsContent>

        <TabsContent value="diagnostics" className="mt-4 space-y-4">
          <GithubDiagnosticsSection />
          <RepositoryIndexSection />
          <CacheManagementSection />
        </TabsContent>

        <TabsContent value="performance" className="mt-4 space-y-4">
          <PerformanceMetricsSection />
          <SystemLogsSection />
          <BackgroundJobsSection />
        </TabsContent>

        <TabsContent value="about" className="mt-4 space-y-4">
          <VersionInfoSection />
          <DebugToolsSection onOpenTab={setTab} />
        </TabsContent>
      </Tabs>

      <p className="mt-8 text-center text-[11px] text-muted-foreground">
        Developer access does not include billing, user management, or Owner settings.
      </p>
    </main>
  );
}

function DeveloperModeToggle({ enabled }: { enabled: boolean }) {
  const setModeFn = useServerFn(setMyDeveloperMode);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (next: boolean) => setModeFn({ data: { enabled: next } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["role"] });
      toast.success("Developer Mode updated.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't update Developer Mode."),
  });

  return (
    <section className="mt-6 flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Terminal className="size-4" />
        </div>
        <div>
          <p className="text-sm font-medium">Developer Mode</p>
          <p className="text-xs text-muted-foreground">
            Personal toggle for developer-only UI affordances on your own account.
          </p>
        </div>
      </div>
      <Switch
        checked={enabled}
        disabled={mutation.isPending}
        onCheckedChange={(checked) => mutation.mutate(checked)}
      />
    </section>
  );
}

function FeatureFlagsSection() {
  const listFn = useServerFn(listFeatureFlags);
  const setFn = useServerFn(setFeatureFlag);
  const queryClient = useQueryClient();

  const flags = useQuery({ queryKey: ["dev", "flags"], queryFn: () => listFn() });
  const toggle = useMutation({
    mutationFn: (input: { key: string; enabled: boolean }) => setFn({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dev", "flags"] });
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't update that flag."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Flag className="size-4 text-primary" />
          Feature Flags & Experimental Features
        </CardTitle>
        <CardDescription>
          Force flags on to test Free, Pro, and Enterprise behavior, or ship experimental
          features ahead of release. Changes apply app-wide immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {flags.isLoading && (
          <div className="flex h-16 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-primary" />
          </div>
        )}
        {!flags.isLoading && (flags.data ?? []).length === 0 && (
          <EmptyState size="compact" icon={Flag} title="No feature flags yet." />
        )}
        {(flags.data ?? []).map((flag) => {
          const pending = toggle.isPending && toggle.variables?.key === flag.key;
          return (
            <div
              key={flag.key}
              className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{flag.label}</p>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {flag.key}
                  </Badge>
                </div>
                {flag.description && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{flag.description}</p>
                )}
              </div>
              <Switch
                checked={flag.enabled}
                disabled={pending}
                onCheckedChange={(checked) => toggle.mutate({ key: flag.key, enabled: checked })}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function GithubDiagnosticsSection() {
  const fn = useServerFn(getGithubDiagnostics);
  const diagnostics = useQuery({ queryKey: ["dev", "github-diagnostics"], queryFn: () => fn() });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Github className="size-4 text-primary" />
          GitHub Diagnostics & API Logs
        </CardTitle>
        <CardDescription>
          Connectivity and rate-limit usage for your own connected GitHub accounts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {diagnostics.isLoading && (
          <div className="flex h-16 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-primary" />
          </div>
        )}
        {!diagnostics.isLoading && (diagnostics.data ?? []).length === 0 && (
          <EmptyState
            size="compact"
            icon={Github}
            title="No GitHub accounts connected."
            description="Connect an account from your profile to see diagnostics here."
          />
        )}
        {(diagnostics.data ?? []).map((account) => (
          <div key={account.login} className="border-b border-border py-3 last:border-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{account.login}</p>
              <Badge variant="outline" className="font-mono text-[10px]">
                {account.status}
              </Badge>
            </div>
            {account.rateLimit ? (
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {account.rateLimit.remaining} / {account.rateLimit.limit} requests remaining · resets{" "}
                {new Date(account.rateLimit.resetAt).toLocaleTimeString()}
              </p>
            ) : (
              <p className="mt-0.5 text-[11px] text-destructive">
                {account.rateLimitError ?? "Rate limit unavailable."}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RepositoryIndexSection() {
  const fn = useServerFn(getGithubDiagnostics);
  const refreshFn = useServerFn(refreshRepositoryIndexes);
  const queryClient = useQueryClient();
  const diagnostics = useQuery({ queryKey: ["dev", "github-diagnostics"], queryFn: () => fn() });

  const refresh = useMutation({
    mutationFn: () => refreshFn(),
    onSuccess: (results) => {
      const failed = results.filter((r) => !r.ok);
      void queryClient.invalidateQueries({ queryKey: ["dev", "github-diagnostics"] });
      if (failed.length === 0) toast.success("Repository indexes refreshed.");
      else toast.error(`${failed.length} account(s) failed to refresh.`);
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't refresh repository indexes."),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderSync className="size-4 text-primary" />
            Repository Index Status
          </CardTitle>
          <CardDescription>Sync status for your own connected accounts.</CardDescription>
        </div>
        <Button variant="outline" size="sm" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
          {refresh.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-1">
        {(diagnostics.data ?? []).map((account) => (
          <div key={account.login} className="flex items-center justify-between border-b border-border py-2 last:border-0">
            <p className="text-sm">{account.login}</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {account.lastSync ? `synced ${new Date(account.lastSync).toLocaleString()}` : "never synced"}
            </p>
          </div>
        ))}
        {!diagnostics.isLoading && (diagnostics.data ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">Connect a GitHub account to see index status.</p>
        )}
      </CardContent>
    </Card>
  );
}

function CacheManagementSection() {
  const clearFn = useServerFn(clearDevCache);
  const queryClient = useQueryClient();

  const clear = useMutation({
    mutationFn: () => clearFn(),
    onSuccess: (result) => {
      // Also drop the local React Query cache so the dashboard itself
      // reflects a clean slate immediately.
      queryClient.clear();
      toast.success(`Cache cleared (${result.cleared} entr${result.cleared === 1 ? "y" : "ies"}).`);
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't clear the cache."),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trash2 className="size-4 text-primary" />
            Cache Management
          </CardTitle>
          <CardDescription>Clears the server's GitHub rate-limit cache and your local query cache.</CardDescription>
        </div>
        <Button variant="outline" size="sm" disabled={clear.isPending} onClick={() => clear.mutate()}>
          {clear.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          Clear cache
        </Button>
      </CardHeader>
    </Card>
  );
}

function PerformanceMetricsSection() {
  const fn = useServerFn(getPerformanceMetrics);
  const metrics = useQuery({ queryKey: ["dev", "performance"], queryFn: () => fn() });

  const stats = [
    { label: "Pushes (24h)", value: metrics.data?.pushesLast24h },
    { label: "Succeeded", value: metrics.data?.pushSuccessLast24h },
    { label: "Failed", value: metrics.data?.pushFailuresLast24h },
    { label: "Active accounts (24h)", value: metrics.data?.activeAccountsLast24h },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="size-4 text-primary" />
          Performance Metrics
        </CardTitle>
        <CardDescription>Aggregate, app-wide counts only — no per-user or revenue data.</CardDescription>
      </CardHeader>
      <CardContent>
        {metrics.isLoading ? (
          <div className="flex h-16 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-md border border-border p-3">
                <p className="font-mono text-xl font-semibold">{stat.value ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SystemLogsSection() {
  const fn = useServerFn(getSystemInfo);
  const info = useQuery({ queryKey: ["dev", "system-info"], queryFn: () => fn() });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScrollText className="size-4 text-primary" />
          System Logs
        </CardTitle>
        <CardDescription>
          GitPush doesn't have a centralized log store wired up yet — this is live process
          state instead, refreshed on load.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1 font-mono text-[11px] text-muted-foreground">
        {info.data && (
          <>
            <p>environment: {info.data.environment}</p>
            <p>uptime: {formatDuration(info.data.uptimeSeconds)}</p>
            <p>
              heap: {info.data.memoryUsedMb}MB / {info.data.memoryTotalMb}MB
            </p>
            <p>server time: {new Date(info.data.serverTime).toLocaleString()}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BackgroundJobsSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Workflow className="size-4 text-primary" />
          Background Jobs
        </CardTitle>
        <CardDescription>
          GitPush doesn't currently run a background job queue or scheduler — every request
          (push, sync, refresh) happens inline in the request that triggers it. This section is
          here for when that changes.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function VersionInfoSection() {
  const fn = useServerFn(getSystemInfo);
  const info = useQuery({ queryKey: ["dev", "system-info"], queryFn: () => fn() });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="size-4 text-primary" />
          Version Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 font-mono text-[11px] text-muted-foreground">
        {info.data && (
          <>
            <p>app: GitPush</p>
            <p>node: {info.data.nodeVersion}</p>
            <p>commit: {info.data.commitSha ?? "not set in this environment"}</p>
            <p>environment: {info.data.environment}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DebugToolsSection({ onOpenTab }: { onOpenTab: (tab: string) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="size-4 text-primary" />
          Debug Tools
        </CardTitle>
        <CardDescription>Quick links into the rest of the toolkit.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => onOpenTab("flags")}>
          <Flag className="size-3.5" />
          Feature flags
        </Button>
        <Button variant="outline" size="sm" onClick={() => onOpenTab("diagnostics")}>
          <Radio className="size-3.5" />
          GitHub diagnostics
        </Button>
        <Button variant="outline" size="sm" onClick={() => onOpenTab("performance")}>
          <Gauge className="size-3.5" />
          Performance
        </Button>
      </CardContent>
    </Card>
  );
}
