import { Fragment } from "react";
import { Home } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

/**
 * Clickable breadcrumb trail for the currently active folder, e.g.
 *
 *   Home  >  src  >  components  >  dashboard
 *
 * Clicking any segment navigates straight to that folder via `onNavigate`.
 * Passing `null` means "repository root".
 */
export function FileBreadcrumbs({
  path,
  onNavigate,
  className,
}: {
  path: string | null;
  onNavigate: (path: string | null) => void;
  className?: string;
}) {
  const segments = (path ?? "").split("/").filter(Boolean);

  return (
    <Breadcrumb className={cn("min-w-0", className)}>
      <BreadcrumbList
        className="flex-nowrap gap-1 overflow-x-auto text-[11px] leading-tight sm:gap-1.5 sm:text-xs [&::-webkit-scrollbar]:hidden"
      >
        <BreadcrumbItem>
          {segments.length === 0 ? (
            <BreadcrumbPage className="flex shrink-0 items-center gap-1 font-mono text-foreground">
              <Home className="size-3 shrink-0 text-primary" />
              Home
            </BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild className="shrink-0 cursor-pointer">
              <button
                type="button"
                onClick={() => onNavigate(null)}
                title="Repository root"
                className="flex items-center gap-1 font-mono"
              >
                <Home className="size-3 shrink-0 text-primary" />
                Home
              </button>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>

        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          const target = segments.slice(0, index + 1).join("/");
          return (
            <Fragment key={target}>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                {isLast ? (
                  <BreadcrumbPage
                    className="max-w-[9rem] shrink-0 truncate font-mono text-foreground sm:max-w-[14rem]"
                    title={target}
                  >
                    {segment}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild className="max-w-[7rem] shrink-0 cursor-pointer truncate sm:max-w-[10rem]">
                    <button
                      type="button"
                      onClick={() => onNavigate(target)}
                      title={target}
                      className="truncate font-mono"
                    >
                      {segment}
                    </button>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
