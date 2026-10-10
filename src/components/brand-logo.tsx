import darkLogo from "@/assets/glit-logo-dark.png.asset.json";
import lightLogo from "@/assets/glit-logo-light.png.asset.json";
import { cn } from "@/lib/utils";

export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-7 w-[71px] shrink-0 items-center", className)}>
      <img src={darkLogo.url} alt="glit" width={528} height={208} className="hidden h-full w-full object-contain dark:block" />
      <img src={lightLogo.url} alt="glit" width={528} height={208} className="h-full w-full object-contain dark:hidden" />
    </span>
  );
}