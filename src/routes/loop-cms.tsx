import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { listLoopPublicationReadiness } from "@/lib/bridge/loop-publication";

export const Route = createFileRoute("/loop-cms")({ component: LoopCms });

const modules = [
  { title: "Catalog", detail: "Bridge titles and Loop publication state", href: "/internal" },
  { title: "Metadata & Artwork", detail: "Canonical title metadata, posters and presentation assets", href: "/workspace" },
  { title: "Homepage Rails", detail: "Loop merchandising and featured-title operations", href: "/internal" },
  { title: "Visibility & Windows", detail: "Territory, language, model and availability windows", href: "/internal" },
  { title: "Publish to Loop", detail: "Authorize only QC- and rights-ready titles", href: "/internal" },
  { title: "Distribution Status", detail: "Live, suspended, expired and failed publications", href: "/internal" },
] as const;

function LoopCms() {
  return (
    <RequireBridge allow="internal">
      {(actor) => (
        <BridgeShell actor={actor} title="Crayons Loop CMS">
          <LoopCmsBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function LoopCmsBody() {
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const pubsQ = useQuery({ queryKey: ["loop-publication-readiness"], queryFn: () => listLoopPublicationReadiness() });
  const titles = titlesQ.data?.titles ?? [];
  const publications = pubsQ.data?.titles ?? [];
  const ready = publications.filter((item) => item.ready).length;
  const live = publications.filter((item) => item.publication?.authorizationStatus === "LIVE").length;

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Loop control plane</p>
        <h2 className="mt-3 font-display text-3xl font-semibold">One CMS. Bridge controlled.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
          Crayons Bridge is the canonical operator CMS, Admin and Control Panel for Crayons Loop. Masters are ingested and governed here; Loop receives only authorized publication state.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Metric label="Bridge titles" value={titles.length} />
          <Metric label="Ready to publish" value={ready} />
          <Metric label="Live on Loop" value={live} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <Link key={module.title} to={module.href} className="rounded-2xl border border-line bg-surface p-5 transition hover:bg-elevated/60">
            <h3 className="font-display text-xl font-semibold">{module.title}</h3>
            <p className="mt-2 text-sm text-muted">{module.detail}</p>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-accent">Open control →</p>
          </Link>
        ))}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-2xl font-semibold">Publication Queue</h2>
          <p className="text-sm text-muted">Current Bridge-to-Loop readiness from the canonical publication service.</p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          {publications.length ? publications.slice(0, 12).map((item) => {
            const status = item.publication?.authorizationStatus ?? (item.ready ? "READY" : "ACTION_REQUIRED");
            return (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 last:border-b-0">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="mt-1 text-xs text-muted">{item.ready ? "Eligible for operator review" : "Requires Bridge readiness work"}</p>
                </div>
                <span className="inline-flex items-center rounded-sm border border-line-strong px-2 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
                  {status.replaceAll("_", " ")}
                </span>
              </div>
            );
          }) : <p className="px-5 py-8 text-sm text-muted">No publication records available.</p>}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-line bg-elevated p-4"><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted">{label}</p></div>;
}
