import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/investors")({ component: Investors });

function Investors() {
  return (
    <main className="min-h-screen bg-white px-5 py-12 text-fg sm:px-6">
      <article className="mx-auto max-w-3xl space-y-7 rounded-3xl border border-line bg-surface p-7 sm:p-10">
        <Link to="/" className="text-sm font-semibold text-accent">← Crayons Bridge</Link>
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Investor access · By approval</p>
        <h1 className="font-display text-4xl font-semibold sm:text-5xl">Follow approved title participation.</h1>
        <p className="text-base leading-7 text-muted">Investor workspaces are provisioned only after identity, agreement and access review. Approved users may receive read-only visibility into their specific participation and related records.</p>
        <section className="rounded-2xl border border-line p-5"><h2 className="font-semibold">What the workspace may show</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted"><li>Title participation covered by an approved written agreement.</li><li>Recorded investment documentation and status.</li><li>Contractual recoupment or revenue-share information where verified and enabled.</li></ul></section>
        <p className="text-sm leading-7 text-muted">An access request, account or dashboard view is not an offer to invest, financial advice, a promise of returns or confirmation of an investment. Each investment requires separately reviewed documentation.</p>
        <Link to="/contact" search={{inquiry:"investor"}} className="inline-flex rounded-full bg-accent px-6 py-3 text-sm font-semibold text-[#041018]">Request Investor Access</Link>
      </article>
    </main>
  );
}
