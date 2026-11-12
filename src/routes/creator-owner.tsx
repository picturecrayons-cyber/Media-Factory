import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusChip } from "@/components/bridge/status-rail";
import { listCreatorOwnerTitles } from "@/lib/bridge/titles";

export const Route = createFileRoute("/creator-owner")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: CreatorOwnerDashboard,
});

function CreatorOwnerDashboard() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Creator owner workspace">
          <OwnerTitles actor={actor} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function OwnerTitles({ actor }: { actor: { userId: string } }) {
  const titlesQ = useQuery({
    queryKey: ["bridge-creator-owner-titles", actor.userId],
    queryFn: () => listCreatorOwnerTitles(),
    retry: 1,
  });
  const titles = titlesQ.data?.titles ?? [];

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-1 pb-16">
      <header className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Crayons Bridge · Creator Owner
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
          My owned titles
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
          This is a read-only owner view. It lists only title records whose recorded
          owner_user_id matches your authenticated Bridge identity. It does not grant
          rights approval, legal approval, licensing, payment or publication authority.
        </p>
      </header>

      {titlesQ.isPending ? (
        <p className="text-sm text-muted">Loading your owned title records…</p>
      ) : titlesQ.isError ? (
        <section role="alert" className="rounded-xl border border-line bg-surface p-5">
          <p className="text-sm">Your owner-scoped title records could not be loaded.</p>
          <button
            type="button"
            onClick={() => void titlesQ.refetch()}
            className="mt-3 text-sm font-semibold text-accent underline"
          >
            Retry
          </button>
        </section>
      ) : titles.length ? (
        <section className="space-y-3" aria-label="Titles owned by this account">
          <p className="text-sm text-muted">
            {titles.length} record{titles.length === 1 ? "" : "s"} returned · owner scope only
          </p>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {titles.map((title) => {
              const producer = title.credits.find((credit) => credit.role.toLowerCase() === "producer");
              return (
                <li key={title.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="font-semibold">{title.name}</h2>
                    <p className="mt-1 text-xs text-muted">
                      {title.language}{title.year ? ` · ${title.year}` : ""}{title.runtimeMinutes ? ` · ${title.runtimeMinutes} min` : ""}
                    </p>
                    {producer ? (
                      <p className="mt-1 text-xs text-muted">Producer credit on title: {producer.name}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted">
                      Producer credit is metadata; legal ownership and authority require separate verified documents.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-3">
                    <StatusChip status={title.status} />
                    <Link
                      to="/title/$id"
                      params={{ id: title.id }}
                      className="text-sm font-semibold text-accent hover:underline"
                    >
                      Open title workspace →
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-line p-6">
          <h2 className="font-semibold">No titles are recorded under this owner account</h2>
          <p className="mt-2 text-sm text-muted">
            This page does not search by display name or email and will not automatically adopt
            titles belonging to another account. Resolve ownership through the documented review process.
          </p>
        </section>
      )}
    </main>
  );
}
