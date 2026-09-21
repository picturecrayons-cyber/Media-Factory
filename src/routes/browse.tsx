import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CinemaShell } from "@/components/cinema-shell";
import { PosterCard } from "@/components/poster-card";
import { listTitles } from "@/lib/cinema";
import { CATALOG } from "@/lib/catalog";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/browse")({ component: Browse });

const FILTERS = ["All", "Malayalam", "Telugu", "Short Film", "U", "Originals"] as const;

function Browse() {
  const titlesQ = useQuery({ queryKey: ["titles"], queryFn: () => listTitles() });
  const titles = titlesQ.data?.length ? titlesQ.data : CATALOG;
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const shown = useMemo(() => {
    return titles.filter((t) => {
      if (filter === "All") return true;
      if (filter === "Short Film") return t.contentType === "Short Film";
      if (filter === "U") return t.maturityRating === "U";
      if (filter === "Originals") return t.isOriginal;
      return t.language === filter;
    });
  }, [titles, filter]);

  return (
    <CinemaShell titles={titles}>
      <main className="mx-auto max-w-6xl px-4 pt-24 pb-16 sm:px-6">
        <p className="text-[11px] tracking-[0.22em] text-loop uppercase">Catalog</p>
        <h1 className="font-display mt-2 text-3xl tracking-[0.08em] uppercase">Browse</h1>
        <div className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "h-10 rounded-full border px-4 text-sm",
                filter === f ? "border-fg bg-fg text-bg" : "border-line text-muted hover:text-fg",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5">
          {shown.map((t) => (
            <PosterCard key={t.id} title={t} locked={!t.published} />
          ))}
        </div>
      </main>
    </CinemaShell>
  );
}
