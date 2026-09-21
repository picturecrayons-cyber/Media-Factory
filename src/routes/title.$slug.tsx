import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Play, Plus } from "lucide-react";
import { toast } from "sonner";
import { CinemaShell } from "@/components/cinema-shell";
import { TitleRow } from "@/components/title-row";
import { Button } from "@/components/ui/button";
import {
  getEntitlements,
  getTitleBySlug,
  getWatchlist,
  grantTvod,
  listTitles,
  toggleWatchlist,
} from "@/lib/cinema";
import { CATALOG, formatRuntime } from "@/lib/catalog";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/title/$slug")({ component: TitlePage });

function TitlePage() {
  const { slug } = Route.useParams();
  const titleQ = useQuery({
    queryKey: ["title", slug],
    queryFn: () => getTitleBySlug({ data: { slug } }),
  });
  const allQ = useQuery({ queryKey: ["titles"], queryFn: () => listTitles() });
  const { user, isPending } = useCurrentUserState();
  const listQ = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => getWatchlist(),
    enabled: !!user,
  });
  const entQ = useQuery({
    queryKey: ["entitlements"],
    queryFn: () => getEntitlements(),
    enabled: !!user,
  });
  const title = titleQ.data ?? CATALOG.find((t) => t.slug === slug) ?? null;
  const titles = allQ.data?.length ? allQ.data : CATALOG;
  const qc = useQueryClient();
  const inList = !!(title && listQ.data?.includes(title.id));
  const hasPass = !!entQ.data?.subscription;
  const tvod = entQ.data?.tvod.find((e) => e.title_id === title?.id);
  const unlocked =
    hasPass || title?.accessTier === "FREE" || !!tvod || title?.published === false;

  const listMut = useMutation({
    mutationFn: () => toggleWatchlist({ data: { titleId: title!.id } }),
    onSuccess: (r) => {
      toast(r.inList ? "Added to My List" : "Removed from My List");
      void qc.invalidateQueries({ queryKey: ["watchlist"] });
    },
    onError: () => toast("Sign in to save titles"),
  });
  const tvodMut = useMutation({
    mutationFn: (accessType: "RENTAL" | "PURCHASE") =>
      grantTvod({ data: { titleId: title!.id, accessType } }),
    onSuccess: (r) => {
      toast(r.accessType === "RENTAL" ? "48-hour rental unlocked" : "Lifetime license unlocked");
      void qc.invalidateQueries({ queryKey: ["entitlements"] });
    },
    onError: () => toast("Sign in to checkout"),
  });

  if (!title) {
    return (
      <CinemaShell titles={titles}>
        <main className="px-6 pt-28 text-center text-muted">Title not found.</main>
      </CinemaShell>
    );
  }

  return (
    <CinemaShell titles={titles}>
      <div className="relative min-h-[52vh] overflow-hidden">
        <img
          src={title.backdropPath}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-50"
          crossOrigin="anonymous"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/70 to-bg/30" />
      </div>
      <main className="relative z-10 mx-auto -mt-40 max-w-6xl px-4 pb-16 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row">
          <img
            src={title.posterPath}
            alt={title.title}
            className="w-44 rounded-lg object-cover shadow-[var(--shadow-lift)] sm:w-56"
            crossOrigin="anonymous"
          />
          <div className="flex-1 space-y-4">
            {title.isOriginal ? (
              <p className="text-[11px] tracking-[0.22em] text-loop uppercase">Crayons Original</p>
            ) : null}
            <h1 className="font-display text-4xl tracking-[0.04em] sm:text-5xl">{title.title}</h1>
            <p className="text-sm text-muted">
              {title.language} · {title.year} · {formatRuntime(title.durationMinutes)} ·{" "}
              {title.maturityRating}
              {title.director ? ` · Dir. ${title.director}` : ""}
            </p>
            {title.cast ? <p className="text-sm text-fg/80">{title.cast}</p> : null}
            <p className="max-w-xl text-sm leading-relaxed text-fg/85">{title.description}</p>
            <div className="flex flex-wrap gap-2">
              <Link to="/watch/$slug" params={{ slug: title.slug }}>
                <Button className="h-12 px-6">
                  <Play className="size-4 fill-current" />
                  {unlocked ? "Play now" : "Studio preview"}
                </Button>
              </Link>
              {!unlocked && title.isTvodEnabled ? (
                <>
                  <Button variant="ghost" className="h-12" onClick={() => tvodMut.mutate("RENTAL")}>
                    Rent 48h (₹{title.tvodRentalPrice})
                  </Button>
                  <Button variant="ghost" className="h-12" onClick={() => tvodMut.mutate("PURCHASE")}>
                    Buy lifetime (₹{title.tvodPurchasePrice})
                  </Button>
                  <Link to="/plans">
                    <Button variant="outline" className="h-12">
                      Get unlimited pass (₹149/mo)
                    </Button>
                  </Link>
                </>
              ) : null}
              {user ? (
                <Button variant="outline" className="h-12" onClick={() => listMut.mutate()}>
                  {inList ? <Check className="size-4" /> : <Plus className="size-4" />}
                  {inList ? "In My List" : "My List"}
                </Button>
              ) : null}
            </div>
            {!user && !isPending ? (
              <p className="text-xs text-muted">
                <Link to="/login" className="underline">
                  Sign in
                </Link>{" "}
                to rent, buy, or save.
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-14">
          <TitleRow label="More on Loop" titles={titles.filter((t) => t.id !== title.id)} />
        </div>
      </main>
    </CinemaShell>
  );
}
