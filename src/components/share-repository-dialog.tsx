import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Globe,
  Link2,
  Loader2,
  Copy,
  Ban,
  Clock,
  Plus,
  ShieldAlert,
  Download,
  CheckCircle2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTempPublicStatus } from "@/hooks/useTempPublicStatus";
import {
  makeRepoTemporarilyPublic,
  extendRepoTemporaryPublic,
  endRepoTemporaryPublicNow,
  createRepoAccessLink,
  listRepoAccessLinks,
  revokeRepoAccessLink,
  extendRepoAccessLink,
  SHARE_ROLES,
  SHARE_ROLE_LABELS,
  SHARE_ROLE_DESCRIPTIONS,
  type ShareRole,
  type AccessLinkSummary,
} from "@/lib/github-share.functions";

const DURATION_PRESETS = [
  { label: "1 minute", seconds: 60 },
  { label: "2 minutes", seconds: 120 },
  { label: "5 minutes", seconds: 300 },
  { label: "10 minutes", seconds: 600 },
  { label: "30 minutes", seconds: 1800 },
  { label: "1 hour", seconds: 3600 },
  { label: "6 hours", seconds: 21600 },
  { label: "12 hours", seconds: 43200 },
  { label: "24 hours", seconds: 86400 },
  { label: "Custom…", seconds: -1 },
];

const EXPIRY_PRESETS = [
  { label: "5 minutes", seconds: 300 },
  { label: "15 minutes", seconds: 900 },
  { label: "30 minutes", seconds: 1800 },
  { label: "1 hour", seconds: 3600 },
  { label: "6 hours", seconds: 21600 },
  { label: "24 hours", seconds: 86400 },
  { label: "7 days", seconds: 604800 },
  { label: "Custom…", seconds: -1 },
];

const USES_PRESETS = [1, 2, 3, 5, 10, 25];

function formatRemaining(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function statusBadge(status: AccessLinkSummary["status"]) {
  const map: Record<AccessLinkSummary["status"], { label: string; className: string }> = {
    active: { label: "Active", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" },
    revoked: { label: "Revoked", className: "border-destructive/30 bg-destructive/10 text-destructive" },
    expired: { label: "Expired", className: "border-border bg-muted text-muted-foreground" },
    exhausted: { label: "Exhausted", className: "border-border bg-muted text-muted-foreground" },
  };
  const { label, className } = map[status];
  return <Badge variant="outline" className={className}>{label}</Badge>;
}

function TemporaryPublicTab({
  accountId,
  fullName,
}: {
  accountId: string;
  fullName: string;
}) {
  const queryClient = useQueryClient();
  const { data: status, isLoading } = useTempPublicStatus(accountId, fullName);
  const [durationSeconds, setDurationSeconds] = useState(600);
  const [customMinutes, setCustomMinutes] = useState(15);
  const [confirmed, setConfirmed] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);

  const makeFn = useServerFn(makeRepoTemporarilyPublic);
  const extendFn = useServerFn(extendRepoTemporaryPublic);
  const endFn = useServerFn(endRepoTemporaryPublicNow);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["temp-public-status", accountId, fullName] });
    void queryClient.invalidateQueries({ queryKey: ["repo-details", accountId, fullName] });
    void queryClient.invalidateQueries({ queryKey: ["repos"] });
  };

  const makePublic = useMutation({
    mutationFn: () => makeFn({ data: { accountId, fullName, seconds: durationSeconds } }),
    onSuccess: () => {
      toast.success(`${fullName} is public temporarily.`);
      setConfirmed(false);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't make the repository public."),
  });

  const extend = useMutation({
    mutationFn: (addSeconds: number) => extendFn({ data: { accountId, fullName, addSeconds } }),
    onSuccess: () => {
      toast.success("Timer extended.");
      setExtendOpen(false);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't extend the timer."),
  });

  const endNow = useMutation({
    mutationFn: () => endFn({ data: { accountId, fullName } }),
    onSuccess: () => {
      toast.success(`${fullName} is private again.`);
      setEndConfirmOpen(false);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't make the repository private."),
  });

  const isActive = status && (status.status === "active" || status.status === "reverting");

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if (isActive && status) {
    return (
      <div className="space-y-4 py-2">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-500">
            <Globe className="size-4" /> Public temporarily
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Automatically becoming private in{" "}
            <span className="font-mono font-medium text-foreground">{formatRemaining(status.expiresAt)}</span>
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Exact expiration: {new Date(status.expiresAt).toLocaleString()}
            {status.extendedCount > 0 ? ` · extended ${status.extendedCount}x` : ""}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={() => setExtendOpen((v) => !v)}>
            <Clock className="size-3.5" /> Extend
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setEndConfirmOpen(true)}
          >
            <Ban className="size-3.5" /> Make private now
          </Button>
        </div>

        {extendOpen && (
          <div className="flex flex-wrap gap-1.5">
            {[300, 600, 1800, 3600].map((s) => (
              <Button
                key={s}
                size="sm"
                variant="secondary"
                disabled={extend.isPending}
                onClick={() => extend.mutate(s)}
              >
                +{s < 3600 ? `${s / 60}m` : `${s / 3600}h`}
              </Button>
            ))}
          </div>
        )}

        <AlertDialog open={endConfirmOpen} onOpenChange={setEndConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Make {fullName} private now?</AlertDialogTitle>
              <AlertDialogDescription>
                The repository will stop being publicly visible immediately, ahead of its timer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={endNow.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={endNow.isPending} onClick={() => endNow.mutate()}>
                {endNow.isPending && <Loader2 className="size-4 animate-spin" />}
                Make private
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      <p className="text-xs text-muted-foreground">
        Make this repository publicly accessible for a limited time. It automatically returns to
        private when the timer runs out — no need to remember to change it back.
      </p>

      <div className="space-y-1.5">
        <Label className="text-xs">Duration</Label>
        <Select
          value={String(durationSeconds)}
          onValueChange={(v) => {
            const preset = DURATION_PRESETS.find((p) => String(p.seconds) === v);
            setDurationSeconds(preset?.seconds === -1 ? customMinutes * 60 : Number(v));
          }}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DURATION_PRESETS.map((p) => (
              <SelectItem key={p.label} value={String(p.seconds === -1 ? customMinutes * 60 : p.seconds)}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!DURATION_PRESETS.some((p) => p.seconds === durationSeconds) && (
          <div className="flex items-center gap-2 pt-1">
            <Input
              type="number"
              min={1}
              max={1440}
              value={customMinutes}
              onChange={(e) => {
                const mins = Math.max(1, Math.min(1440, Number(e.target.value) || 1));
                setCustomMinutes(mins);
                setDurationSeconds(mins * 60);
              }}
              className="h-8 w-24 text-sm"
            />
            <span className="text-xs text-muted-foreground">minutes (max 24h)</span>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-600 dark:text-amber-400">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
        <p>
          While public, the repository and its contents may be visible to anyone who can access
          GitHub.
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-2 text-xs">
        <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
        <span>I understand this repository will temporarily be publicly accessible.</span>
      </label>

      <Button
        className="w-full"
        disabled={!confirmed || makePublic.isPending}
        onClick={() => makePublic.mutate()}
      >
        {makePublic.isPending && <Loader2 className="size-4 animate-spin" />}
        Make Public Temporarily
      </Button>
    </div>
  );
}

function AccessLinkTab({ accountId, fullName }: { accountId: string; fullName: string }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<ShareRole>("viewer");
  const [maxUsesChoice, setMaxUsesChoice] = useState<string>("1");
  const [expirySeconds, setExpirySeconds] = useState(86400);
  const [customExpiryHours, setCustomExpiryHours] = useState(24);
  const [allowDownload, setAllowDownload] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AccessLinkSummary | null>(null);

  const createFn = useServerFn(createRepoAccessLink);
  const listFn = useServerFn(listRepoAccessLinks);
  const revokeFn = useServerFn(revokeRepoAccessLink);
  const extendFn = useServerFn(extendRepoAccessLink);

  const linksQuery = useQuery({
    queryKey: ["repo-access-links", fullName],
    queryFn: () => listFn({ data: { fullName } }),
  });

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          accountId,
          fullName,
          role,
          maxUses: maxUsesChoice === "unlimited" ? null : Number(maxUsesChoice),
          expiresInSeconds: expirySeconds,
          allowDownload,
        },
      }),
    onSuccess: (result) => {
      setCreatedUrl(result.shareUrl);
      toast.success("Access link created successfully.");
      void queryClient.invalidateQueries({ queryKey: ["repo-access-links", fullName] });
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't create the access link."),
  });

  const revoke = useMutation({
    mutationFn: (linkId: string) => revokeFn({ data: { linkId } }),
    onSuccess: () => {
      toast.success("Link revoked.");
      setRevokeTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["repo-access-links", fullName] });
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't revoke the link."),
  });

  const extend = useMutation({
    mutationFn: (args: { linkId: string; addSeconds: number }) => extendFn({ data: args }),
    onSuccess: () => {
      toast.success("Expiration extended.");
      void queryClient.invalidateQueries({ queryKey: ["repo-access-links", fullName] });
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't extend the link."),
  });

  const links = linksQuery.data ?? [];

  return (
    <div className="space-y-4 py-2">
      <p className="text-xs text-muted-foreground">
        Keep the repository private and generate a controlled access link instead. The link
        resolves through GitPush — GitHub visibility never changes.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as ShareRole)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHARE_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {SHARE_ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">{SHARE_ROLE_DESCRIPTIONS[role]}</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Maximum uses</Label>
          <Select value={maxUsesChoice} onValueChange={setMaxUsesChoice}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {USES_PRESETS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} use{n === 1 ? "" : "s"}
                </SelectItem>
              ))}
              <SelectItem value="unlimited">Unlimited until expiration</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Expires</Label>
        <Select
          value={String(expirySeconds)}
          onValueChange={(v) => {
            const preset = EXPIRY_PRESETS.find((p) => String(p.seconds) === v);
            setExpirySeconds(preset?.seconds === -1 ? customExpiryHours * 3600 : Number(v));
          }}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXPIRY_PRESETS.map((p) => (
              <SelectItem key={p.label} value={String(p.seconds === -1 ? customExpiryHours * 3600 : p.seconds)}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!EXPIRY_PRESETS.some((p) => p.seconds === expirySeconds) && (
          <div className="flex items-center gap-2 pt-1">
            <Input
              type="number"
              min={1}
              max={168}
              value={customExpiryHours}
              onChange={(e) => {
                const hrs = Math.max(1, Math.min(168, Number(e.target.value) || 1));
                setCustomExpiryHours(hrs);
                setExpirySeconds(hrs * 3600);
              }}
              className="h-8 w-24 text-sm"
            />
            <span className="text-xs text-muted-foreground">hours (max 7 days)</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-md border border-border p-3">
        <div className="flex items-center gap-2 text-xs">
          <Download className="size-3.5 text-muted-foreground" />
          <span>Allow download / clone</span>
        </div>
        <Switch checked={allowDownload} onCheckedChange={setAllowDownload} />
      </div>

      <Button className="w-full" disabled={create.isPending} onClick={() => create.mutate()}>
        {create.isPending && <Loader2 className="size-4 animate-spin" />}
        <Plus className="size-4" /> Generate Access Link
      </Button>

      {createdUrl && (
        <div className="space-y-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
            <CheckCircle2 className="size-3.5" /> Access link created successfully.
          </div>
          <div className="flex items-center gap-1.5">
            <Input readOnly value={createdUrl} className="h-8 font-mono text-[11px]" />
            <Button
              size="icon"
              variant="outline"
              className="size-8 shrink-0"
              onClick={() => {
                void navigator.clipboard.writeText(createdUrl);
                toast.success("Link copied.");
              }}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            This is the only time the full link is shown. Copy it now.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs">Access Links</Label>
        {linksQuery.isLoading ? (
          <div className="flex h-16 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : links.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            No access links yet.
          </p>
        ) : (
          <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {links.map((link) => (
              <div key={link.id} className="rounded-md border border-border p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-mono">
                    <Link2 className="size-3 text-muted-foreground" />
                    •••{link.tokenPrefix.slice(-4)}
                    <Badge variant="secondary" className="text-[10px]">
                      {SHARE_ROLE_LABELS[link.role]}
                    </Badge>
                  </div>
                  {statusBadge(link.status)}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  <span>
                    {link.usesCount}/{link.maxUses ?? "∞"} used
                  </span>
                  <span>
                    {link.status === "active" ? `expires in ${formatRemaining(link.expiresAt)}` : "expired"}
                  </span>
                  {link.lastUsedAt && <span>last used {new Date(link.lastUsedAt).toLocaleString()}</span>}
                </div>
                {link.status === "active" && (
                  <div className="mt-2 flex gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      disabled={extend.isPending}
                      onClick={() => extend.mutate({ linkId: link.id, addSeconds: 3600 })}
                    >
                      +1h
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px] text-destructive hover:text-destructive"
                      onClick={() => setRevokeTarget(link)}
                    >
                      Revoke
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={revokeTarget !== null} onOpenChange={(v) => !v && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this access link?</AlertDialogTitle>
            <AlertDialogDescription>
              Anyone attempting to use it afterward will be denied access. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoke.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={revoke.isPending}
              onClick={() => revokeTarget && revoke.mutate(revokeTarget.id)}
            >
              {revoke.isPending && <Loader2 className="size-4 animate-spin" />}
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function ShareRepositoryDialog({
  open,
  onOpenChange,
  accountId,
  fullName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string | null;
  fullName: string | null;
}) {
  const [tab, setTab] = useState("temp-public");
  const ready = useMemo(() => Boolean(accountId && fullName), [accountId, fullName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">Share Repository</DialogTitle>
          <DialogDescription className="truncate">{fullName}</DialogDescription>
        </DialogHeader>
        {ready && accountId && fullName ? (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="temp-public">
                <Globe className="size-3.5" /> Temporary Public
              </TabsTrigger>
              <TabsTrigger value="access-link">
                <Link2 className="size-3.5" /> Access Link
              </TabsTrigger>
            </TabsList>
            <TabsContent value="temp-public">
              <TemporaryPublicTab accountId={accountId} fullName={fullName} />
            </TabsContent>
            <TabsContent value="access-link">
              <AccessLinkTab accountId={accountId} fullName={fullName} />
            </TabsContent>
          </Tabs>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">No repository selected.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
