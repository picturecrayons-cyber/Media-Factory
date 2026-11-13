import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { NewSubmissionPanel } from "@/components/bridge/new-submission-panel";

export const Route = createFileRoute("/creator")({ component: Creator });

const creatorModules = [
  ["Updates", "Review title, QC, rights and delivery updates.", "Available through title status and Deliveries."],
  ["Channels", "Track authorized licensing and distribution channels.", "Channel reporting is not connected yet."],
  ["Marketing", "Prepare approved artwork, synopsis and promotional materials.", "Marketing campaign tools are not connected yet."],
  ["Insights", "Understand title activity and buyer engagement.", "Verified analytics are not connected yet."],
  ["Statements", "Review verified licensing statements and settlements.", "Financial statements are not connected yet."],
  ["Schedule", "Track delivery milestones and production dates.", "A shared schedule is not connected yet."],
  ["Upgrade", "Review optional account services.", "Free onboarding remains available; no paid upgrade is required."],
  ["Referrals", "Review partner and referral activity.", "Referral tracking is not connected yet."],
  ["Help", "Get help with onboarding, rights and delivery.", "Contact the Bridge team through the existing support channel."],
  ["Changelog", "See product and workflow changes.", "Release notes will appear here when published."],
  ["Watch on Relay", "Open the consumer viewing experience.", "Only titles authorized by Bridge can be published to Loop."],
] as const;

function Creator() {
  return (
    <RequireBridge allow="creator">
      {(actor) => (
        <BridgeShell actor={actor} title="Creator dashboard">
          <div className="mx-auto max-w-5xl space-y-8 px-1 pb-16">
            <section id="home" className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Independent creator workspace</p>
                <h2 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">Welcome, {actor.displayName}</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted">Manage your own titles, submissions, rights progress and delivery. Your account remains separate from payment entitlements.</p>
              </div>
              <Link to="/deliveries" className="rounded-sm border border-line px-4 py-2 text-sm font-semibold">View deliveries</Link>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Creator workspace navigation">
              <a href="#my-titles" className="rounded-sm border border-line p-4 hover:border-accent"><strong>My Titles</strong><p className="mt-1 text-sm text-muted">Your title records and story concepts</p></a>
              <Link to="/deliveries" className="rounded-sm border border-line p-4 hover:border-accent"><strong>Updates & Deliveries</strong><p className="mt-1 text-sm text-muted">Current delivery workspace</p></Link>
              <Link to="/account" className="rounded-sm border border-line p-4 hover:border-accent"><strong>Account</strong><p className="mt-1 text-sm text-muted">Profile and verification</p></Link>
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="font-display text-xl font-semibold">Start or update a title</h3>
                <p className="mt-1 text-sm text-muted">New submissions begin as drafts. Upload, QC, rights and licensing remain separate approval steps.</p>
              </div>
              <NewSubmissionPanel />
            </section>

            <section id="my-titles" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-display text-xl font-semibold">My Titles</h3>
                <Link to="/account" className="text-sm text-muted">Account settings</Link>
              </div>
              <TitleList empty="No titles are currently returned for this creator account." />
              <MyStoryConcepts />
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="font-display text-xl font-semibold">Creator tools</h3>
                <p className="mt-1 text-sm text-muted">These areas are shown for product navigation, but unavailable integrations are clearly identified rather than displaying invented estimates or activity.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {creatorModules.map(([name, description, status]) => (
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
