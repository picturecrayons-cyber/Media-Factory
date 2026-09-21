import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { getBridgePublicStatus } from "@/lib/bridge/session";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const statusQ = useQuery({ queryKey: ["bridge-public"], queryFn: () => getBridgePublicStatus() });
  const integrations = statusQ.data?.integrations;
  return (
    <div className="min-h-svh bg-bg">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <BrandMark />
          <div className="flex items-center gap-3 text-sm">
            <SignedOut>
              <Link to="/login" className="px-3 py-2 text-muted hover:text-fg">
                Sign in
              </Link>
              <Link to="/signup">
                <Button>Create an account</Button>
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
      <main id="main" className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">
          StreamVista OPC Pvt Ltd
        </p>
        <h1 className="mt-4 max-w-2xl font-display text-4xl leading-tight tracking-tight sm:text-5xl">
          Crayons Bridge
        </h1>
        <p className="mt-3 max-w-xl text-lg text-muted">
          Licensing OS for independent creators, studios and buyers.
        </p>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
          One title record. Rights before money. Delivery after capture.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/signup">
            <Button>Create an account</Button>
          </Link>
          <Link to="/login">
            <Button variant="outline">Sign in</Button>
          </Link>
        </div>
        <p className="mt-10 max-w-xl text-sm leading-relaxed text-faint">
          Private control plane — not a public catalog. Invite-only QC, legal, and finance desks.
          Licensed only after a captured Razorpay payment.
        </p>
        <ul className="mt-12 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
          <EnvChip label="Postgres" ok={integrations?.postgres} />
          <EnvChip label="S3" ok={integrations?.s3} />
          <EnvChip label="Razorpay" ok={integrations?.razorpay} />
          <EnvChip label="Mail" ok={integrations?.mail} />
          <EnvChip label="Supabase pin" ok={integrations?.supabase} />
        </ul>
      </main>
    </div>
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
