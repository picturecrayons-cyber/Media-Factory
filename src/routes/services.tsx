import { createFileRoute } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";

export const Route = createFileRoute("/services")({ component: Services });

const offerings = [
  {
    number: "01",
    title: "Finished Film — QC, Legal & Content Readiness",
    description:
      "For completed films that need technical quality checks, legal review coordination and content-readiness assessment before licensing or distribution.",
    deliverables: ["Technical QC report", "Legal review status", "Readiness decision", "Required remediation list"],
    pricing: "Custom quote per title",
    note: "QC and legal reviews are separate approval tracks. A paid service does not guarantee approval.",
  },
  {
    number: "02",
    title: "Content Licensing & Distribution",
    description:
      "For filmmakers and studios seeking licensing opportunities, distribution partners and authorized content delivery.",
    deliverables: ["Rights and chain-of-title intake", "Territory / language / platform scope", "Licence terms and window", "Authorized delivery coordination"],
    pricing: "Negotiated licence terms + quoted services",
    note: "No licence, buyer entitlement or Loop publication is created until rights and authorization checks pass.",
  },
  {
    number: "03",
    title: "Concepts & Stories",
    description:
      "For creators submitting film concepts, stories and scripts for evaluation and possible development consideration.",
    deliverables: ["Concept / script intake", "Evaluation workflow", "Review status", "Separate development proposal where applicable"],
    pricing: "Submission / evaluation fee: rate to be confirmed",
    note: "Submission or evaluation does not promise acceptance, financing, buyer introduction or production.",
  },
  {
    number: "04",
    title: "DIT Workflow Services",
    description:
      "Digital Imaging Technician support for production-day media intake, camera-card handling, verified copies, media organization and post-production handoffs.",
    deliverables: ["Production and shooting-day intake", "Camera / card / clip manifest", "Master and backup verification tracking", "Conversion and handoff tracking", "Human DIT sign-off"],
    pricing: "Quote by DIT headcount, days, hours and media scope",
    note: "Custom quote based on approved DIT headcount, service duration and media scope. Internal labour rates and cost calculations are not displayed to customers.",
  },
];

function Services() {
  return (
    <RequireBridge allow="workspace">
      {(actor) => (
        <BridgeShell actor={actor} title="Creator & Studio Services">
          <div className="mx-auto max-w-6xl space-y-8 px-1 pb-16">
            <header className="max-w-3xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">CRAYONS BRIDGE · B2B SERVICES</p>
              <h1 className="font-display text-3xl tracking-tight sm:text-4xl">One bridge from content to market.</h1>
              <p className="text-sm leading-6 text-muted sm:text-base">
                Services for creators, independent filmmakers and film studios. Prepare. Protect. License. Deliver.
              </p>
              <div className="flex flex-wrap gap-2 pt-2 text-xs">
                <span className="rounded-full border border-line px-3 py-1.5">Creator</span>
                <span className="rounded-full border border-line px-3 py-1.5">Independent Filmmaker</span>
                <span className="rounded-full border border-line px-3 py-1.5">Film Studio</span>
              </div>
            </header>

            <section className="grid gap-4 md:grid-cols-2">
              {offerings.map((item) => (
                <article key={item.number} className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-xs font-semibold tracking-widest text-muted">{item.number}</span>
                    <span className="rounded-full border border-line px-3 py-1 text-xs font-medium">Quote required</span>
                  </div>
                  <h2 className="mt-4 text-xl font-semibold leading-snug">{item.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-muted">{item.description}</p>
                  <div className="mt-5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Deliverables</h3>
                    <ul className="mt-2 space-y-2 text-sm">
                      {item.deliverables.map((deliverable) => (
                        <li key={deliverable} className="flex gap-2"><span aria-hidden="true">•</span><span>{deliverable}</span></li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-auto pt-6">
                    <div className="rounded-xl bg-bg p-4">
                      <p className="text-xs uppercase tracking-wider text-muted">Pricing basis</p>
                      <p className="mt-1 font-semibold">{item.pricing}</p>
                      <p className="mt-2 text-xs leading-5 text-muted">{item.note}</p>
                    </div>
                    <a
                      className="mt-4 inline-flex rounded-full border border-line px-4 py-2.5 text-sm font-semibold hover:bg-fg/5"
                      href={`mailto:abijithasokan@crayonspictures.com?subject=${encodeURIComponent("CRAYONS BRIDGE service enquiry: " + item.title)}&body=${encodeURIComponent("Hello CRAYONS BRIDGE,\n\nI would like to enquire about: " + item.title + ".\n\nName / Company:\nProject / Film:\nRequired scope:\nTarget dates:\n\nPlease advise the intake requirements and itemized quotation.\n")}`}
                    >
                      Prepare email enquiry
                    </a>
                    <p className="mt-2 text-xs text-muted">Opens your email app. Nothing is submitted or charged by Bridge at this step.</p>
                  </div>
                </article>
              ))}
            </section>

            <section className="rounded-2xl border border-line p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Proposed workspace plans</h2>
              <p className="mt-1 text-sm text-muted">Existing proposal figures, shown for discussion only. Not active rates; checkout is disabled.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-bg p-4">
                  <p className="font-semibold">Creator Free</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">₹0</p>
                  <p className="mt-1 text-xs text-muted">Proposed · workspace access</p>
                </div>
                <div className="rounded-xl bg-bg p-4">
                  <p className="font-semibold">Creator Plus</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">₹799<span className="text-sm font-normal text-muted"> / month</span></p>
                  <p className="mt-1 text-xs text-muted">Proposed · not an active charge</p>
                </div>
                <div className="rounded-xl bg-bg p-4">
                  <p className="font-semibold">Studio</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">₹2,999<span className="text-sm font-normal text-muted"> / month</span></p>
                  <p className="mt-1 text-xs text-muted">Proposed · not an active charge</p>
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-muted">Enterprise: custom proposal. Any licensing commission or revenue share requires a separate signed commercial agreement. Service charges, taxes, pass-through expenses and licence consideration must be itemized separately.</p>
            </section>

            <section className="rounded-2xl border border-line p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Bridge authorizes. Loop delivers.</h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="font-semibold">CRAYONS BRIDGE</p>
                  <p className="mt-1 text-sm leading-6 text-muted">Creator / Studio intake, QC, legal review, rights, quotes, payments and release authorization.</p>
                </div>
                <div>
                  <p className="font-semibold">CRAYONS LOOP</p>
                  <p className="mt-1 text-sm leading-6 text-muted">Consumer streaming catalogue and playback for titles with valid publication, territory, window and distribution authorization.</p>
                </div>
              </div>
              <p className="mt-4 rounded-lg border border-line p-3 text-sm leading-6">
                Payment confirms only the paid order. It does not grant QC or legal approval, licensing rights, buyer access, or permission to publish on Loop.
              </p>
            </section>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
