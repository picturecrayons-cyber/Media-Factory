import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { TITLE_STATUS_ORDER } from "@/lib/bridge/lifecycle";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
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
              <h1 className="mt-4 max-w-3xl font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">One bridge from content to market.</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">Upload masters, clear rights, license securely, authorize distribution and track delivery from one professional workspace.</p>
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
          <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">One workspace</p>
            <h2 className="mt-2 font-display text-3xl font-semibold">Role-based access. Title-centred operations.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
              Creators, studios, buyers and invited internal teams enter the same Bridge workspace. Account type sets context; server-enforced permissions decide which titles, modules and actions are available.
            </p>
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
      </main>
    </div>
  );
}
