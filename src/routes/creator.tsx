import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { TitleList } from "@/components/bridge/title-desk";

export const Route = createFileRoute("/creator")({ component: Creator });

function Creator() {
  return (
    <RequireBridge allow="creator">
      {(actor) => (
        <BridgeShell actor={actor} title="Creator desk">
          <Desk
            role="Creator"
            scope="Your titles only. Keep ownership, rights evidence, and delivery status in one workspace."
            opportunity="Prepare a buyer-ready title package. Submission creates a DRAFT; Bridge reviews proof before buyer visibility."
            steps={["Submit title", "Upload evidence", "QC and rights", "License", "Deliver"]}
          />
          <section className="mt-6 grid gap-3 sm:grid-cols-3">
            <article className="rounded-sm border border-line p-4">
              <p className="text-xs uppercase tracking-widest text-muted">Workspace</p>
              <p className="mt-2 font-display text-xl">My title slate</p>
              <p className="mt-1 text-sm text-muted">Review your submissions and current status.</p>
            </article>
            <article className="rounded-sm border border-line p-4">
              <p className="text-xs uppercase tracking-widest text-muted">Rights review</p>
              <p className="mt-2 font-display text-xl">Evidence required</p>
              <p className="mt-1 text-sm text-muted">Authorization attestations do not replace signed rights documents.</p>
            </article>
            <article className="rounded-sm border border-line p-4">
              <p className="text-xs uppercase tracking-widest text-muted">Buyer visibility</p>
              <p className="mt-2 font-display text-xl">Approval gated</p>
              <p className="mt-1 text-sm text-muted">No title is published by submission alone.</p>
            </article>
          </section>
          <section className="mt-8 rounded-sm border border-line bg-surface p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-accent">New submission</p>
                <h2 className="mt-2 font-display text-2xl font-semibold">Prepare a title for rights review</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">Capture the title details, language and territories, exploitation rights, rights window, authorization basis, and intended buyer channels. You can add private evidence in the title workspace after submission.</p>
              </div>
              <Link to="/submit-film" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-bg transition hover:opacity-90">Submit a title <span aria-hidden="true" className="ml-2">→</span></Link>
            </div>
          </section>
          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Your titles</h2>
                <p className="mt-1 text-sm text-muted">Only titles owned by your verified account or permitted studio workspace appear here.</p>
              </div>
              <Link to="/account" className="text-sm text-muted underline underline-offset-4">Account</Link>
            </div>
            <TitleList empty="No titles yet. Submit your first title to start the rights-review process." />
          </section>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

export function Desk({ role, scope, opportunity, steps }: { role: string; scope: string; opportunity: string; steps: string[] }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-sm border border-line p-4">
          <p className="text-xs uppercase tracking-widest text-muted">Scope · {role}</p>
          <p className="mt-2 text-sm">{scope}</p>
        </article>
        <article className="rounded-sm border border-line p-4">
          <p className="text-xs uppercase tracking-widest text-muted">Opportunity</p>
          <p className="mt-2 text-sm">{opportunity}</p>
        </article>
      </div>
      <ol className="flex flex-wrap gap-2 text-sm">
        {steps.map((step, i) => (
          <li key={step} className="rounded-sm border border-line px-3 py-1.5">{i + 1}. {step}</li>
        ))}
      </ol>
    </div>
  );
}
