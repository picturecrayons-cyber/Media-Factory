import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CinemaShell } from "@/components/cinema-shell";
import { HeroBillboard } from "@/components/hero-billboard";
import { TitleRow } from "@/components/title-row";
import { getConfig, listTitles, toggleWatchlist } from "@/lib/cinema";
import { CATALOG } from "@/lib/catalog";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const titlesQ = useQuery({ queryKey: ["titles"], queryFn: () => listTitles() });
  const configQ = useQuery({ queryKey: ["config"], queryFn: () => getConfig() });
  const { user } = useCurrentUserState();
  const titles = titlesQ.data?.length ? titlesQ.data : CATALOG;
  const heroSlug = configQ.data?.config.heroSlug;
  const hero =
    titles.find((t) => t.slug === heroSlug && t.published) ??
    titles.find((t) => t.published && t.featured) ??
    titles.find((t) => t.published) ??
    titles[0];
  const live = titles.filter((t) => t.published);
  const originals = titles.filter((t) => t.isOriginal);
  const shorts = titles.filter((t) => t.contentType === "Short Film");
  const coming = titles.filter((t) => !t.published);
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: (titleId: string) => toggleWatchlist({ data: { titleId } }),
    onSuccess: () => {
      toast("Saved to My List");
      void qc.invalidateQueries({ queryKey: ["watchlist"] });
    },
    onError: () => toast("Sign in to save titles"),
  });

  return (
    <CinemaShell titles={titles}>
      {hero ? (
        <HeroBillboard title={hero} onList={user ? () => add.mutate(hero.id) : undefined} />
      ) : null}
      {configQ.data?.config.announcement ? (
        <p className="mx-auto max-w-6xl px-4 pt-6 text-xs tracking-[0.18em] text-loop uppercase sm:px-6">
          {configQ.data.config.announcement}
        </p>
      ) : null}
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6">
        <TitleRow label="Now on Loop" titles={live} />
        <TitleRow label="Crayons Originals" titles={originals} />
        <TitleRow label="Shorts & festival" titles={shorts} />
        <TitleRow label="Coming to Loop" titles={coming} locked />
      </div>
    </CinemaShell>
  );
}
