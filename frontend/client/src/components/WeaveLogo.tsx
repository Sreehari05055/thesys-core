import { SITE_NAME, WEAVE_MARK_PATH } from "@/lib/siteMeta";
import { cn } from "@/lib/utils";

/** Weave mark from the single canonical SVG asset. */
function WeaveLogoMark({ className }: { className?: string }) {
  return (
    <img
      src={WEAVE_MARK_PATH}
      alt=""
      aria-hidden
      draggable={false}
      className={className}
    />
  );
}

type WeaveLogoIconProps = {
  className?: string;
  size?: "sm" | "md";
};

/** Sized weave mark — no container box. */
export function WeaveLogoIcon({ className, size = "sm" }: WeaveLogoIconProps) {
  return (
    <WeaveLogoMark
      className={cn("shrink-0", size === "sm" ? "h-7 w-7" : "h-8 w-8", className)}
    />
  );
}

type SiteLogoProps = {
  className?: string;
  size?: "sm" | "md";
  showName?: boolean;
};

/** Nav / auth lockup: weave icon + product name. */
export function SiteLogo({ className, size = "sm", showName = true }: SiteLogoProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <WeaveLogoIcon size={size} />
      {showName && (
        <span
          className={cn(
            "truncate font-semibold tracking-tight text-foreground",
            size === "sm" ? "text-[13px] text-foreground/90" : "text-[15px]",
          )}
        >
          {SITE_NAME}
        </span>
      )}
    </div>
  );
}
