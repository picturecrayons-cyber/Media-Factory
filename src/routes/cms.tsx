import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { CreateTitleForm } from "@/components/bridge/title-desk";
import { listTitles } from "@/lib/bridge/titles";
import { founderAuthorizeLoopPublication, listLoopPublicationReadiness } from "@/lib/bridge/loop-publication";
import { hasPermission } from "@/lib/bridge/rbac";

export const Route = createFileRoute("/cms")({ component: OperationalCms });

const tabs = ["ingest", "licensing", "publishing"] as const;
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
              includes the normal publication route and a separately audited Founder override for the three owner-authorized titles.
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
        {tab === "ingest" ? <IngestDesk actor={actor} /> : null}
        {tab === "licensing" ? <LicensingDesk titles={titles} /> : null}
        {tab === "publishing" ? <PublishingDesk publications={publications} /> : null}
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

const FOUNDER_PUBLISH_TITLE_IDS = new Set([
  "858f0ec5a11bc9acd2e9c20266541a3a",
  "cb8c141dc72d727a53a4f35d8851e100",
  "f15e0a5385aaf8365f6ad730de747da0",
]);

function PublishingDesk({ publications }: { publications: Array<any> }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [territory, setTerritory] = useState("WORLDWIDE");
  const [language, setLanguage] = useState("Malayalam");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [reason, setReason] = useState("");
  const [attested, setAttested] = useState(false);

  const publish = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Select a title first.");
      if (!windowStart || !windowEnd) throw new Error("Set the publication start and end dates.");
      if (!attested) throw new Error("Confirm your rights-holder authorization.");
      return founderAuthorizeLoopPublication({ data: {
        bridgeTitleId: selected.id,
        territories: territory.split(",").map((v) => v.trim()).filter(Boolean),
        languages: language.split(",").map((v) => v.trim()).filter(Boolean),
        exploitationModels: ["TVOD"], accessTier: "TVOD",
        windowStart: new Date(windowStart).toISOString(),
        windowEnd: new Date(windowEnd).toISOString(),
        reason, rightsOwnerAttestation: true,
      }});
    },
    onSuccess: () => {
      toast.success("Founder authorization submitted to Crayons LOOP.");
      setSelected(null); setReason(""); setAttested(false);
      void qc.invalidateQueries({ queryKey: ["loop-publication-readiness"] });
      void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Founder publication failed"),
  });

  return (
    <section className="rounded-3xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Publishing desk</p>
          <h3 className="mt-1 font-display text-2xl font-semibold">Crayons Loop authorization queue</h3>
          <p className="mt-2 text-sm text-muted">Normal publication uses the existing review gates. Founder override is separately recorded and limited to the three specifically authorized titles.</p>
        </div>
        <Link to="/internal"><Button>Open distribution controls</Button></Link>
      </div>
      <div className="mt-5 space-y-3">
        {publications.map((item) => (
          <article key={item.id} className="rounded-2xl border border-line bg-elevated p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="font-semibold">{item.name}</h4>
                <p className="mt-1 text-xs text-muted">{item.language} · {String(item.bridgeStatus).replaceAll("_", " ")}</p>
              </div>
              <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">{item.publication?.published ? "LIVE" : item.ready ? "READY" : "BLOCKED"}</span>
            </div>
            {!item.ready && item.blockers?.length ? (
              <ul className="mt-3 space-y-1 text-xs text-muted">{item.blockers.map((b: string) => <li key={b}>• {b}</li>)}</ul>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Link to="/title/$id" params={{ id: item.id }} className="text-sm font-semibold text-accent hover:underline">Open title →</Link>
              {FOUNDER_PUBLISH_TITLE_IDS.has(item.id) && !item.publication?.published ? (
                <Button type="button" variant="outline" className="border-amber-500/40" onClick={() => { setSelected(item); setLanguage(item.language || "Malayalam"); setTerritory("WORLDWIDE"); }}>
                  Founder Publish in LOOP
                </Button>
              ) : null}
            </div>
          </article>
        ))}
        {!publications.length ? <p className="py-8 text-center text-sm text-muted">No publication candidates available.</p> : null}
      </div>
      {selected ? (
        <div className="mt-5 space-y-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-semibold">Founder authorization — {selected.name}</h4>
            <button type="button" onClick={() => setSelected(null)} className="text-xs text-muted">Cancel</button>
          </div>
          <p className="text-xs text-muted">This action does not create Legal Reviewer or QC Reviewer approvals. The founder exception is stored in the audit trail.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-muted">Territories<input value={territory} onChange={(e) => setTerritory(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-fg" /></label>
            <label className="text-xs text-muted">Languages<input value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-fg" /></label>
            <label className="text-xs text-muted">Publication start<input type="datetime-local" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-fg" /></label>
            <label className="text-xs text-muted">Publication end<input type="datetime-local" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-fg" /></label>
          </div>
          <label className="block text-xs text-muted">Founder authorization reason (minimum 12 characters)<textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} className="mt-1 w-full rounded-xl border border-line bg-surface p-3 text-fg" placeholder="Reason for authorizing this title for Crayons LOOP" /></label>
          <label className="flex items-start gap-2 text-xs text-muted"><input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} />I confirm that I am authorized to distribute this title to Crayons LOOP.</label>
          <Button type="button" disabled={publish.isPending || reason.trim().length < 12 || !attested || !windowStart || !windowEnd} onClick={() => publish.mutate()}>{publish.isPending ? "Publishing…" : "Confirm Founder Publish to LOOP"}</Button>
        </div>
      ) : null}
    </section>
  );
}
