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
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <BrandMark />
          <div className="flex items-center gap-1 text-sm">
            <SignedOut>
              <Link to="/login" className="rounded-sm px-3 py-2 text-muted hover:text-fg">Sign in</Link>
              <Link to="/signup">
                <Button>Request desk</Button>
              </Link>
            </SignedOut>
            <SignedIn>
              <Link to="/onboarding" className="px-3 py-2 text-accent">Open desk</Link>
              <UserButton />
            </SignedIn>
          </div>
        </div>
      </header>

      <main>
        <section className="border-b border-line">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">StreamVista OPC Pvt Ltd</p>
            <h1 className="mt-3 max-w-2xl font-display text-4xl leading-tight sm:text-5xl">
              Rights, licensing, and delivery for independent screen content.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted">
              Crayons Bridge keeps the title record, rights review, licensing, and delivery lifecycle in one secure desk.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link to="/signup"><Button>Create an account</Button></Link>
              <Link to="/login"><Button variant="outline">Sign in</Button></Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl">Lifecycle</h2>
              <p className="mt-1 text-sm text-muted">Rights first. Payment capture before license. Delivery after capture.</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {TITLE_STATUS_ORDER.map((step, i) => (
              <div key={step} className="rounded-sm border border-line bg-surface px-3 py-2">
                <span className="font-mono text-[10px] text-accent">{String(i + 1).padStart(2, "0")}</span>
                <span className="ml-2 text-xs">{step.replaceAll("_", " ")}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto grid max-w-5xl gap-3 px-4 py-10 sm:grid-cols-3">
            <DeskCard kicker="Creator" title="Submit titles" body="Create records, upload masters privately, and send for review." />
            <DeskCard kicker="Studio" title="Control your slate" body="Manage titles and organization-level rights workflows." />
            <DeskCard kicker="Buyer" title="Buyers see ready titles" body="Catalog visibility follows the readiness lifecycle." />
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto max-w-5xl px-4 py-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">System status</p>
                <p className="mt-1 text-xs text-faint">Integrations intentionally fail closed until configured.</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Status label="Postgres" ok={integrations?.postgres} />
                <Status label="S3" ok={integrations?.s3} />
                <Status label="Razorpay" ok={integrations?.razorpay} />
                <Status label="Mail" ok={integrations?.mail} />
                <Status label="Supabase" ok={integrations?.supabase} />
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function DeskCard({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <article className="rounded-sm border border-line bg-surface p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">{kicker}</p>
      <h3 className="mt-2 font-display text-lg">{title}</h3>
      <p className="mt-1 text-sm leading-5 text-muted">{body}</p>
    </article>
  );
}

function Status({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <span className="rounded-sm border border-line px-2.5 py-1.5">
      {label}: <span className={ok ? "text-ok" : "text-faint"}>{ok ? "ready" : "pending"}</span>
    </span>
  );
}
