import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({ component: Terms });

function Terms() {
  return (
    <main className="min-h-screen bg-white px-5 py-12 text-fg sm:px-6">
      <article className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-line bg-surface p-7 sm:p-10">
        <Link to="/" className="text-sm font-semibold text-accent">← Crayons Bridge</Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">StreamVista OPC Pvt Ltd.</p>
          <h1 className="mt-2 font-display text-4xl font-semibold">Terms</h1>
          <p className="mt-3 text-sm leading-7 text-muted">These terms govern access to Crayons Bridge and its media supply-chain, rights, licensing, delivery, and related workspace services.</p>
        </div>
        <section className="space-y-3 text-sm leading-7 text-muted">
          <p>Users must provide accurate account information, use only content and rights they are authorized to manage, and comply with applicable laws and contractual obligations.</p>
          <p>Rights, licensing, delivery, payment, and settlement records remain subject to the applicable agreement, authorization, and transaction terms shown in the service. Access may be restricted to protect users, content, or the platform.</p>
          <p>For legal or terms questions, email <a className="font-semibold text-accent underline" href="mailto:legal@streamvista.com">legal@streamvista.com</a>.</p>
        </section>
        <p className="border-t border-line pt-5 text-xs text-muted">Last updated: 1 October 2026.</p>
      </article>
    </main>
  );
}
