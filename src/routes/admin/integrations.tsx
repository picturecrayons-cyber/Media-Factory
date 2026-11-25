import { createFileRoute } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";

export const Route = createFileRoute("/admin/integrations")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: IntegrationHub,
});

type Provider = {
  name: string;
  category: string;
  description: string;
  readOnly: string[];
  gated: string[];
  href?: string;
  hrefLabel?: string;
};

const providers: Provider[] = [
  {
    name: "Supabase",
    category: "Database & Auth",
    description: "Project health, migration ledger, RLS and grants inspection.",
    readOnly: ["Project/environment identity", "Migration and schema health", "RLS and privilege review"],
    gated: ["Schema changes and migrations", "Auth or policy changes"],
  },
  {
    name: "Vercel",
    category: "Hosting & Preview",
    description: "Bridge and Loop project visibility, Preview deployments and build diagnostics.",
    readOnly: ["Project and deployment status", "Preview build logs", "Environment target verification"],
    gated: ["Deployment promotion", "Environment variable changes", "Production rollback"],
  },
  {
    name: "GitHub",
    category: "Source & CI",
    description: "Repository, pull request, review and workflow visibility.",
    readOnly: ["Pull requests and changed files", "CI checks and workflow logs", "Branch and release status"],
    gated: ["Merge and branch protection changes", "Repository settings and secrets"],
  },
  {
    name: "Razorpay",
    category: "Payments",
    description: "Payment, order and reconciliation visibility without moving money.",
    readOnly: ["Payment and order status", "Settlement and reconciliation reports", "Webhook health"],
    gated: ["Refunds, captures and transfers", "Live payment configuration"],
  },
  {
    name: "Hostinger Mail",
    category: "Email",
    description: "Mailbox health, inbound messages and draft workflows.",
    readOnly: ["Mailbox and delivery status", "Inbound message visibility", "Draft preparation"],
    gated: ["Sending or forwarding mail", "Mailbox and routing changes"],
  },
  {
    name: "Storage / OCI",
    category: "Media assets",
    description: "Bucket health, object verification and storage usage.",
    readOnly: ["Bucket and object metadata", "Asset verification status", "Storage usage reports"],
    gated: ["Upload, restore or move objects", "Deletion and lifecycle changes"],
  },
  {
    name: "Sales / CRM",
    category: "Commercial pipeline",
    description: "Lead, account, opportunity and customer activity visibility.",
    readOnly: ["Lead and account records", "Pipeline and activity summaries", "Customer follow-up context"],
    gated: ["Create or update CRM records", "Outbound customer communications"],
  },
  {
    name: "Crayons Loop",
    category: "Consumer OTT",
    description: "Loop operations remain separate from Bridge rights and licensing authority.",
    readOnly: ["Publication and playback health", "Catalogue and buyer-access status", "Consumer app diagnostics"],
    gated: ["Publication and catalogue changes", "Playback entitlement changes"],
    href: "https://crayonsloop.in/",
    hrefLabel: "Open Loop",
  },
];

function IntegrationHub() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Integration & Operations Hub">
          <div className="space-y-6">
            <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Super Admin · Control plane</p>
              <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">One place to oversee Bridge and Loop services.</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                A unified operations workspace. Provider accounts are not connected by this source change; each card clearly separates planned read-only visibility from actions that require a separate approval.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">Default: READ-ONLY</span>
                <span className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">Production: HOLD</span>
                <span className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">No provider credentials stored</span>
              </div>
            </section>

            <section aria-label="Environment guardrails" className="grid gap-3 sm:grid-cols-3">
              <Guard title="STAGING" detail="Testing DB · jbymleftneggcgutlcqu" status="Read-only inspection only" />
              <Guard title="PREVIEW" detail="Bridge Preview project" status="Next verification target" />
              <Guard title="PRODUCTION" detail="Bridge production services" status="HOLD · No live actions" />
            </section>

            <section>
              <div className="mb-3">
                <h3 className="font-display text-xl font-semibold">Connected service catalogue</h3>
                <p className="mt-1 text-sm text-muted">Connection state is intentionally shown as not connected until a provider OAuth/API integration is configured and verified.</p>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {providers.map((provider) => (
                  <article key={provider.name} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{provider.category}</p>
                        <h4 className="mt-1 text-lg font-semibold">{provider.name}</h4>
                      </div>
                      <span className="rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-muted">Not connected</span>
                    </div>
                    <p className="mt-2 text-sm text-muted">{provider.description}</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Read-only scope</p>
                        <ul className="mt-2 space-y-1.5 text-sm">
                          {provider.readOnly.map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true" className="text-accent">•</span><span>{item}</span></li>)}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Separate approval required</p>
                        <ul className="mt-2 space-y-1.5 text-sm text-muted">
                          {provider.gated.map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">⛔</span><span>{item}</span></li>)}
                        </ul>
                      </div>
                    </div>
                    {provider.href ? <a className="mt-4 inline-flex text-sm font-semibold text-accent hover:underline" href={provider.href} target="_blank" rel="noreferrer">{provider.hrefLabel} ↗</a> : null}
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
              <h3 className="font-semibold">Operational safety rules</h3>
              <ul className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-2">
                <li>• Every provider action must record actor, provider, target, environment and outcome.</li>
                <li>• Use least-privilege OAuth scopes or server-side API credentials only.</li>
                <li>• No secrets in browser code, source files, logs or chat messages.</li>
                <li>• Payment, email-send, storage-delete and Production actions require independent approval.</li>
                <li>• Bridge authorizes; Loop delivers. Loop Admin does not inherit Bridge rights or finance access.</li>
                <li>• No paid provider plans or usage upgrades are included in this implementation.</li>
              </ul>
            </section>
            <p className="text-xs text-muted">This is the source-level operations hub shell, not a live-connected provider console. No external provider API calls, database writes, payments, emails, storage mutations or deployments are performed from this page.</p>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function Guard({ title, detail, status }: { title: string; detail: string; status: string }) {
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</p>
      <p className="mt-2 text-sm font-medium">{detail}</p>
      <p className="mt-2 text-xs text-muted">{status}</p>
    </article>
  );
}
