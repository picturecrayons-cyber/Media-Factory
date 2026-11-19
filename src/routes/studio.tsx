import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { StudioMemberDesk } from "@/components/bridge/studio-member-desk";
import { DitAgentDesk } from "@/components/bridge/dit-agent-desk";
import { StudioStatementDesk } from "@/components/bridge/studio-statement-desk";
import { StudioFinancialActivityDesk } from "@/components/bridge/studio-financial-activity-desk";
import { StudioScheduleDesk } from "@/components/bridge/studio-schedule-desk";

export const Route = createFileRoute("/studio")({ component: Studio });

const studioModules = [
  ["Organization", "Studio identity, verified organization scope and account owner.", "Organization scope is resolved from active membership. Contact Super Admin for membership corrections."],
  ["Members & Roles", "Manage Studio membership, invitations and ownership.", "Existing-member role/status updates, email-bound invitations and two-party owner transfer are implemented. Actual invitation delivery and handover require a live verified account test."],
  ["Productions", "Coordinate Studio-owned titles, DIT handover and production milestones.", "Studio-owned title workflows, DIT ingest and organization-scoped production schedule are connected."],
  ["QC & Rights", "Track feedback and evidence for Studio-owned titles.", "Open each title workspace for current QC feedback and rights evidence; only authorized Legal/QC decisions can approve."],
  ["Deliveries", "Track delivery jobs, assignments and approval.", "Open the shared Deliveries workspace for persisted jobs and server-authorized actions."],
  ["Schedule", "Coordinate title-linked production and delivery milestones.", "Connected: organization-scoped events with audited status changes."],
  ["Statements", "Review Studio title settlements, channel statements and payment schedules.", "Connected read-only source records. Bank reconciliation and accounting certification remain separate and NOT VERIFIED."],
  ["Insights", "Review persisted Studio titles, ingest and delivery activity.", "Only verified database-backed activity is displayed. Audience and commercial analytics remain unconnected."],
  ["Help", "Get support with Studio onboarding and production workflows.", "Use the existing Bridge support channel."],
] as const;

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
                <p className="mt-1 max-w-2xl text-sm text-muted">Manage Studio-owned titles, production handover, members and Camera-to-Cloud ingest. All records remain scoped to the verified Studio organization.</p>
              </div>
              <Link to="/deliveries" className="rounded-sm border border-line px-4 py-2 text-sm font-semibold">View deliveries</Link>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Studio workspace navigation">
              <a href="#studio-titles" className="rounded-sm border border-line p-4 hover:border-accent"><strong>Studio Titles</strong><p className="mt-1 text-sm text-muted">Finished films and story concepts</p></a>
              <a href="#studio-operations" className="rounded-sm border border-line p-4 hover:border-accent"><strong>Production & DIT</strong><p className="mt-1 text-sm text-muted">Production operations and media handover</p></a>
              <Link to="/account" className="rounded-sm border border-line p-4 hover:border-accent"><strong>Account</strong><p className="mt-1 text-sm text-muted">Studio account profile</p></Link>
              <a href="#studio-dit" className="rounded-sm border border-line p-4 hover:border-accent"><strong>DIT Agent</strong><p className="mt-1 text-sm text-muted">Camera-to-Cloud ingest, Primary / Recovery copy verification and sign-off</p></a>
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="font-display text-xl font-semibold">Add a studio title</h3>
                <p className="mt-1 text-sm text-muted">Finished films and story concepts remain separate. A title upload does not bypass QC, rights or licensing approvals.</p>
              </div>
              <NewSubmissionPanel />
            </section>

            <section id="studio-titles" className="space-y-4">
              <div>
                <h3 className="font-display text-xl font-semibold">Finished films</h3>
                <p className="mt-1 text-sm text-muted">Only titles authorized for this Studio account appear here. Open a title to manage metadata, upload its assets, review QC feedback and submit rights evidence.</p>
              </div>
              <TitleList empty="No finished films are currently returned for this studio account." />
              <MyStoryConcepts />
            </section>


            <section id="studio-members" className="space-y-3">
              <div>
                <h3 className="font-display text-xl font-semibold">Members & Roles</h3>
                <p className="mt-1 text-sm text-muted">Manage existing Studio member roles and status, and complete owner handover with separate owner/admin approval. Invitations remain disabled pending verified acceptance.</p>
              </div>
              <StudioMemberDesk />
            </section>

            <section id="studio-dit" className="space-y-3">
              <div>
                <h3 className="font-display text-xl font-semibold">Studio DIT Agent</h3>
                <p className="mt-1 text-sm text-muted">Register camera-card manifests, upload original files to OCI Primary, create and verify the independent Recovery copy, and record DIT operator sign-off. Original folder paths and filenames are preserved. Actions require an active Studio owner, admin, producer or DIT membership.</p>
              </div>
              <DitAgentDesk actor={actor} />
            </section>


            <section id="studio-schedule" className="space-y-3">
              <div>
                <h3 className="font-display text-xl font-semibold">Production schedule</h3>
                <p className="mt-1 text-sm text-muted">Create and track production events for titles owned by this Studio organization.</p>
              </div>
              <StudioScheduleDesk actor={actor} />
            </section>

            <section id="studio-statements" className="space-y-5">
              <div>
                <h3 className="font-display text-xl font-semibold">Studio statements</h3>
                <p className="mt-1 text-sm text-muted">Read-only channel statements and payment schedule records for this organization.</p>
              </div>
              <StudioStatementDesk />
              <div className="border-t border-line pt-5">
                <h3 className="font-display text-lg font-semibold">Commercial activity</h3>
                <p className="mt-1 text-sm text-muted">Existing payments, ledger entries and contractual service-settlement records linked to Studio titles.</p>
              </div>
              <StudioFinancialActivityDesk />
            </section>

            <section id="studio-operations" className="space-y-3">
              <div>
                <h3 className="font-display text-xl font-semibold">Studio operations</h3>
                <p className="mt-1 text-sm text-muted">The modules below define the intended Studio dashboard. Unimplemented data sources are explicitly marked; no synthetic members, productions or financial values are displayed.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {studioModules.map(([name, description, status]) => (
                  <article key={name} className="rounded-sm border border-line p-4">
                    <h4 className="font-semibold">{name}</h4>
                    <p className="mt-1 text-sm">{description}</p>
                    <p className="mt-3 text-xs text-muted">{status}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
