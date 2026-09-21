import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { getBridgePublicStatus } from "@/lib/bridge/session";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { TITLE_STATUS_ORDER } from "@/lib/bridge/lifecycle";
import type { TitleStatus } from "@/lib/bridge/types";

export const Route = createFileRoute("/")({ component: Home });

const STEP_LABEL: Record<TitleStatus, string> = {
  DRAFT: "Draft",
  UPLOADING: "Uploading",
  PREPARING: "Preparing",
  QC_REVIEW: "QC review",
  RIGHTS_REVIEW: "Rights review",
  LICENSING_READY: "Licensing ready",
  LIVE_FOR_BUYERS: "Live for buyers",
  IN_NEGOTIATION: "In negotiation",
  LICENSED: "Licensed",
  DELIVERED: "Delivered",
};

function Home() {
  const statusQ = useQuery({ queryKey: ["bridge-public"], queryFn: () => getBridgePublicStatus() });
  const integrations = statusQ.data?.integrations;
  return (
    <div className="min-h-svh bg-bg">
      <header className="border-b border-line">
        <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between px-4 sm:px-6">
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
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 lg:min-h-[calc(100svh-4.5rem)] lg:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)] lg:gap-12 lg:py-8">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">
                StreamVista OPC Pvt Ltd
              </p>
              <h1 className="mt-4 max-w-xl font-display text-4xl leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                One title record. Rights before money. Delivery after capture.
              </h1>
              <p className="mt-5 max-w-md text-base leading-relaxed text-muted">
                Licensing OS for independent creators, studios, and buyers. Invite-only QC, legal, and
                finance desks. Nothing is live for buyers until the record is ready.
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
            <aside className="rounded-md border border-line-strong bg-surface/90 p-5 shadow-lift sm:p-6">
              <div className="flex items-baseline justify-between gap-3 border-b border-line pb-4">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Title record</p>
                  <p className="mt-1 font-display text-xl">Forward-only lifecycle</p>
                </div>
                <span className="font-mono text-[11px] tabular-nums text-faint">10 gates</span>
              </div>
              <ol className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {TITLE_STATUS_ORDER.map((step, i) => (
                  <li key={step} className="flex items-baseline gap-3 py-1">
                    <span className="w-6 shrink-0 font-mono text-[11px] tabular-nums text-accent">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-sm">{STEP_LABEL[step]}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-muted">
                Licensed is granted only after a captured Razorpay payment — never by a toggle.
              </p>
            </aside>
          </div>
        </section>
        <section className="border-b border-line">
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
        <section>
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
    <article className="rounded-md border border-line bg-surface p-5">
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
