import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { getBridgePublicStatus } from "@/lib/bridge/session";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { TITLE_STATUS_ORDER } from "@/lib/bridge/lifecycle";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const statusQ = useQuery({ queryKey: ["bridge-public"], queryFn: () => getBridgePublicStatus() });
  const integrations = statusQ.data?.integrations;

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <BrandMark />
          <div className="flex items-center gap-2 text-sm">
            <SignedOut>
              <Link to="/login" className="rounded-full px-4 py-2 font-medium text-muted hover:bg-accent-soft hover:text-fg">Sign in</Link>
              <Link to="/signup"><Button>Create account</Button></Link>
            </SignedOut>
            <SignedIn>
              <Link to="/onboarding" className="rounded-full bg-accent-soft px-4 py-2 font-medium text-accent">Open workspace</Link>
              <UserButton />
            </SignedIn>
          </div>
        </div>
      </header>

      <main>
        <section className="border-b border-line bg-surface">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_.85fr] lg:py-24">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">StreamVista OPC Pvt Ltd</p>
              <h1 className="mt-4 max-w-3xl font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
                One bridge from content to market.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">
                Upload masters, clear rights, license securely, authorize distribution and track delivery from one professional workspace.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link to="/signup"><Button>Create account</Button></Link>
                <Link to="/login"><Button variant="outline">Sign in</Button></Link>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
                <span>Secure Storage</span><span>Technical QC</span><span>Rights</span><span>Screeners</span><span>Licensing</span>
              </div>
            </div>

            <div className="rounded-[28px] border border-line bg-elevated p-5 shadow-[0_24px_80px_rgba(8,184,232,.12)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Workflow</p>
              <div className="mt-4 grid gap-3">
                {["Upload", "Prepare", "QC", "Rights", "License", "Deliver", "Earn"].map((item, i) => (
                  <div key={item} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">{String(i + 1).padStart(2, "0")}</span>
                    <span className="font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <DeskCard kicker="Creator" title="Submit and manage titles" body="Create durable title records, upload private masters, and move through QC, rights and licensing." cta="/creator" />
            <DeskCard kicker="Studio" title="Run the full slate" body="Manage title operations, rights, licensing, delivery and teams from one control plane." cta="/studio" />
            <DeskCard kicker="Buyer" title="Access ready titles" body="View authorized titles, screeners, negotiations, licenses and deliveries based on permission." cta="/buyer" />
          </div>
        </section>

        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Lifecycle</p>
                <h2 className="mt-2 font-display text-3xl font-semibold">Rights first. Delivery after authorization.</h2>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {TITLE_STATUS_ORDER.map((step, i) => (
                <div key={step} className="rounded-full border border-line bg-elevated px-3 py-2">
                  <span className="text-[10px] font-bold text-accent">{String(i + 1).padStart(2, "0")}</span>
                  <span className="ml-2 text-xs font-medium">{step.replaceAll("_", " ")}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Platform status</p>
              <p className="mt-1 text-sm text-muted">Integrations fail closed until verified.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Status label="Postgres" ok={integrations?.postgres} />
              <Status label="S3" ok={integrations?.s3} />
              <Status label="Razorpay" ok={integrations?.razorpay} />
              <Status label="Mail" ok={integrations?.mail} />
              <Status label="Supabase" ok={integrations?.supabase} />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function DeskCard({ kicker, title, body, cta }: { kicker: string; title: string; body: string; cta: "/creator" | "/studio" | "/buyer" }) {
  return (
    <article className="rounded-3xl border border-line bg-surface p-6 shadow-[0_16px_50px_rgba(19,104,130,.08)]">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">{kicker}</p>
      <h3 className="mt-3 font-display text-2xl font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
      <Link to={cta} className="mt-5 inline-flex text-sm font-semibold text-accent hover:underline">Open workspace →</Link>
    </article>
  );
}

function Status({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <span className="rounded-full border border-line bg-elevated px-3 py-1.5">
      {label}: <span className={ok ? "text-ok" : "text-faint"}>{ok ? "ready" : "pending"}</span>
    </span>
  );
}
