import { Link } from "@tanstack/react-router";
import { Info, Play, Plus } from "lucide-react";
import type { Title } from "@/lib/catalog";
import { formatRuntime } from "@/lib/catalog";
import { Button } from "@/components/ui/button";

export function HeroBillboard({
  title,
  onList,
}: {
  title: Title;
  onList?: () => void;
}) {
  return (
    <section className="relative h-[100svh] max-h-[920px] min-h-[560px] w-full overflow-hidden">
      <img
        src={title.backdropPath || title.posterPath}
        alt=""
        className="kenburns absolute inset-0 h-full w-full object-cover"
        crossOrigin="anonymous"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/75 to-bg/20" />
      <div className="cinema-fade absolute inset-x-0 bottom-0 h-56" />
      <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-end gap-4 px-4 pt-24 pb-16 sm:px-6">
        {title.isOriginal ? (
          <p className="text-[11px] tracking-[0.28em] text-loop uppercase">
            Crayons Original
          </p>
        ) : null}
        <h1 className="font-display max-w-3xl text-4xl leading-[1.05] font-semibold tracking-[0.04em] sm:text-6xl">
          {title.title}
        </h1>
        <p className="max-w-xl text-sm text-fg/80 sm:text-base">{title.synopsis}</p>
        <p className="text-xs tracking-wide text-muted uppercase">
          {title.language} · {title.year} · {formatRuntime(title.durationMinutes)} ·{" "}
          {title.maturityRating} · {title.accessTier}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link to="/watch/$slug" params={{ slug: title.slug }}>
            <Button className="h-12 min-w-32 px-6">
              <Play className="size-4 fill-current" />
              Play
            </Button>
          </Link>
          <Link to="/title/$slug" params={{ slug: title.slug }}>
            <Button variant="ghost" className="h-12">
              <Info className="size-4" />
              More info
            </Button>
          </Link>
          {onList ? (
            <Button variant="outline" className="h-12" onClick={onList}>
              <Plus className="size-4" />
              My List
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
