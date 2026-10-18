import { createFileRoute } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";

export const Route = createFileRoute("/scope")({ component: ScopeStatus });

type Status = "MET" | "NOT MET" | "NEEDS VERIFICATION";

const deployments = [
  {
    label: "Version A",
    url: "https://bridge-6tjot0bs9-stream-vista-opc-pvt-ltd-s-projects.vercel.app/",
    status: "MET" as const,
    evidence: "HTTP 200; Crayons Bridge title and expected page metadata returned.",
  },
  {
    label: "Version B",
    url: "https://bridge-541atcedq-stream-vista-opc-pvt-ltd-s-projects.vercel.app/",
    status: "MET" as const,
    evidence: "HTTP 200; Crayons Bridge title and expected page metadata returned.",
  },
];

const checks: { area: string; status: Status; evidence: string; next: string }[] = [
  {
    area: "Deployment responds",
    status: "MET",
    evidence: "Both supplied deployment URLs returned HTTP 200 on 18 Oct 2026.",
    next: "No action for basic reachability.",
  },
  {
    area: "Bridge page identity",
    status: "MET",
    evidence: "Both responses use the Crayons Bridge title and expected description/branding metadata.",
    next: "Keep metadata aligned on future releases.",
  },
  {
    area: "Deployment parity",
    status: "NEEDS VERIFICATION",
    evidence: "The deployments serve different JavaScript and CSS bundle names. Bundle differences alone do not prove a functional regression.",
    next: "Run the same authenticated and unauthenticated smoke tests on both versions.",
  },
  {
    area: "Sign-in, session restore and onboarding",
    status: "NEEDS VERIFICATION",
    evidence: "A successful HTML response does not prove the full browser auth flow.",
    next: "Test sign-in, refresh/session restore, sign-out and first-time onboarding on both URLs.",
  },
  {
    area: "RBAC and protected routes",
    status: "NEEDS VERIFICATION",
    evidence: "Protected route behavior was not exercised in this URL check.",
    next: "Verify creator, buyer and internal/admin roles; confirm unauthorized requests are denied server-side.",
  },
  {
    area: "Title workflow, rights and licensing",
    status: "NEEDS VERIFICATION",
    evidence: "No title mutation or rights-gate workflow was executed during the read-only page check.",
    next: "Test a permitted test title through metadata, QC, rights and licensing gates.",
  },
  {
    area: "OCI upload/download and Loop publication",
    status: "NEEDS VERIFICATION",
    evidence: "No media transfer or publication end-to-end test was run.",
    next: "Require a verified upload, signed download and authorized publication E2E result.",
  },
  {
    area: "Razorpay, entitlement and transactional email",
    status: "NEEDS VERIFICATION",
    evidence: "HTTP availability is not evidence of captured-payment entitlement or delivered email.",
    next: "Run sandbox payment/webhook and mail delivery E2E tests before release.",
  },
  {
    area: "Staging Supabase RLS / grants",
    status: "NOT MET",
    evidence: "The latest read-only staging security audit found multiple public-schema tables with RLS disabled, including legacy auth tables and Bridge/Loop data; some also have anon/authenticated grants.",
    next: "Review a table-by-table staging hardening migration and rerun the Supabase security advisor. Do not apply blanket policies.",
  },
  {
    area: "Leaked-password protection",
    status: "NOT MET",
    evidence: "Supabase security advisor reported leaked-password protection disabled in both connected projects.",
    next: "Enable it in Supabase Auth settings, then test the sign-up/password-change flow.",
  },
  {
    area: "Accessibility and production release gates",
    status: "NEEDS VERIFICATION",
    evidence: "The two landing-page responses do not establish full keyboard/screen-reader accessibility or exact-head release readiness.",
    next: "Run automated plus manual accessibility checks and confirm exact-head CI, deployment and integration E2E evidence.",
  },
];

function ScopeStatus() {
  return (
    <RequireBridge allow="internal">
      {(actor) => (
        <BridgeShell actor={actor} title="Scope & Status">
          <div className="space-y-6">
            <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Release checklist · Read-only evidence</p>
              <h2 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">What is met, and what is not</h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
                A simple comparison of the two supplied Bridge deployments. This page records the latest reviewed evidence; it does not run live tests or certify production readiness.
              </p>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {deployments.map((deployment) => (
                  <article key={deployment.url} className="min-w-0 rounded-2xl border border-line bg-elevated p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold">{deployment.label}</h3>
                      <StatusLabel status={deployment.status} />
                    </div>
                    <a href={deployment.url} target="_blank" rel="noreferrer" className="mt-2 block break-all text-xs text-accent underline underline-offset-4">
                      {deployment.url}
                    </a>
                    <p className="mt-3 text-sm text-muted">{deployment.evidence}</p>
                  </article>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted">Checked 18 Oct 2026. Both URLs responded successfully; bundle names differ, so behavior parity remains unverified.</p>
            </section>

            <section className="grid gap-3 sm:grid-cols-3" aria-label="Status totals">
              <SummaryCard label="Met" count={checks.filter((check) => check.status === "MET").length} />
              <SummaryCard label="Not met" count={checks.filter((check) => check.status === "NOT MET").length} />
              <SummaryCard label="Needs verification" count={checks.filter((check) => check.status === "NEEDS VERIFICATION").length} />
            </section>

            <section className="overflow-hidden rounded-3xl border border-line bg-surface">
              <div className="border-b border-line p-5 sm:p-6">
                <h3 className="font-display text-2xl font-semibold">Scope checklist</h3>
                <p className="mt-1 text-sm text-muted">Simple status, evidence and next action. Unknown is not treated as passed.</p>
              </div>
              <div className="divide-y divide-line">
                {checks.map((check) => (
                  <article key={check.area} className="grid gap-3 p-5 sm:grid-cols-[minmax(10rem,0.8fr)_auto_minmax(0,2fr)] sm:items-start sm:p-6">
                    <h4 className="font-semibold">{check.area}</h4>
                    <StatusLabel status={check.status} />
                    <div className="space-y-2">
                      <p className="text-sm leading-relaxed text-muted">{check.evidence}</p>
                      <p className="text-sm"><span className="font-semibold">Next:</span> {check.next}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <p className="text-xs leading-relaxed text-muted">
              Production remains on HOLD until exact-head CI, deployment verification and required auth/RBAC, media, payment, email and publication end-to-end checks pass. No production or database changes were made for this checklist.
            </p>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function StatusLabel({ status }: { status: Status }) {
  const styles: Record<Status, string> = {
    MET: "border-emerald-700/30 bg-emerald-50 text-emerald-800",
    "NOT MET": "border-red-700/30 bg-red-50 text-red-800",
    "NEEDS VERIFICATION": "border-amber-700/30 bg-amber-50 text-amber-900",
  };
  return <span className={`inline-flex w-fit shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${styles[status]}`}>{status}</span>;
}

function SummaryCard({ label, count }: { label: string; count: number }) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-5">
      <p className="text-xs uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{count}</p>
    </article>
  );
}
