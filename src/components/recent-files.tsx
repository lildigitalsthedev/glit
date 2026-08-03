import { File, FileCode2, FileCog, FileImage, FileJson2, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecentFile } from "@/lib/workspace.functions";

const CODE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "rs", "rb",
  "java", "c", "cpp", "h", "sh", "sql", "php",
]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"]);
const CONFIG_NAMES = new Set([
  "package.json", "tsconfig.json", "vite.config.ts", ".gitignore", ".env",
  ".eslintrc", "eslint.config.js",
]);

function fileExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx <= 0) return "";
  return name.slice(idx + 1).toLowerCase();
}

function FileIcon({ name }: { name: string }) {
  const ext = fileExtension(name);
  if (CONFIG_NAMES.has(name) || name.startsWith(".")) {
    return <FileCog className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  if (ext === "json") return <FileJson2 className="size-3.5 shrink-0 text-code-string" />;
  if (ext === "md" || ext === "mdx" || ext === "txt") {
    return <FileText className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  if (IMAGE_EXTENSIONS.has(ext)) return <FileImage className="size-3.5 shrink-0 text-accent" />;
  if (CODE_EXTENSIONS.has(ext)) return <FileCode2 className="size-3.5 shrink-0 text-primary" />;
  return <File className="size-3.5 shrink-0 text-muted-foreground" />;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor(diffMs / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

/**
 * Floating popup (rendered inside a `ToolPopup` shell — see
 * `workspace-tools.tsx`) showing the files the user most recently opened or
 * pushed, as a horizontally scrollable row of compact cards. Tapping a card
 * opens that file immediately and closes the popup; there's no need to
 * dig through a vertical list anymore.
 *
 * Persisted server-side, so it survives across sessions and devices — not
 * just tab reloads. Capped to the 8 most recent files; older ones simply
 * scroll off (the underlying data still keeps more, this is just the quick
 * -access view).
 */
export function RecentFilesPopup({
  files,
  loading,
  activePath,
  onOpenFile,
  onClose,
  onClear,
  className,
}: {
  files: RecentFile[];
  loading?: boolean;
  activePath: string;
  onOpenFile: (path: string) => void;
  onClose: () => void;
  onClear?: () => void;
  className?: string;
}) {
  const shown = files.slice(0, 8);

  return (
    <div className={cn("min-w-0", className)}>
      {loading ? (
        <p className="px-1 py-2 text-[11px] text-muted-foreground">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="px-1 py-2 text-[11px] text-muted-foreground">
          Files you open or push will show up here.
        </p>
      ) : (
        <>
          <div className="flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
            {shown.map((file) => {
              const name = file.path.split("/").pop() ?? file.path;
              const isActive = file.path === activePath;
              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => {
                    onOpenFile(file.path);
                    onClose();
                  }}
                  title={file.path}
                  className={cn(
                    "flex shrink-0 flex-col items-start gap-1 rounded-md border px-2.5 py-2 text-left font-mono text-[11px] transition-colors duration-150",
                    isActive
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  <FileIcon name={name} />
                  <span className="max-w-[7rem] truncate">{name}</span>
                  <span className="text-[10px] text-muted-foreground/70">
                    {relativeTime(file.lastOpenedAt)}
                  </span>
                </button>
              );
            })}
          </div>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="mt-1 flex items-center gap-0.5 text-[10px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              <X className="size-2.5" />
              Clear recent files
            </button>
          )}
        </>
      )}
    </div>
  );
}
