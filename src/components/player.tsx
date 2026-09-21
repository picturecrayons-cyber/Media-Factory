import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Maximize, Pause, Play, Subtitles, Volume2 } from "lucide-react";
import type { Title } from "@/lib/catalog";
import { cn } from "@/lib/cn";

const LADDER = ["1080p", "720p", "480p"] as const;

export function CinemaPlayer({ title }: { title: Title }) {
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [quality, setQuality] = useState<(typeof LADDER)[number]>("1080p");
  const [subs, setSubs] = useState(true);
  const raf = useRef<number | null>(null);
  const last = useRef<number>(0);

  useEffect(() => {
    const tick = (t: number) => {
      if (!last.current) last.current = t;
      if (playing) {
        const dt = (t - last.current) / 1000;
        setProgress((p) => Math.min(100, p + (dt / (title.durationMinutes * 60)) * 100 * 12));
      }
      last.current = t;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, title.durationMinutes]);

  return (
    <div className="scanline relative min-h-screen overflow-hidden bg-bg">
      <img
        src={title.backdropPath || title.posterPath}
        alt=""
        className={cn("absolute inset-0 h-full w-full object-cover", playing && "kenburns")}
        crossOrigin="anonymous"
      />
      <div className="absolute inset-0 bg-bg/40" />
      <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 bg-gradient-to-b from-bg to-transparent p-4">
        <Link
          to="/title/$slug"
          params={{ slug: title.slug }}
          className="grid size-11 place-items-center rounded-md hover:bg-fg/10"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <p className="font-display text-sm tracking-[0.14em] uppercase">{title.title}</p>
          <p className="text-[11px] text-muted">
            Studio preview · {quality} master ladder · {subs ? "EN subtitles" : "subs off"}
          </p>
        </div>
      </div>
      <button
        type="button"
        className="absolute inset-0 z-[1]"
        aria-label={playing ? "Pause" : "Play"}
        onClick={() => setPlaying((p) => !p)}
      />
      {!playing ? (
        <div className="pointer-events-none absolute inset-0 z-[2] grid place-items-center">
          <span className="grid size-16 place-items-center rounded-full bg-fg text-bg">
            <Play className="size-6 fill-current" />
          </span>
        </div>
      ) : null}
      {subs ? (
        <p className="pointer-events-none absolute inset-x-0 bottom-28 z-10 text-center text-sm text-fg drop-shadow-[0_2px_8px_#000]">
          {title.synopsis}
        </p>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 z-10 space-y-3 bg-gradient-to-t from-bg via-bg/80 to-transparent px-4 pt-16 pb-6">
        <input
          type="range"
          min={0}
          max={100}
          value={progress}
          onChange={(e) => setProgress(Number(e.target.value))}
          className="w-full accent-accent"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="grid size-11 place-items-center rounded-md hover:bg-fg/10"
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4 fill-current" />}
          </button>
          <Volume2 className="size-4 text-muted" />
          <button
            type="button"
            className={cn("grid size-11 place-items-center rounded-md hover:bg-fg/10", subs && "text-loop")}
            onClick={() => setSubs((s) => !s)}
            aria-label="Subtitles"
          >
            <Subtitles className="size-4" />
          </button>
          <div className="ml-auto flex items-center gap-1 rounded-md border border-line p-1 text-xs">
            {LADDER.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuality(q)}
                className={cn(
                  "h-8 rounded-sm px-2",
                  quality === q ? "bg-fg text-bg" : "text-muted hover:text-fg",
                )}
              >
                {q}
              </button>
            ))}
          </div>
          <Maximize className="size-4 text-muted" />
        </div>
      </div>
    </div>
  );
}
