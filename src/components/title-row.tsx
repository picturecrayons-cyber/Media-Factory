import type { Title } from "@/lib/catalog";
import { PosterCard } from "@/components/poster-card";

export function TitleRow({
  label,
  titles,
  locked,
}: {
  label: string;
  titles: Title[];
  locked?: boolean;
}) {
  if (!titles.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="px-1 font-display text-lg tracking-[0.08em] text-fg/90 uppercase sm:text-xl">
        {label}
      </h2>
      <div className="hide-scroll -mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
        {titles.map((t) => (
          <PosterCard key={t.id} title={t} locked={locked && !t.published} />
        ))}
      </div>
    </section>
  );
}
