import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";

export const Route = createFileRoute("/documents")({ component: Documents });

const TEMPLATES = [
  { id: "master-distribution", title: "Master Distribution Agreement", category: "Distribution", description: "Appointment and scope for distribution, licensing, syndication and monetisation of an agreed title or catalogue.", fields: "Rights granted · territories · languages · term · platforms · exclusivity · commercial terms" },
  { id: "content-owner-authorisation", title: "Content Owner Authorisation", category: "Authority", description: "Records the rights holder's authority for a named representative to submit and negotiate specified content.", fields: "Rights holder · representative · title/catalogue · authority scope · validity period" },
  { id: "representation-mandate", title: "Representation Mandate", category: "Authority", description: "Defines a sales or distribution representative's mandate and limits. Does not transfer ownership of the underlying rights.", fields: "Principal · representative · permitted actions · commission · territory · term" },
  { id: "bridge-loop-consent", title: "Bridge × Loop Streaming Consent", category: "Streaming", description: "Records explicit consent to consider publication on Crayons Loop, subject to the executed licence, rights clearance and Bridge approval.", fields: "Title/version · streaming rights · territory · window · monetisation · withdrawal terms" },
  { id: "licensing-syndication", title: "Licensing & Syndication Schedule", category: "Licensing", description: "Captures approved platform/channel, territory, term, rights, delivery and commercial schedules for a specific deal.", fields: "Licensee · rights package · territory · term · fees/revenue share · reporting · delivery" },
  { id: "short-series-vertical", title: "Shorts, Series & Vertical Drama Addendum", category: "Content scope", description: "A schedule for short films, episodic series, micro-dramas and vertical video catalogues.", fields: "Episode list · versions · language · rights package · windows · platform scope" },
];

function Documents() {
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <RequireBridge>
      {(actor) => (
        <BridgeShell actor={actor} title="Documents & agreements">
          <div className="space-y-6">
            <section className="rounded-sm border border-line bg-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-accent">Creator & studio workspace</p>
              <h2 className="mt-2 font-display text-2xl font-semibold">Start with the right document.</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Choose a reusable agreement framework for films, shorts, series, vertical drama and other video content. Each agreement must identify the actual parties, rights, territory, term and commercial terms before it is issued for signature.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="border border-line p-3"><p className="text-sm font-semibold">1. Prepare</p><p className="mt-1 text-xs text-muted">Complete parties, title and rights schedules.</p></div>
                <div className="border border-line p-3"><p className="text-sm font-semibold">2. Review & sign</p><p className="mt-1 text-xs text-muted">Confirm legal wording and signer authority before execution.</p></div>
                <div className="border border-line p-3"><p className="text-sm font-semibold">3. Record</p><p className="mt-1 text-xs text-muted">Keep the executed version and evidence with the title/deal record.</p></div>
              </div>
            </section>

            <div className="flex flex-wrap gap-2" aria-label="Filter document templates">
              {["All", ...Array.from(new Set(TEMPLATES.map((t) => t.category)))].map((category) => (
                <button key={category} type="button" onClick={() => setFilter(category)} aria-pressed={filter === category} className={filter === category ? "rounded-sm bg-accent px-3 py-2 text-sm font-semibold text-[#041018]" : "rounded-sm border border-line px-3 py-2 text-sm"}>{category}</button>
              ))}
            </div>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {TEMPLATES.filter((t) => filter === "All" || t.category === filter).map((template) => (
                <article key={template.id} className="flex flex-col rounded-sm border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-xs uppercase tracking-widest text-muted">{template.category}</p><h3 className="mt-2 text-base font-semibold">{template.title}</h3></div>
                    <span aria-hidden="true" className="text-accent">▤</span>
                  </div>
                  <p className="mt-3 flex-1 text-sm leading-6 text-muted">{template.description}</p>
                  <p className="mt-4 border-t border-line pt-3 text-xs leading-5"><span className="font-semibold">Key schedule fields</span><br />{template.fields}</p>
                  <button type="button" onClick={() => setSelected(template.id)} className="mt-4 w-full rounded-sm border border-line px-3 py-2 text-sm font-semibold transition hover:border-accent">View preparation checklist</button>
                </article>
              ))}
            </section>

            {selected ? (() => {
              const template = TEMPLATES.find((t) => t.id === selected);
              if (!template) return null;
              return <section className="rounded-sm border border-accent/50 p-5" aria-live="polite">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-accent">Preparation checklist</p><h3 className="mt-1 text-lg font-semibold">{template.title}</h3></div><button type="button" onClick={() => setSelected(null)} className="text-sm text-muted underline">Close</button></div>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
                  <li>Verify the legal names and signing authority of every party.</li>
                  <li>Identify each title/version and attach a complete rights schedule.</li>
                  <li>Specify rights, platforms, territories, languages, term and monetisation model.</li>
                  <li>Set fees, revenue share, taxes, reporting, warranties, indemnities and termination terms.</li>
                  <li>Obtain legal review and retain the final signed copy plus signing evidence.</li>
                </ul>
                <p className="mt-4 rounded-sm bg-bg p-3 text-sm leading-6">This page currently provides the template library and preparation checklist only. Electronic signature, signer verification, immutable execution records, PDF generation and automated email delivery are not yet connected. No document is signed or legally executed by selecting this checklist.</p>
              </section>;
            })() : null}

            <p className="text-xs leading-5 text-muted">Legal notice: these are document frameworks, not legal advice or a guarantee of enforceability. Applicable law, stamp duty/e-stamping where required, signer authority, consent, evidence integrity and the final agreement wording must be reviewed for each transaction. Bridge publication and Loop streaming remain subject to approved rights and licensing records.</p>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
