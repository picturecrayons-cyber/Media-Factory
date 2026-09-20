import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import type { Title } from "@/lib/catalog";
import { formatRuntime } from "@/lib/catalog";
import { cn } from "@/lib/cn";

export function PosterCard({
  title,
  locked,
  compact,
}: {
  title: Title;
  locked?: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      to="/title/$slug"
      params={{ slug: title.slug }}
      className={cn(
        "group relative block shrink-0 overflow-hidden rounded-md bg-elevated",
        compact ? "w-28 sm:w-32" : "w-32 sm:w-40",
      )}
    >
      <div className={cn("relative aspect-[2/3] overflow-hidden", "poster-hover")}>
        <img
          src={title.posterPath}
          alt={title.title}
          className="h-full w-full object-cover"
          crossOrigin="anonymous"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-transparent opacity-80" />
        <div className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="grid size-11 place-items-center rounded-full bg-fg text-bg">
            <Play className="size-4 fill-current" />
          </span>
        </div>
        {title.isOriginal ? (
          <span className="absolute top-2 left-2 rounded-sm bg-bg/80 px-1.5 py-0.5 text-[10px] tracking-[0.14em] text-loop uppercase">
            Original
          </span>
        ) : null}
        {locked ? (
          <span className="absolute top-2 right-2 rounded-sm bg-bg/80 px-1.5 py-0.5 text-[10px] tracking-wide text-muted uppercase">
            Coming
          </span>
        ) : null}
      </div>
      <div className="space-y-0.5 px-1 pt-2 pb-1">
        <p className="line-clamp-2 text-[13px] leading-snug font-medium">{title.title}</p>
        <p className="text-[11px] text-muted">
          {title.year} · {formatRuntime(title.durationMinutes)} · {title.maturityRating}
        </p>
      </div>
    </Link>
  );
}
