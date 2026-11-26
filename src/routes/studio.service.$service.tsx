import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { DitAgentDesk } from "@/components/bridge/dit-agent-desk";

export const Route = createFileRoute("/studio/service/$service")({
  component: StudioServicePage,
});

const services = {
  dit: {
    name: "Studio DIT Agent",
    eyebrow: "Media operations · Available now",
    summary: "A verified camera-card ingest workspace for production teams. Register source manifests, preserve original files and validate two independent storage copies before operator sign-off.",
    outcome: "From camera card to verified production backup",
    status: "available",
    capabilities: ["Source-card manifest registration", "SHA-256 file verification", "OCI Primary and Recovery copy checks", "Recorded DIT operator sign-off"],
  },
  productions: {
    name: "Productions",
    eyebrow: "Production management · Coming soon",
    summary: "A dedicated home for production projects, milestones, team coordination and verified handover records.",
    outcome: "One clear view of every production milestone",
    status: "coming",
    capabilities: ["Project-level production tracking", "Milestone planning", "Team and department coordination", "Production handover"],
  },
  schedule: {
    name: "Schedule",
    eyebrow: "Production calendar · Coming soon",
    summary: "A shared planning space for production dates, shoot schedules, delivery milestones and team visibility.",
    outcome: "Keep production dates and deliverables aligned",
    status: "coming",
    capabilities: ["Shared production calendar", "Shoot and post-production dates", "Milestone reminders", "Team schedule visibility"],
  },
  statements: {
    name: "Statements",
    eyebrow: "Business reporting · Coming soon",
    summary: "A studio-facing reporting area for verified licensing statements and reconciled settlement information when commercial reporting is enabled.",
    outcome: "Clear, evidence-backed financial reporting",
    status: "coming",
    capabilities: ["Licensing statement access", "Reconciled receipt reporting", "Settlement history", "Downloadable statements"],
  },
  insights: {
    name: "Insights",
    eyebrow: "Portfolio intelligence · Coming soon",
    summary: "A future portfolio view built from verified title, readiness and performance data—not estimates or placeholder metrics.",
    outcome: "Understand portfolio readiness with trusted data",
    status: "coming",
    capabilities: ["Title readiness overview", "Verified portfolio metrics", "Performance trends", "Operational insights"],
  },
} as const;

function StudioServicePage() {
  const { service } = Route.useParams();
  const selected = services[service as keyof typeof services];
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title={selected?.name ?? "Studio services"}>
          <div className="mx-auto max-w-6xl space-y-6 pb-12">
            <Link to="/studio" className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-fg">← Studio Home</Link>
            {!selected ? (
              <section className="rounded-3xl border border-line bg-surface p-8">
                <h2 className="font-display text-2xl font-semibold">Service not found</h2>
                <p className="mt-2 text-sm text-muted">Choose a service from your Studio Home.</p>
              </section>
            ) : (
              <>
                <section className="relative isolate overflow-hidden rounded-[2rem] border border-line bg-gradient-to-br from-[#102d3a] via-[#164b5a] to-[#0b1724] px-6 py-10 text-white sm:px-10 sm:py-14">
                  <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full border border-white/10 bg-white/5 blur-2xl" />
                  <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-20 h-40 w-40 rounded-full border border-white/10" />
                  <div className="relative max-w-3xl">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]">{selected.eyebrow}</span>
                      {selected.status === "available" ? <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#102d3a]">ACTIVE SERVICE</span> : null}
                    </div>
                    <h2 className="mt-6 font-display text-4xl font-semibold tracking-tight sm:text-5xl">{selected.name}</h2>
                    <p className="mt-5 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">{selected.summary}</p>
                    <p className="mt-7 text-sm font-semibold tracking-wide text-white">{selected.outcome}</p>
                    {selected.status === "coming" ? <p className="mt-6 inline-flex rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white/90">This service is not connected yet. No actions or records are being simulated.</p> : null}
                  </div>
                </section>

                <section className="grid gap-4 lg:grid-cols-[1fr_300px]">
                  <div className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Service capabilities</p>
                    <h3 className="mt-2 font-display text-2xl font-semibold">What this workspace provides</h3>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {selected.capabilities.map((capability, index) => (
                        <div key={capability} className="flex gap-3 rounded-xl border border-line p-4">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fg text-xs font-semibold text-bg">{index + 1}</span>
                          <p className="text-sm font-medium">{capability}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <aside className="rounded-2xl border border-line bg-surface p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Studio workspace</p>
                    <h3 className="mt-2 font-display text-xl font-semibold">Your account</h3>
                    <p className="mt-2 text-sm text-muted">{actor.organizationName || actor.displayName}</p>
                    <div className="mt-5 border-t border-line pt-4">
                      <p className="text-xs text-muted">Access</p>
                      <p className="mt-1 text-sm font-semibold">Studio account</p>
                    </div>
                    <Link to="/studio" className="mt-6 inline-flex w-full justify-center rounded-xl bg-fg px-4 py-3 text-sm font-semibold text-bg">Back to Studio Home</Link>
                  </aside>
                </section>
                {selected.status === "available" && service === "dit" ? (
                  <section className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Secure ingest</p>
                      <h3 className="mt-1 font-display text-2xl font-semibold">DIT ingest workspace</h3>
                      <p className="mt-1 text-sm text-muted">Register a camera card and verify Primary and Recovery copies before sign-off.</p>
                    </div>
                    <DitAgentDesk actor={actor} />
                  </section>
                ) : null}
              </>
            )}
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
