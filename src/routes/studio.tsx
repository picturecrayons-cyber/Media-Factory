import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { StudioMemberDesk } from "@/components/bridge/studio-member-desk";
import { DitAgentDesk } from "@/components/bridge/dit-agent-desk";
import { CreatorDocumentVault } from "@/components/bridge/creator-document-vault";

export const Route = createFileRoute("/studio")({ component: Studio });

const studioModules = [
  ["Productions", "Track production projects and title ownership.", "Production project tracking is not connected yet.", "#studio-productions"],
  ["QC & Rights", "Track quality checks and rights approvals.", "Use each title's verified review status; submission does not approve rights.", "#studio-titles"],
  ["Schedule", "Coordinate production and delivery milestones.", "A shared studio schedule is not connected yet.", "#studio-schedule"],
  ["Statements", "Review verified licensing and settlement records.", "Financial statements are not connected yet.", "#studio-business"],
  ["Insights", "Review verified studio portfolio activity.", "Studio analytics are not connected yet.", "#studio-business"],
] as const;

function ServiceCard({ title, description, href, status }: {
  title: string;
  description: string;
  href: string;
  status?: string;
}) {
  return (
    <a href={href} className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <strong className="block">{title}</strong>
      <span className="mt-1 block text-sm text-muted">{description}</span>
      {status && <span className="mt-3 block text-xs font-medium text-muted">{status}</span>}
    </a>
  );
}

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio dashboard">
          <div className="mx-auto max-w-5xl space-y-8 px-1 pb-16">
            <section id="home" className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Studio workspace</p>
                <h2 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{actor.organizationName || actor.displayName}</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted">Find buyers for finished films, connect stories with producers and investors, and manage production services and storage.</p>
              </div>
              <Link to="/account" className="rounded-sm border border-line px-4 py-2 text-sm font-semibold">Studio account</Link>
            </section>

            <section aria-labelledby="studio-submit-heading" className="space-y-3">
              <div>
                <h3 id="studio-submit-heading" className="font-display text-xl font-semibold">Find opportunities through Bridge</h3>
                <p className="mt-1 text-sm text-muted">Both submission paths are important: finished films seek buyers; stories and concepts seek producers or investors.</p>
              </div>
              <NewSubmissionPanel />
            </section>

            <section aria-labelledby="studio-services-heading" className="space-y-3">
              <div>
                <h3 id="studio-services-heading" className="font-display text-xl font-semibold">Studio services</h3>
                <p className="mt-1 text-sm text-muted">Open the service you need. Access to titles, files and organization records remains server-authorized.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <ServiceCard title="Studio Titles" description="Manage finished films and story concepts." href="#studio-titles" />
                <ServiceCard title="Production & DIT" description="Coordinate production operations and media handover." href="#studio-operations" />
                <ServiceCard title="DIT Agent" description="Register camera cards, verify checksums and record sign-off." href="#studio-dit" />
                <ServiceCard title="Production Schedule" description="Plan production and delivery milestones." href="#studio-schedule" status="Coming soon — shared schedule is not connected." />
                <ServiceCard title="Document Vault" description="Keep private ownership, rights and agreement documents." href="#studio-documents" />
                <ServiceCard title="QC & Rights" description="Follow quality checks and rights-review progress." href="#studio-titles" />
                <ServiceCard title="Deliveries" description="Open approved delivery packages." href="/deliveries" />
                <ServiceCard title="Members & Roles" description="View the verified studio roster." href="#studio-members" />
                <ServiceCard title="Storage Space" description="Plan media storage, backups and additional capacity." href="#studio-storage" status="Storage plans and billing are being prepared; no charge is enabled here yet." />
                <ServiceCard title="Statements & Insights" description="Review verified licensing, settlements and studio activity." href="#studio-business" status="Coming soon — verified financial and analytics data is not connected." />
                <ServiceCard title="Help & Support" description="Get help with Studio onboarding and workflows." href="#studio-help" />
                <ServiceCard title="Crayons Loop" description="Open the consumer streaming platform." href="https://crayonsloop.in/" />
              </div>
            </section>

            <section id="studio-titles" className="scroll-mt-20 space-y-4">
              <div>
                <h3 className="font-display text-xl font-semibold">Studio titles</h3>
                <p className="mt-1 text-sm text-muted">Finished films and story concepts are listed separately. Submission does not bypass QC, rights or licensing approval.</p>
              </div>
              <TitleList empty="No finished films are currently returned for this studio account." />
              <MyStoryConcepts />
            </section>

            <section id="studio-storage" className="scroll-mt-20 rounded-xl border border-line p-4 sm:p-5">
              <h3 className="font-display text-xl font-semibold">Storage Space</h3>
              <p className="mt-1 text-sm text-muted">A planned paid Studio service for production media, source footage, verified copies and additional storage capacity.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-surface p-3"><strong className="block text-sm">Storage usage</strong><span className="mt-1 block text-xs text-muted">Usage meter not connected yet.</span></div>
                <div className="rounded-lg bg-surface p-3"><strong className="block text-sm">Storage plans</strong><span className="mt-1 block text-xs text-muted">Plan sizes and pricing not published yet.</span></div>
                <div className="rounded-lg bg-surface p-3"><strong className="block text-sm">Add capacity</strong><span className="mt-1 block text-xs text-muted">Self-service purchase is not enabled.</span></div>
              </div>
              <p className="mt-3 text-xs text-muted">No storage charge or subscription is active from this screen. Storage pricing, quota enforcement, billing and recovery-copy costs must be verified before activation.</p>
            </section>

            <section id="studio-documents" className="scroll-mt-20">
              <CreatorDocumentVault />
            </section>

            <section id="studio-members" className="scroll-mt-20 space-y-3">
              <div>
                <h3 className="font-display text-xl font-semibold">Members & Roles</h3>
                <p className="mt-1 text-sm text-muted">Read-only roster for verified Studio owners and administrators. Invitations and role changes remain disabled.</p>
              </div>
              <StudioMemberDesk />
            </section>

            <section id="studio-dit" className="scroll-mt-20 space-y-3">
              <div>
                <h3 className="font-display text-xl font-semibold">DIT Agent</h3>
                <p className="mt-1 text-sm text-muted">Register source-card manifests, compare Primary and Recovery copies, and record operator sign-off.</p>
              </div>
              <DitAgentDesk actor={actor} />
            </section>

            <section id="studio-operations" className="scroll-mt-20 space-y-3">
              <div>
                <h3 className="font-display text-xl font-semibold">Production & DIT operations</h3>
                <p className="mt-1 text-sm text-muted">Production services are shown with their actual connection status; no synthetic projects or financial values are displayed.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {studioModules.map(([name, description, status, href]) => (
                  <article key={name} id={name === "Schedule" ? "studio-schedule" : name === "Statements" ? "studio-business" : undefined} className="rounded-xl border border-line p-4">
                    <h4 className="font-semibold">{name}</h4>
                    <p className="mt-1 text-sm">{description}</p>
                    <p className="mt-3 text-xs text-muted">{status}</p>
                    <a href={href} className="mt-3 inline-block text-xs font-semibold underline underline-offset-2">Open section</a>
                  </article>
                ))}
              </div>
            </section>

            <section id="studio-help" className="scroll-mt-20 rounded-xl border border-line p-4">
              <h3 className="font-semibold">Help & Support</h3>
              <p className="mt-1 text-sm text-muted">Use the existing Bridge support channel for Studio onboarding and production workflow help.</p>
            </section>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
