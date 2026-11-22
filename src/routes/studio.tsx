import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";
import { StudioMemberDesk } from "@/components/bridge/studio-member-desk";
import { DitAgentDesk } from "@/components/bridge/dit-agent-desk";
import { CreatorDocumentVault } from "@/components/bridge/creator-document-vault";
import { TitleAssetGallery } from "@/components/bridge/title-asset-gallery";

export const Route = createFileRoute("/studio")({ component: Studio });

const workspaceLinks = [
  ["Titles", "#studio-titles", "Finished films and story concepts"],
  ["Gallery", "#studio-gallery", "Approved artwork and verified images"],
  ["Production & DIT", "#studio-dit", "Camera-card intake and media handover"],
  ["Document Vault", "#studio-documents", "Private rights and ownership evidence"],
  ["Members", "#studio-members", "Studio membership and roles"],
] as const;

const otherModules = [
  ["Organization", "Verified studio profile and organization details.", "Shown when the organization mapping is available."],
  ["Productions", "Production projects, stages and title ownership.", "Production project tracking is not connected yet."],
  ["QC & Rights", "Quality-control and rights-review progress.", "Review decisions remain authoritative on each title."],
  ["Schedule", "Production and delivery milestones.", "Shared studio schedule is not connected yet."],
  ["Statements", "Licensing and settlement records.", "Financial statements are not connected yet."],
  ["Insights", "Studio portfolio activity.", "Analytics are not connected yet."],
  ["Help", "Studio onboarding and production support.", "Use the existing Bridge support channel."],
] as const;

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio workspace">
          <div className="mx-auto max-w-7xl space-y-7 px-1 pb-16">
            <header id="home" className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-7">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Crayons Bridge / Studio</p>
                <h2 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{actor.organizationName || actor.displayName}</h2>
                <p className="mt-2 max-w-2xl text-sm text-muted">One workspace for title intake, production handover and private evidence. Access is checked by the server for every operation.</p>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <a href="#studio-titles" className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90">Studio titles</a>
                <a href="#studio-dit" className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold transition hover:border-accent">Production & DIT</a>
                <a href="#studio-members" className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold transition hover:border-accent">Members & roles</a>
                <Link to="/deliveries" className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold transition hover:border-accent">Vendor Services ↗</Link>
              </div>
            </header>

            <nav aria-label="Studio workspace sections" className="sticky top-0 z-20 grid gap-2 border-y border-line bg-bg/95 py-3 backdrop-blur sm:grid-cols-2 lg:grid-cols-5">
              {workspaceLinks.map(([label, href, description], index) => (
                <a key={label} href={href} className="group rounded-xl border border-line bg-panel p-3 transition-colors hover:border-accent">
                  <span className="flex items-center justify-between text-sm font-semibold">{String(index + 1).padStart(2, "0")} · {label}<span aria-hidden="true" className="text-muted group-hover:text-accent">↘</span></span>
                  <span className="mt-1 block text-xs text-muted">{description}</span>
                </a>
              ))}
            </nav>

            <section aria-labelledby="title-intake-heading" className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent">Start here</p>
                  <h3 id="title-intake-heading" className="mt-1 font-display text-2xl font-semibold">Create or submit a title</h3>
                  <p className="mt-1 max-w-2xl text-sm text-muted">Choose the correct submission type. Finished films and story concepts stay separate; submission never bypasses QC, rights or licensing approval.</p>
                </div>
              </div>
              <NewSubmissionPanel />
            </section>

            <section id="studio-titles" className="scroll-mt-24 space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent">Your catalogue</p>
                  <h3 className="mt-1 font-display text-xl font-semibold">Studio titles</h3>
                  <p className="mt-1 text-sm text-muted">Finished films are listed separately from concepts awaiting review.</p>
                </div>
              </div>
              <div className="rounded-xl border border-line p-4 sm:p-5">
                <h4 className="font-semibold">Finished films</h4>
                <p className="mb-3 mt-1 text-sm text-muted">Only finished-film submissions authorized for this studio account appear here.</p>
                <TitleList empty="No finished films are currently returned for this studio account." />
              </div>
              <div className="rounded-xl border border-line p-4 sm:p-5">
                <h4 className="font-semibold">Story concepts</h4>
                <p className="mb-3 mt-1 text-sm text-muted">Concepts remain in their own review workflow and are not treated as finished films.</p>
                <MyStoryConcepts userId={actor.userId} />
              </div>
            </section>

            <section id="studio-gallery" className="scroll-mt-24 space-y-3">
              <div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Studio media</p><h3 className="mt-1 font-display text-xl font-semibold">Studio Gallery</h3><p className="mt-1 text-sm text-muted">Artwork and verified image assets from titles visible to this active Studio membership.</p></div>
              <div className="rounded-xl border border-line p-4 sm:p-5"><TitleAssetGallery userId={actor.userId} scopeLabel="Studio" /></div>
            </section>

            <section id="studio-dit" className="scroll-mt-24 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-accent">Production control</p>
                <h3 className="mt-1 font-display text-xl font-semibold">Production & DIT</h3>
                <p className="mt-1 text-sm text-muted">Register camera-card manifests, ingest originals and verify independent Primary and Recovery copies before sign-off. Server actions must enforce active Studio owner, admin, producer or DIT membership.</p>
              </div>
              <div className="rounded-xl border border-line p-4 sm:p-5">
                <DitAgentDesk actor={actor} />
              </div>
            </section>

            <section id="studio-documents" className="scroll-mt-24 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-accent">Legal evidence</p>
                <h3 className="mt-1 font-display text-xl font-semibold">Private document vault</h3>
                <p className="mt-1 text-sm text-muted">Upload once, verify private storage, then link evidence to an eligible title. Uploading or linking a file does not approve rights or publish a title.</p>
              </div>
              <div className="rounded-xl border border-line p-4 sm:p-5">
                <CreatorDocumentVault userId={actor.userId} />
              </div>
            </section>

            <section id="studio-members" className="scroll-mt-24 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-accent">Access control</p>
                <h3 className="mt-1 font-display text-xl font-semibold">Members & roles</h3>
                <p className="mt-1 text-sm text-muted">Membership and title visibility are server-authorized. Invitations and role changes remain unavailable until their workflow is implemented and verified.</p>
              </div>
              <div className="rounded-xl border border-line p-4 sm:p-5">
                <StudioMemberDesk />
              </div>
            </section>

            <details id="studio-more" className="scroll-mt-20 rounded-xl border border-line p-4">
              <summary className="cursor-pointer list-none font-semibold">Other studio services <span className="ml-2 text-xs font-normal text-muted">Availability and connection status</span></summary>
              <p className="mt-2 text-sm text-muted">These services are kept out of the primary workflow until their data sources and permissions are ready. No placeholder metrics or synthetic records are shown.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {otherModules.map(([name, description, status]) => (
                  <article key={name} className="rounded-xl bg-subtle p-3">
                    <h4 className="text-sm font-semibold">{name}</h4>
                    <p className="mt-1 text-sm">{description}</p>
                    <p className="mt-2 text-xs text-muted">{status}</p>
                  </article>
                ))}
              </div>
            </details>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
