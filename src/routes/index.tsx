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
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <BrandMark />
          <div className="flex items-center gap-3 text-sm">
            <SignedOut>
              <Link to="/login" className="px-3 py-2 text-muted hover:text-fg">
                Sign in
              </Link>
              <Link to="/signup">
                <Button>Request desk</Button>
              </Link>
            </SignedOut>
            <SignedIn>
              <Link to="/onboarding" className="text-sm text-accent">
                Open desk
              </Link>
              <UserButton />
            </SignedIn>
          </div>
        </div>
      </header>
      <main>
        <section className="lab-grid border-b border-line">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">
              StreamVista OPC Pvt Ltd
            </p>
            <h1 className="mt-4 max-w-3xl font-display text-4xl leading-tight sm:text-6xl">
              One title record. Rights before money. Delivery after capture.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted">
              Crayons Bridge is the licensing OS for independent creators, studios, and buyers. Invite-only
              internal desks handle QC, legal, and finance. Nothing is live for buyers until the record is ready.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/signup">
                <Button>Create an account</Button>
              </Link>
              <Link to="/login">
                <Button variant="outline">Sign in</Button>
              </Link>
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="font-display text-2xl">Lifecycle</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Forward-only. Licensed is granted only after a captured Razorpay payment — never by a toggle.
          </p>
          <ol className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {TITLE_STATUS_ORDER.map((step, i) => (
              <li key={step} className="rounded-sm border border-line bg-surface px-3 py-4">
                <span className="font-mono text-[11px] text-accent tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <p className="mt-2 text-sm">{step.replaceAll("_", " ")}</p>
              </li>
            ))}
          </ol>
        </section>
        <section className="border-t border-line">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:grid-cols-3 sm:px-6">
            <DeskCard
              kicker="Independent creator"
              title="Your titles"
              body="Draft, upload masters to private S3, submit for QC. No catalog storefront."
            />
            <DeskCard
              kicker="Studio"
              title="Slate control"
              body="Same title record, organization on the profile. Rights review before buyers see a frame."
            />
            <DeskCard
              kicker="Buyer"
              title="Live catalog only"
              body="Orders are server-signed. Entitlement appears after capture, not after a client callback."
            />
          </div>
        </section>
        <section className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">Environment</p>
            <ul className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
              <EnvChip label="Postgres" ok={integrations?.postgres} />
              <EnvChip label="S3" ok={integrations?.s3} />
              <EnvChip label="Razorpay" ok={integrations?.razorpay} />
              <EnvChip label="Mail" ok={integrations?.mail} />
              <EnvChip label="Supabase pin" ok={integrations?.supabase} />
            </ul>
            <p className="mt-6 text-xs leading-relaxed text-faint">
              Missing integrations fail closed. This desk does not mint fake revenue, mock sessions, or grant
              licenses from localStorage.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

function DeskCard({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <article className="rounded-sm border border-line bg-surface p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">{kicker}</p>
      <h3 className="mt-3 font-display text-xl">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </article>
  );
}

function EnvChip({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <li className="flex items-center justify-between rounded-sm border border-line px-3 py-2">
      <span>{label}</span>
      <span className={ok ? "text-ok" : "text-faint"}>{ok ? "configured" : "unset"}</span>
    </li>
  );
}
