import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/studios")({ component: Studios });

function Studios() {
  return (
    <main className="min-h-screen bg-white px-5 py-12 text-fg sm:px-6">
      <article className="mx-auto max-w-4xl space-y-7 rounded-3xl border border-line bg-surface p-7 sm:p-10">
        <Link to="/" className="text-sm font-semibold text-accent">← Crayons Bridge</Link>
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Built for production companies</p>
        <h1 className="font-display text-4xl font-semibold sm:text-5xl">One workspace for your studio catalogue.</h1>
        <p className="max-w-2xl text-base leading-7 text-muted">Organize studio-owned titles, coordinate production and media handover, and manage authorized team access with organization-scoped controls.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["Studio catalogue","Maintain finished-film and story-concept records as distinct submission types."],
            ["Production & DIT","Coordinate camera-card ingest, manifest evidence, primary and recovery verification."],
            ["Team roles","Access is tied to verified organization membership and approved permissions."],
            ["Rights & documents","Keep private ownership and legal evidence associated with authorized title records."],
            ["Licensing operations","Track buyer enquiries and title-specific permissions where enabled."],
            ["Portfolio visibility","Review only studio records returned for your active organization scope."]
          ].map(([title,description])=><section key={title} className="rounded-2xl border border-line p-5"><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted">{description}</p></section>)}
        </div>
        <p className="text-sm leading-7 text-muted">Studio access is subject to account verification and organization authorization. A paid plan or upload does not automatically grant DIT, QC, legal, rights or publication approval.</p>
        <div className="flex flex-wrap gap-3"><Link to="/signup" search={{role:"studio"}} className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-[#041018]">Create Studio Workspace</Link><Link to="/login" className="rounded-full border border-line px-6 py-3 text-sm font-semibold">Sign in</Link></div>
      </article>
    </main>
  );
}
