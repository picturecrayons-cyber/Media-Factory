import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Privacy() {
  return (
    <main className="min-h-screen bg-white px-5 py-12 text-fg sm:px-6">
      <article className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-line bg-surface p-7 sm:p-10">
        <Link to="/" className="text-sm font-semibold text-accent">← Crayons Bridge</Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">StreamVista OPC Pvt Ltd.</p>
          <h1 className="mt-2 font-display text-4xl font-semibold">Privacy</h1>
          <p className="mt-3 text-sm leading-7 text-muted">Crayons Bridge uses account, workspace, title, rights, licensing, delivery, billing, and security information to provide and protect the service.</p>
        </div>
        <section className="space-y-3 text-sm leading-7 text-muted">
          <p>We process information needed to authenticate users, operate workspaces, secure media workflows, maintain audit records, and support transactions and customer requests.</p>
          <p>Access to operational data is limited according to workspace permissions and service requirements. We do not publish private workspace information as part of the public site.</p>
          <p>For privacy questions or requests, email <a className="font-semibold text-accent underline" href="mailto:privacy@streamvista.com">privacy@streamvista.com</a>.</p>
        </section>
        <p className="border-t border-line pt-5 text-xs text-muted">Last updated: 1 October 2026.</p>
      </article>
    </main>
  );
}
