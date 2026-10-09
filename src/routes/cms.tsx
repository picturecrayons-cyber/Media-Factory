import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { CreateTitleForm } from "@/components/bridge/title-desk";
import { AdminOnlyTitleSlate } from "@/components/bridge/admin-only-title-slate";
import { DistributionAvailsReport } from "@/components/bridge/distribution-avails-report";
import { listTitles } from "@/lib/bridge/titles";
import { listLoopPublicationReadiness } from "@/lib/bridge/loop-publication";
import { hasPermission } from "@/lib/bridge/rbac";

export const Route = createFileRoute("/cms")({ component: OperationalCms });

const tabs = ["ingest", "licensing", "publishing", "avails"] as const;
type Tab = (typeof tabs)[number];

function OperationalCms() {
  return <RequireBridge allow="super_admin">{(actor) => <CmsBody actor={actor} />}</RequireBridge>;
}

function CmsBody({ actor }: { actor: any }) {
  const search = Route.useSearch() as { tab?: Tab };
  const tab: Tab = tabs.includes(search.tab as Tab) ? (search.tab as Tab) : "ingest";
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const pubQ = useQuery({
    queryKey: ["loop-publication-readiness"],
    queryFn: () => listLoopPublicationReadiness(),
  });
  const titles = titlesQ.data?.titles ?? [];
  const publications = pubQ.data?.titles ?? [];
  if (titlesQ.isPending || pubQ.isPending)
    return (
      <BridgeShell actor={actor} title="Bridge CMS">
        <p>Loading CMS…</p>
      </BridgeShell>
    );
  if (titlesQ.isError || pubQ.isError)
    return (
      <BridgeShell actor={actor} title="Bridge CMS">
        <p role="alert">
          CMS data could not be loaded. Refresh to retry; no empty catalog is inferred.
        </p>
      </BridgeShell>
    );

  return (
    <BridgeShell actor={actor} title="Bridge CMS">
      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Operational control plane
        </p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-display text-3xl font-semibold sm:text-4xl">
              Ingest, license and publish from Bridge.
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
              Uses existing Bridge title, asset, rights and Loop publication services. This surface
              does not bypass QC, rights, legal, payment or authorization gates.
            </p>
          </div>
          <Link to="/workspace">
            <Button variant="outline">Open title library</Button>
          </Link>
        </div>
      </section>

      <nav className="mt-5 flex gap-2 overflow-x-auto" aria-label="Bridge CMS sections">
        {tabs.map((item) => (
          <Link
            key={item}
            to="/cms"
            search={{ tab: item }}
            className={`rounded-full px-4 py-2 text-xs font-semibold ${tab === item ? "bg-fg text-bg" : "border border-line text-muted hover:text-fg"}`}
          >
            {item.toUpperCase()}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        <AdminOnlyTitleSlate />
      </div>

      <div className="mt-6">
        {tab === "ingest" ? <IngestDesk actor={actor} /> : null}
        {tab === "licensing" ? <LicensingDesk titles={titles} /> : null}
        {tab === "publishing" ? <PublishingDesk publications={publications} /> : null}
        {tab === "avails" ? <DistributionAvailsReport /> : null}
      </div>
    </BridgeShell>
  );
}

function IngestDesk({ actor }: { actor: any }) {
  const canCreate =
    hasPermission(actor, "title.create") || hasPermission(actor, "title.ingest_internal");
  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_.8fr]">
      <div className="rounded-3xl border border-line bg-surface p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Direct ingest
        </p>
        <h3 className="mt-1 font-display text-2xl font-semibold">Open a canonical Bridge title</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Create the title record first, then upload master video, artwork, subtitles, audio and
          supporting documents from its Title Workspace.
        </p>
        <div className="mt-5">
          {canCreate ? (
            <CreateTitleForm concise />
          ) : (
            <p className="text-sm text-muted">Your current role cannot create titles.</p>
          )}
        </div>
      </div>
      <div className="rounded-3xl border border-line bg-surface p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Ingest sequence
        </p>
        <ol className="mt-4 space-y-3 text-sm text-muted">
          <li>
            <strong className="text-fg">1. Create title</strong> — canonical Bridge ID and ownership
            record.
          </li>
          <li>
            <strong className="text-fg">2. Add assets</strong> — master, artwork, subtitles, audio
            and documents.
          </li>
          <li>
            <strong className="text-fg">3. Prepare</strong> — technical QC and required review
            gates.
          </li>
          <li>
            <strong className="text-fg">4. Rights</strong> — territory, language, media and window
            clearance.
          </li>
        </ol>
        <Link
          to="/workspace"
          className="mt-5 inline-block text-sm font-semibold text-accent hover:underline"
        >
          Browse ingested titles →
        </Link>
      </div>
    </section>
  );
}

function LicensingDesk({ titles }: { titles: Array<any> }) {
  const rows = titles.filter((title) =>
    ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(
      title.status,
    ),
  );
  return (
    <section className="rounded-3xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Licensing desk
          </p>
          <h3 className="mt-1 font-display text-2xl font-semibold">Market-ready titles</h3>
          <p className="mt-2 text-sm text-muted">
            This desk consolidates licensing readiness without inventing commercial terms or
            bypassing rights checks.
          </p>
        </div>
        <Link to="/buyer">
          <Button variant="outline">Open buyer view</Button>
        </Link>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-3">Title</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Language</th>
              <th className="px-3 py-3">Fee</th>
              <th className="px-3 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((title) => (
              <tr key={title.id}>
                <td className="px-3 py-3 font-medium">{title.name}</td>
                <td className="px-3 py-3">{String(title.status).replaceAll("_", " ")}</td>
                <td className="px-3 py-3">{title.language}</td>
                <td className="px-3 py-3">
                  {title.licensingFeePaise > 0
                    ? `₹${Math.round(title.licensingFeePaise / 100)}`
                    : "Unset"}
                </td>
                <td className="px-3 py-3">
                  <Link
                    to="/title/$id"
                    params={{ id: title.id }}
                    className="font-semibold text-accent hover:underline"
                  >
                    Open title
                  </Link>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted">
                  No titles have cleared licensing readiness yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PublishingDesk({ publications }: { publications: Array<any> }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Publishing desk
          </p>
          <h3 className="mt-1 font-display text-2xl font-semibold">
            Crayons Loop authorization queue
          </h3>
          <p className="mt-2 text-sm text-muted">
            Publication remains gated by active rights coverage, title status and required
            master/artwork readiness.
          </p>
        </div>
        <Link to="/internal">
          <Button>Open distribution controls</Button>
        </Link>
      </div>
      <div className="mt-5 space-y-3">
        {publications.map((item) => (
          <article key={item.id} className="rounded-2xl border border-line bg-elevated p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="font-semibold">{item.name}</h4>
                <p className="mt-1 text-xs text-muted">
                  {item.language} · {String(item.bridgeStatus).replaceAll("_", " ")}
                </p>
              </div>
              <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">
                {item.publication?.published ? "LIVE" : item.ready ? "READY" : "BLOCKED"}
              </span>
            </div>
            {!item.ready && item.blockers?.length ? (
              <ul className="mt-3 space-y-1 text-xs text-muted">
                {item.blockers.map((b: string) => (
                  <li key={b}>• {b}</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3">
              <Link to="/internal" className="text-sm font-semibold text-accent hover:underline">
                {item.publication?.published
                  ? "Manage publication"
                  : item.ready
                    ? "Authorize publication"
                    : "Review blockers"}{" "}
                →
              </Link>
            </div>
          </article>
        ))}
        {!publications.length ? (
          <p className="py-8 text-center text-sm text-muted">
            No publication candidates available.
          </p>
        ) : null}
      </div>
    </section>
  );
}
