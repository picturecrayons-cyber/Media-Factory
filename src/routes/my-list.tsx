import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CinemaShell } from "@/components/cinema-shell";
import { PosterCard } from "@/components/poster-card";
import { getWatchlist, listTitles } from "@/lib/cinema";
import { CATALOG } from "@/lib/catalog";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/my-list")({ component: MyList });

function MyList() {
  const { user, isPending } = useCurrentUserState();
  const titlesQ = useQuery({ queryKey: ["titles"], queryFn: () => listTitles() });
  const listQ = useQuery({ queryKey: ["watchlist"], queryFn: () => getWatchlist(), enabled: !!user });
  const titles = titlesQ.data?.length ? titlesQ.data : CATALOG;
  const mine = titles.filter((t) => listQ.data?.includes(t.id));

  if (isPending) {
    return (
      <CinemaShell titles={titles}>
        <main className="px-6 pt-28 text-muted">Loading list…</main>
      </CinemaShell>
    );
  }
  if (!user) return <RedirectToSignIn />;

  return (
    <CinemaShell titles={titles}>
      <main className="mx-auto max-w-6xl px-4 pt-24 pb-16 sm:px-6">
        <h1 className="font-display text-3xl tracking-[0.08em] uppercase">My List</h1>
        {mine.length ? (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5">
            {mine.map((t) => (
              <PosterCard key={t.id} title={t} />
            ))}
          </div>
        ) : (
          <p className="mt-10 max-w-md text-sm text-muted">
            Nothing saved yet. Open a title and add it to your personal cinema shelf.
          </p>
        )}
      </main>
    </CinemaShell>
  );
}
