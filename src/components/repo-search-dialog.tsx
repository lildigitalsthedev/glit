import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Loader2, FileText, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { searchRepository, type RepoSearchResult } from "@/lib/github-search.functions";

const DEBOUNCE_MS = 450;

/**
 * "Find in files" across the whole repo — content search, not the
 * filename-only matching the Cmd/Ctrl+K command palette already does.
 * Debounced and manually triggered (not a live query) so typing doesn't
 * fan out a GitHub API call per keystroke; see repo-search.server.ts for
 * why this walks the tree directly instead of GitHub's code-search index.
 */
export function RepoSearchDialog({
  open,
  onOpenChange,
  accountId,
  fullName,
  branch,
  onOpenResult,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string | null;
  fullName: string | null;
  branch: string;
  onOpenResult: (path: string, lineNumber?: number) => void;
}) {
  const [query, setQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchFn = useServerFn(searchRepository);

  const search = useMutation({
    mutationFn: (q: string) => searchFn({ data: { accountId: accountId!, fullName: fullName!, branch, query: q } }),
  });

  useEffect(() => {
    if (!open) return;
    setQuery("");
    search.reset();
  }, [open, fullName, branch]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    timerRef.current = setTimeout(() => search.mutate(trimmed), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const result: RepoSearchResult | undefined = search.data;

  const groupedContentMatches = useMemo(() => {
    if (!result) return [];
    const byPath = new Map<string, typeof result.contentMatches>();
    for (const match of result.contentMatches) {
      const list = byPath.get(match.path) ?? [];
      list.push(match);
      byPath.set(match.path, list);
    }
    return Array.from(byPath.entries());
  }, [result]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <Search className="size-4" /> Search in repository
          </DialogTitle>
        </DialogHeader>

        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search file contents on ${branch || "this branch"}…`}
          className="h-9"
        />

        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {search.isPending && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {search.isError && (
            <p className="py-4 text-center text-xs text-destructive">
              {search.error instanceof Error ? search.error.message : "Search failed."}
            </p>
          )}

          {!search.isPending && result && (
            <>
              {result.truncated && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Scanned {result.filesScanned} of {result.totalEligibleFiles} eligible files — this repo is large
                    enough that results may be incomplete. Narrow your search term for a more complete pass.
                  </span>
                </div>
              )}

              {result.fileNameMatches.length === 0 && groupedContentMatches.length === 0 && (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No matches for "{result.query}".
                </p>
              )}

              {result.fileNameMatches.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    File names
                  </p>
                  <div className="space-y-0.5">
                    {result.fileNameMatches.map((m) => (
                      <button
                        key={m.path}
                        type="button"
                        onClick={() => onOpenResult(m.path)}
                        className="flex w-full items-center gap-1.5 truncate rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                        title={m.path}
                      >
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate font-mono">{m.path}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {groupedContentMatches.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Content matches
                  </p>
                  <div className="space-y-2">
                    {groupedContentMatches.map(([filePath, matches]) => (
                      <div key={filePath} className="rounded-md border border-border">
                        <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
                          <FileText className="size-3 shrink-0 text-muted-foreground" />
                          <span className="truncate font-mono text-[11px]">{filePath}</span>
                          <Badge variant="secondary" className="ml-auto text-[9px]">
                            {matches.length}
                          </Badge>
                        </div>
                        {matches.map((m) => (
                          <button
                            key={`${m.path}:${m.lineNumber}`}
                            type="button"
                            onClick={() => onOpenResult(m.path, m.lineNumber)}
                            className="flex w-full items-start gap-2 px-2 py-1 text-left text-[11px] hover:bg-muted"
                          >
                            <span className="shrink-0 font-mono text-muted-foreground">{m.lineNumber}</span>
                            <span className="truncate font-mono">{m.line}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!search.isPending && !result && query.trim().length > 0 && query.trim().length < 2 && (
            <p className="py-4 text-center text-xs text-muted-foreground">Keep typing — at least 2 characters.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
