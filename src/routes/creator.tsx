import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";
import { InsuranceReadinessPanel } from "@/components/bridge/insurance-readiness-panel";
import { InsuranceReadinessPanel } from "@/components/bridge/insurance-readiness-panel";

export const Route = createFileRoute("/creator")({ component: Creator });

function Creator() {
  return (
    <RequireBridge allow="creator">
      {(actor) => (
        <BridgeShell actor={actor} title="Creator desk">
          <Desk
            role="Creator"
            scope="Own titles only. Upload, update drafts, and read your deliveries."
            opportunity="Submit a title. Bridge clears QC and rights before any buyer can see it."
            steps={["Create title", "Upload assets", "QC and rights", "License", "Delivery"]}
          />
          <section className="mt-8">
            <InsuranceReadinessPanel audience="Creator" />
          </section>
          <section className="mt-8">
            <h2 className="text-lg font-semibold">New title</h2>
            <div className="mt-3"><CreateTitleForm /></div>
          </section>
          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Your titles</h2>
              <Link to="/account" className="text-sm text-muted">Account</Link>
            </div>
            <TitleList empty="No titles yet. Create a draft to start." />
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
