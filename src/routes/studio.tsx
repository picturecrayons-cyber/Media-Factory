import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { StudioMemberDesk } from "@/components/bridge/studio-member-desk";
import { DitAgentDesk } from "@/components/bridge/dit-agent-desk";
import { WorkspaceAction, WorkspaceOs, WorkspacePanel } from "@/components/bridge/workspace-os";

export const Route = createFileRoute("/studio")({ component: Studio });

const NAV = [
  { label: "Overview", href: "#overview" },
  { label: "My Titles", href: "#my-titles" },
  { label: "Productions", href: "#productions" },
  { label: "Production & DIT", href: "#production-dit" },
  { label: "Members & Roles", href: "#members" },
  { label: "QC & Rights", href: "#qc-rights" },
  { label: "Deliveries", href: "#deliveries" },
  { label: "Documents", href: "#documents" },
  { label: "Statements", href: "#statements" },
  { label: "Updates", href: "#updates" },
] as const;

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio OS">
          <StudioDashboard actor={actor} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function StudioDashboard({ actor }: { actor: { userId: string; displayName: string; organizationName?: string | null; organizationId?: string | null } }) {
  return (
    <WorkspaceOs
      eyebrow="Crayons Bridge · Studio OS"
      title={actor.organizationName || actor.displayName}
      description="One organization workspace for studio-owned titles, production intake, DIT handover, team visibility and authorized delivery."
      items={[...NAV]}
      actions={
        <>
          <WorkspaceAction href="#new-title">New Studio Title</WorkspaceAction>
          <WorkspaceAction href="#production-dit" secondary>Production Intake</WorkspaceAction>
          <Link to="/deliveries" className="inline-flex min-h-10 items-center rounded-lg border border-line-strong px-3.5 py-2 text-sm font-semibold hover:border-accent hover:text-accent">View Deliveries</Link>
        </>
      }
    >
      <WorkspacePanel id="overview" eyebrow="Organization workspace" title="Studio overview" description="Studio access, title visibility and membership are controlled by server-side authorization. Unconnected data is labelled rather than estimated.">
        <div className="grid gap-3 sm:grid-cols-3">
          <OverviewItem label="Organization" value={actor.organizationName || "—"} note="Authenticated session context" />
          <OverviewItem label="Studio titles" value="—" note="Count not independently verified" />
          <OverviewItem label="Production activity" value="—" note="Production feed not connected" />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {[
            ["01", "Intake", "Register the title"],
            ["02", "Ingest", "Preserve source media"],
            ["03", "Verify", "Check copies and manifests"],
            ["04", "Deliver", "Only after authorization"],
          ].map(([n, label, detail]) => (
            <div key={n} className="rounded-lg border border-line bg-elevated p-3">
              <p className="text-[10px] font-bold tracking-widest text-accent">{n}</p>
              <p className="mt-1 text-sm font-semibold">{label}</p>
              <p className="mt-1 text-xs text-muted">{detail}</p>
            </div>
          ))}
        </div>
      </WorkspacePanel>

      <WorkspacePanel id="my-titles" eyebrow="Organization-scoped catalogue" title="Studio Titles" description="Finished films and Story / Concept records remain separate. Only titles authorized for this Studio account should appear here.">
        <TitleList empty="No finished films are currently returned for this Studio account." />
        <div className="mt-4"><MyStoryConcepts /></div>
      </WorkspacePanel>

      <WorkspacePanel id="productions" eyebrow="Production tracking" title="Productions" description="Production project, crew, schedule and DIT assignment feeds are not connected in this dashboard yet. No placeholder production records or activity counts are shown.">
        <Unavailable label="Production project management" />
      </WorkspacePanel>

      <WorkspacePanel id="production-dit" eyebrow="Media handover" title="Production Intake & DIT" description="Retain the existing DIT Agent workflow: source-card manifests, checksum verification, OCI Primary and Recovery copies, and operator sign-off. Use only a title available to the authenticated Studio workspace.">
        <DitAgentDesk actor={actor} />
      </WorkspacePanel>

      <WorkspacePanel id="members" eyebrow="Organization access" title="Members & Roles" description="Verified roster only. Invitations, role changes, suspensions and removals are not enabled here.">
        <StudioMemberDesk />
      </WorkspacePanel>

      <WorkspacePanel id="qc-rights" eyebrow="Independent review controls" title="QC & Rights" description="Follow title-level review status and provide requested evidence. Studio users cannot approve their own QC, Legal or rights decisions.">
        <div className="rounded-lg border border-line bg-elevated p-3 text-sm text-muted">Review status is available within each authorized title record. No independent QC or Legal approval controls are exposed in Studio OS.</div>
        <div className="mt-3"><Link to="/workspace" className="text-sm font-semibold text-accent hover:underline">Open title workspace →</Link></div>
      </WorkspacePanel>

      <WorkspacePanel id="deliveries" eyebrow="Release control" title="Deliveries" description="Delivery records are available only after the required Bridge authorization. Submission and upload do not publish a title to Loop or buyers.">
        <Link to="/deliveries" className="inline-flex min-h-10 items-center rounded-lg border border-line-strong px-3.5 py-2 text-sm font-semibold hover:border-accent hover:text-accent">Open Deliveries workspace</Link>
      </WorkspacePanel>

      <WorkspacePanel id="documents" eyebrow="Secure records" title="Documents & Vault" description="Open the relevant title or DIT ingest session to access verified documents, manifests and secure asset records.">
        <p className="text-sm text-muted">Document and vault availability is not independently certified while Bridge Preview database binding errors remain unresolved.</p>
      </WorkspacePanel>

      <WorkspacePanel id="statements" eyebrow="Studio finance" title="Statements" description="Licensing statements, studio payable allocations and settlement records are shown only when verified ledger and reconciliation data are available.">
        <Unavailable label="Studio statements and settlement feed" />
      </WorkspacePanel>

      <WorkspacePanel id="updates" eyebrow="Operations feed" title="Updates" description="No consolidated Studio activity feed is connected. Recent title changes remain visible inside their authorized title records.">
        <Unavailable label="Studio activity feed" />
      </WorkspacePanel>

      <WorkspacePanel id="new-title" eyebrow="Start a submission" title="New Studio Title" description="Create a finished-film draft or a separate Story / Concept submission. A submission does not bypass QC, rights or licensing approval.">
        <NewSubmissionPanel />
      </WorkspacePanel>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-muted">
        <p>Studio access is organization-scoped. Role changes and independent QC / Legal approvals remain restricted.</p>
        <Link to="/account" className="font-semibold hover:text-accent">Account & access →</Link>
      </footer>
    </WorkspaceOs>
  );
}

function OverviewItem({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="rounded-lg border border-line bg-white p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-2 truncate font-display text-xl font-semibold">{value}</p>
      <p className="mt-1 text-[11px] text-muted">{note}</p>
    </article>
  );
}

function Unavailable({ label }: { label: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-line p-3">
      <p className="text-sm text-muted">{label}</p>
      <span className="rounded-md border border-line px-2 py-1 text-[10px] font-semibold tracking-wide text-muted">NOT CONNECTED</span>
    </div>
  );
}
