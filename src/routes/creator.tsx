import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusChip } from "@/components/bridge/status-rail";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { listTitles } from "@/lib/bridge/titles";

export const Route = createFileRoute("/creator")({ component: Creator });

function Creator() {
  return (
    <RequireBridge allow="creator">
      {(actor) => (
        <BridgeShell actor={actor} title="Creator Desk">
          <CreatorDashboard actor={actor} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function CreatorDashboard({
  actor,
}: {
  actor: { userId: string; organizationId?: string | null; displayName?: string };
}) {
  const titlesQ = useQuery({
    queryKey: ["bridge-titles", actor.userId, actor.organizationId],
    queryFn: () => listTitles(),
    retry: 1,
  });
  const titles = titlesQ.data?.titles ?? [];
  const recent = [...titles]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-14">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Your individual filmmaker workspace</p>
        <h2 className="mt-2 max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Welcome to your Creator Desk.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          Add a film or story idea, prepare your details and files, then follow the review updates here.
          Our team will guide you through each step.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="#add-film" className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-bg hover:opacity-90">
            + Submit a finished film
          </a>
          <a href="#my-films" className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-5 text-sm font-semibold hover:border-accent">
            View my films
          </a>
        </div>
        <div className="mt-7 grid gap-3 border-t border-line pt-5 sm:grid-cols-3">
          <Step number="1" title="Add your film" detail="Enter a few basic details." />
          <Step number="2" title="Prepare your files" detail="Upload the requested film and artwork." />
          <Step number="3" title="We review it" detail="Follow feedback and next steps here." />
        </div>
      </section>

      <section id="my-films" className="scroll-mt-5 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold">My Films</h2>
            <p className="mt-1 text-sm text-muted">Only films belonging to your Creator account appear here.</p>
          </div>
          <a href="#add-film" className="text-sm font-semibold text-accent hover:underline">Add a film →</a>
        </div>
        {titlesQ.isPending ? (
          <p className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">Loading your films…</p>
        ) : titlesQ.isError ? (
          <div role="alert" className="rounded-xl border border-line bg-surface p-5 text-sm">
            <p>We could not load your films just now.</p>
            <button type="button" onClick={() => void titlesQ.refetch()} className="mt-2 font-semibold text-accent underline">Try again</button>
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
            <TitleList view="gallery" empty="You have not added a film yet. Use “Submit a finished film” to get started." />
          </div>
        )}
      </section>

      <section id="add-film" className="scroll-mt-5 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3 rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Start here</p>
          <h2 className="font-display text-2xl font-semibold">Submit a finished film</h2>
          <p className="text-sm leading-relaxed text-muted">
            Start with the film name and basic information. You can prepare the remaining details and assets in its title workspace.
          </p>
          <NewSubmissionPanel />
        </div>
        <div className="space-y-3 rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">A different kind of submission</p>
          <h2 className="font-display text-2xl font-semibold">Story & Concepts</h2>
          <p className="text-sm leading-relaxed text-muted">
            Have an idea or screenplay, but not a finished film? Submit it separately here.
          </p>
          <MyStoryConcepts />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Latest updates</h2>
          <p className="mt-1 text-sm text-muted">We will show review progress for your films here.</p>
        </div>
        {titlesQ.isPending ? <p className="text-sm text-muted">Loading updates…</p> : recent.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {recent.map((title) => (
              <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link to="/title/$id" params={{ id: title.id }} className="font-medium hover:text-accent">{title.name}</Link>
                  <p className="text-xs text-muted">Updated {formatDate(title.updatedAt)}</p>
                </div>
                <StatusChip status={title.status} />
              </li>
            ))}
          </ul>
        ) : !titlesQ.isError ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No updates yet. Once you submit a film, its progress will appear here.</p>
        ) : null}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-xs text-muted">
        <p>Need help? Contact the Crayons Bridge team. Your films and documents are visible only through your authorized account access.</p>
        <Link to="/contact" className="font-semibold text-accent hover:underline">Get help →</Link>
      </footer>
    </div>
  );
}

function Step({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <div className="flex gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-bold text-accent">{number}</span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{detail}</p>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "date unavailable"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
