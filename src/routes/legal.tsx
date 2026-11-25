import { createFileRoute, Link } from "@tanstack/react-router";
import { LEGAL_DOCUMENTS } from "@/components/bridge/legal-page";

export const Route = createFileRoute("/legal")({ component: LegalCentre });

function LegalCentre() {
  const entries = Object.entries(LEGAL_DOCUMENTS);
  return <main className="min-h-screen bg-white px-5 py-10 text-fg sm:px-6">
    <section className="mx-auto max-w-5xl rounded-3xl border border-line bg-surface p-6 sm:p-10">
      <Link to="/" className="text-sm font-semibold text-accent">← Crayons Bridge</Link>
      <p className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-muted">StreamVista OPC Pvt Ltd · B2B legal</p>
      <h1 className="mt-2 font-display text-4xl font-semibold">Legal & Compliance</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">Policies for Crayons Bridge business accounts, title submissions, rights evidence, licensing relationships and secure platform use. These documents are Bridge-specific and do not replace Crayons Loop public OTT policies.</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {entries.map(([slug, doc]) => <Link key={slug} to="/legal/$slug" params={{ slug }} className="rounded-2xl border border-line p-5 transition hover:border-accent">
          <h2 className="font-semibold">{doc.title}</h2><p className="mt-2 text-sm leading-6 text-muted">{doc.summary}</p><span className="mt-4 inline-block text-xs font-semibold text-accent">Read policy →</span>
        </Link>)}
      </div>
      <div className="mt-8 flex flex-wrap gap-5 border-t border-line pt-5 text-sm"><Link to="/privacy" className="text-accent hover:underline">Privacy Policy</Link><Link to="/terms" className="text-accent hover:underline">B2B Terms of Use</Link><Link to="/contact" className="text-accent hover:underline">Contact</Link></div>
      <p className="mt-6 text-xs leading-6 text-muted">All new policy pages are draft for legal review. Company legal adviser must confirm statutory roles, contact details, effective dates and final wording before publication as approved policies.</p>
    </section>
  </main>;
}
