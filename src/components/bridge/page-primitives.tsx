import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Content rhythm for authenticated pages; the BridgeShell owns the page width and gutters. */
export function PageFrame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("w-full min-w-0 space-y-6 pb-16", className)}>{children}</div>;
}

/** Shared surface treatment for cards and grouped workspace content. */
export function PagePanel({
  children,
  className,
  as: Component = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "article" | "div";
}) {
  return (
    <Component className={cn("min-w-0 rounded-[14px] border border-line bg-surface p-4 sm:p-5", className)}>
      {children}
    </Component>
  );
}

/** Consistent section heading hierarchy and spacing across account workspaces. */
export function SectionHeader({
  title,
  eyebrow,
  description,
  actions,
  level = "h2",
  className,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  level?: "h2" | "h3";
  className?: string;
}) {
  const Heading = level;
  return (
    <div className={cn("flex min-w-0 flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">{eyebrow}</p> : null}
        <Heading className={cn("font-display font-semibold tracking-tight", level === "h2" ? "text-xl sm:text-2xl" : "text-lg")}>
          {title}
        </Heading>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
