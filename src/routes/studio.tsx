import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
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
                <p className="mt-1 max-w-2xl text-sm text-muted">Choose a task and continue. You only see the Studio tools available to your account.</p>
              </div>
            </section>

            <section aria-label="Studio quick actions" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              <a href="#studio-titles" className="rounded-lg border border-line px-3 py-3 text-sm font-semibold hover:border-accent">My Titles</a>
              <a href="#studio-submit-heading" className="rounded-lg border border-line px-3 py-3 text-sm font-semibold hover:border-accent">Add Finished Film / Story</a>
              <a href="#studio-dit" className="rounded-lg border border-line px-3 py-3 text-sm font-semibold hover:border-accent">DIT Agent</a>
              <a href="#studio-documents" className="rounded-lg border border-line px-3 py-3 text-sm font-semibold hover:border-accent">Document Vault</a>
              <a href="#studio-members" className="rounded-lg border border-line px-3 py-3 text-sm font-semibold hover:border-accent">Members & Roles</a>
              <a href="/deliveries" className="rounded-lg border border-line px-3 py-3 text-sm font-semibold hover:border-accent">Delivery Status</a>
              <a href="#studio-storage" className="rounded-lg border border-line px-3 py-3 text-sm font-semibold hover:border-accent">Storage Space</a>
              <Link to="/account" className="rounded-lg border border-line px-3 py-3 text-sm font-semibold hover:border-accent">Account</Link>
              <a href="https://crayonsloop.in/" className="rounded-lg border border-line px-3 py-3 text-sm font-semibold hover:border-accent">Open Crayons Loop ↗</a>
            </section>

            <section aria-labelledby="studio-submit-heading" className="space-y-3">
              <div>
                <h3 id="studio-submit-heading" className="font-display text-lg font-semibold">Add a title</h3>
                <p className="mt-1 text-sm text-muted">Choose one direct submission path. QC, rights and licensing approvals remain separate.</p>
              </div>
              <NewSubmissionPanel />
            </section>

            <section id="studio-titles"            <section id="studio-titles" className="scroll-mt-20 space-y-4">
              <div>
                <h3 className="font-display text-xl font-semibold">Studio titles</h3>
                <p className="mt-1 text-sm text-muted">Finished films and story concepts are listed separately. Submission does not bypass QC, rights or licensing approval.</p>
              </div>
              <TitleList empty="No finished films are currently returned for this studio account." />
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

            <section id="studio-operations" className="scroll-mt-20 rounded-xl border border-line p-4">
              <h3 className="font-semibold">Production services</h3>
              <p className="mt-1 text-sm text-muted">Production tracking, shared schedule, statements and insights are not connected yet. They will appear as direct actions when their real workflows are ready.</p>
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
