import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/buyers")({ component: Buyers });

function Buyers() {
  return (
    <main className="min-h-screen bg-white px-5 py-12 text-fg sm:px-6">
      <article className="mx-auto max-w-3xl space-y-7 rounded-3xl border border-line bg-surface p-7 sm:p-10">
        <Link to="/" className="text-sm font-semibold text-accent">← Crayons Bridge</Link>
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">B2B licensing · Invite only</p>
        <h1 className="font-display text-4xl font-semibold sm:text-5xl">Discover content for your platform.</h1>
        <p className="text-base leading-7 text-muted">Crayons Bridge provides approved OTT, satellite, digital, television and syndication buyers with title-specific discovery, screener access and licensing workflows.</p>
        <section className="rounded-2xl border border-line p-5"><h2 className="font-semibold">Controlled buyer access</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted"><li>Buyer accounts are approved and invitation-controlled.</li><li>Only titles authorized for buyer discovery may be listed.</li><li>Screeners and delivery permissions are limited by title, scope, territory and time.</li><li>Licence execution and payment do not create sublicensing or onward-delivery rights unless expressly granted in writing.</li></ul></section>
        <p className="text-sm leading-7 text-muted">A request does not create an account or reveal the private catalogue. The Company will review the organization, contact and intended use before issuing access.</p>
        <Link to="/contact" search={{inquiry:"buyer"}} className="inline-flex rounded-full bg-accent px-6 py-3 text-sm font-semibold text-[#041018]">Request Buyer Access</Link>
      </article>
    </main>
  );
}
