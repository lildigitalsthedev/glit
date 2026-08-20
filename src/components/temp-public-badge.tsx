import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { useTempPublicStatus } from "@/hooks/useTempPublicStatus";

function formatCountdown(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * "🟢 Public temporarily · becoming private in 04:32" — the countdown
 * itself ticks every second locally, but the underlying data comes from
 * `useTempPublicStatus`'s poll, so it can't drift from what the server
 * actually thinks (or silently disappear when the window ends server-side
 * while the tab is just sitting there).
 */
export function TempPublicBadge({
  accountId,
  fullName,
  onClick,
}: {
  accountId: string | null;
  fullName: string | null;
  onClick?: () => void;
}) {
  const { data } = useTempPublicStatus(accountId, fullName);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!data || (data.status !== "active" && data.status !== "reverting")) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [data]);

  if (!data || (data.status !== "active" && data.status !== "reverting")) return null;

  const remaining = new Date(data.expiresAt).getTime() - now;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-500 transition-colors hover:bg-emerald-500/20"
      title="This repository is temporarily public"
    >
      <Globe className="size-3" />
      <span className="hidden sm:inline">Public temporarily ·</span>
      <span className="font-mono tabular-nums">
        {remaining > 0 ? formatCountdown(remaining) : "reverting…"}
      </span>
    </button>
  );
}
