import { FilePlus2, FolderPlus, Pencil } from "lucide-react";

export function CommitTotalsBar({
  added,
  modified,
  folders,
}: {
  added: number;
  modified: number;
  folders: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-border bg-secondary/30 px-3 py-2 font-mono text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <FilePlus2 className="size-3 shrink-0 text-primary" />
        Files Added <span className="text-foreground">{added}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <Pencil className="size-3 shrink-0 text-amber-500" />
        Files Modified <span className="text-foreground">{modified}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <FolderPlus className="size-3 shrink-0 text-muted-foreground" />
        Folders Created <span className="text-foreground">{folders}</span>
      </span>
    </div>
  );
}
