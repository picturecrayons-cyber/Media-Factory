import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/communications")({
  component: AgentCommunicationsPage,
});

function AgentCommunicationsPage() {
  return (
    <RequireBridge allow="internal">
      {(actor) => {
        const isAdmin =
          actor.internalRole === "admin" || actor.internalRole === "super_admin";

        if (!isAdmin) {
          return (
            <BridgeShell actor={actor} title="Agent communications">
              <section className="rounded-2xl border border-line bg-surface p-6">
                <h2 className="font-display text-xl font-semibold">
                  Admin access required
                </h2>
                <p className="mt-2 text-sm text-muted">
                  Agent communications and payment operations are restricted to
                  Bridge administrators.
                </p>
              </section>
            </BridgeShell>
          );
        }

        return (
          <BridgeShell actor={actor} title="Agent communications">
            <div className="space-y-5">
              <section className="rounded-2xl border border-line bg-surface p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                  Crayons Bridge · Operations
                </p>
                <h2 className="mt-1 font-display text-2xl font-semibold">
                  Agent communication centre
                </h2>
                <p className="mt-2 max-w-3xl text-sm text-muted">
                  A controlled overview for agent notices, inbound email,
                  payment verification and release evidence. Integration states
                  below are reported as unverified until live staging evidence is
                  recorded; this page does not send email, change webhook state or
                  initiate payments.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to="/admin"><Button variant="outline">Back to admin</Button></Link>
                  <a href="https://github.com/picturecrayons-cyber/Media-Factory/issues/374" target="_blank" rel="noreferrer">
                    <Button variant="outline">Implementation issue ↗</Button>
                  </a>
                </div>
              </section>

              <section aria-label="Release gate" className="rounded-2xl border border-amber-500/30 bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">Release gate</p>
                    <h3 className="mt-1 text-lg font-semibold">NO-GO · NOT CERTIFIED</h3>
                    <p className="mt-1 text-sm text-muted">
                      Preview/staging only. Production promotion and real payment
                      processing remain blocked pending verified evidence.
                    </p>
                  </div>
                  <span className="rounded-full border border-amber-500/40 px-3 py-1 text-xs font-semibold">HOLD</span>
                </div>
              </section>

              <section aria-label="Integration status" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <IntegrationCard
                  title="Supabase Staging"
                  status="Schema/policies review required"
                  detail="Use the staging project only. Confirm RLS policies, organization scope, and agent/admin role tests before enabling writes."
                />
                <IntegrationCard
                  title="Hostinger Mail"
                  status="Inbound webhook PAUSED"
                  detail="Receiver authentication, replay protection, event persistence and staging isolation must be verified before the webhook is enabled."
                />
                <IntegrationCard
                  title="Razorpay"
                  status="Test Mode verification required"
                  detail="Prove signature validation, amount/currency/order matching, idempotency, persisted payment state and entitlement updates with test transactions only."
                />
                <IntegrationCard
                  title="Vercel Preview"
                  status="Deployment evidence missing"
                  detail="Record the exact commit SHA, Preview URL, runtime staging target and CI results. Connector access currently needs re-verification."
                />
                <IntegrationCard
                  title="GitHub"
                  status="Issue #374 · Open"
                  detail="Track implementation, tests, exact-SHA evidence and independent review. Do not merge until all release gates pass."
                />
                <IntegrationCard
                  title="Agent inbox"
                  status="UI scaffold only"
                  detail="Message listing, unread state and delivery actions are not connected yet. Do not treat placeholder status as live message data."
                />
              </section>

              <section className="rounded-2xl border border-line bg-surface p-5">
                <h3 className="font-display text-xl font-semibold">Required verification before activation</h3>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
                  <li>Review existing communication tables and every relevant RLS policy in staging.</li>
                  <li>Run authorized-agent and admin access tests, including cross-organization denial.</li>
                  <li>Verify inbound mail authentication, deduplication, persistence and safe manual review.</li>
                  <li>Run Razorpay Test Mode end-to-end and reconcile payment with entitlement state.</li>
                  <li>Attach exact commit, CI, Preview runtime-isolation and independent-review evidence to the GitHub issue.</li>
                </ol>
              </section>
            </div>
          </BridgeShell>
        );
      }}
    </RequireBridge>
  );
}

function IntegrationCard({
  title,
  status,
  detail,
}: {
  title: string;
  status: string;
  detail: string;
}) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-4">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm font-medium">{status}</p>
      <p className="mt-2 text-sm text-muted">{detail}</p>
    </article>
  );
}
