import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";

const CRAYONS_LOOP_URL = "https://crayonsloop.com/";

export const Route = createFileRoute("/")({ component: Home });

const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Upload",
    description: "Add masters and supporting assets.",
  },
  {
    step: "02",
    title: "QC",
    description: "Review technical readiness.",
  },
  {
    step: "03",
    title: "Rights",
    description: "Manage ownership and availability.",
  },
  {
    step: "04",
    title: "License",
    description: "Manage screeners and deals.",
  },
  {
    step: "05",
    title: "Deliver",
    description: "Authorize secure distribution.",
  },
  {
    step: "06",
    title: "Earn",
    description: "Track revenue activity.",
  },
];

const TRUST_PILLARS = [
  "Secure Storage",
  "QC",
  "Rights",
  "Licensing",
  "Delivery",
];

function Home() {
  return (
    <div className="min-h-screen bg-bg text-fg antialiased selection:bg-accent/20 selection:text-fg">
      {/* 1. Header */}
      <header className="sticky top-0 z-50 border-b border-line bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-3.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-6 lg:gap-8">
            <BrandMark />
            </div>

          <div className="flex items-center gap-3 text-sm">
            <SignedOut>
              <Link to="/signup">
                <Button size="sm" className="rounded-full px-4 py-1.5 text-xs font-semibold shadow-xs">
                  Create account
                </Button>
              </Link>
            </SignedOut>

            <SignedIn>
              <Link
                to="/dashboard"
                className="rounded-full bg-accent-soft px-3.5 py-1.5 text-xs font-semibold text-accent hover:opacity-90 transition-opacity"
              >
                Open workspace
              </Link>
              <UserButton />
            </SignedIn>
          </div>
        </div>
      </header>

      <main>
        {/* 2. Hero */}
        <section className="border-b border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 lg:py-24">
            <div className="max-w-4xl">
              <img
                src="/brand/logo.png"
                alt="Crayons Bridge"
                className="bridge-hero-logo h-auto w-full max-w-[520px] object-contain sm:max-w-[620px] lg:max-w-[720px]"
              />
              <h1 className="mt-8 max-w-3xl font-display text-[2.45rem] font-semibold leading-[1.02] tracking-[-0.04em] text-fg sm:text-5xl lg:text-[3.9rem]">
                One bridge from content to market.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">
                The professional workspace for preparing, protecting, licensing and delivering film and television.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3 sm:mt-8">
                <Link to="/signup">
                  <Button className="h-11 rounded-full px-6 text-sm font-semibold shadow-xs">
                    Create account
                  </Button>
                </Link>
                <Link to="/login" className="px-2 text-sm font-semibold text-muted hover:text-fg transition-colors">Sign in</Link>
              </div>

            </div>
          </div>
        </section>

        {/* 3. How It Works */}
        <section id="how-it-works" className="border-b border-line bg-surface/50 py-10 sm:py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
                From upload to delivery.
              </h2>
            </div>

            <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {WORKFLOW_STEPS.map((step, idx) => (
                <div
                  key={step.step}
                  className="flex min-h-40 flex-col justify-between bg-surface p-5"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-accent">{step.step}</span>
                      {idx < WORKFLOW_STEPS.length - 1 ? (
                        <span className="hidden lg:inline text-faint text-xs">→</span>
                      ) : null}
                    </div>
                    <h3 className="mt-3 font-display text-lg font-semibold text-fg">
                      {step.title}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4. Audiences: Creators, Studios, Buyers */}
        <section id="creators" className="border-b border-line bg-surface py-14 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
                Built for the media business.
              </h2>
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {/* Creators Card */}
              <div className="flex flex-col justify-between rounded-3xl border border-line bg-elevated p-7 sm:p-8">
                <div>
                  <h3 className="font-display text-2xl font-semibold text-fg">
                    Creators
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    Manage your titles from upload to delivery.
                  </p>
                </div>
                <div className="mt-8 pt-5 border-t border-line">
                  <Link
                    to="/signup"
                    search={{ role: "creator" }}
                    className="inline-flex items-center text-xs font-semibold text-accent hover:underline"
                  >
                    Start as Creator →
                  </Link>
                </div>
              </div>

              {/* Studios Card */}
              <div
                id="studios"
                className="flex flex-col justify-between rounded-3xl border border-line bg-elevated p-7 sm:p-8"
              >
                <div>
                  <h3 className="font-display text-2xl font-semibold text-fg">
                    Studios
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    Manage catalogs, teams and rights.
                  </p>
                </div>
                <div className="mt-8 pt-5 border-t border-line">
                  <Link
                    to="/signup"
                    search={{ role: "studio" }}
                    className="inline-flex items-center text-xs font-semibold text-accent hover:underline"
                  >
                    Create Studio Workspace →
                  </Link>
                </div>
              </div>

              {/* Buyers Card */}
              <div
                id="buyers"
                className="flex flex-col justify-between rounded-3xl border border-line bg-elevated p-7 sm:p-8"
              >
                <div>
                  <h3 className="font-display text-2xl font-semibold text-fg">
                    Buyers
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    Discover titles and manage licensing.
                  </p>
                </div>
                <div className="mt-8 pt-5 border-t border-line">
                  <Link
                    to="/signup"
                    search={{ role: "buyer" }}
                    className="inline-flex items-center text-xs font-semibold text-accent hover:underline"
                  >
                    Explore Buyer Access →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Bridge + Loop (Compact Strip) */}
        <section className="border-b border-line bg-surface/50 py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 rounded-2xl border border-line bg-surface p-6 sm:p-8">
              <div>
                <h3 className="font-display text-xl font-semibold text-fg">
                  From rights to audience.
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted max-w-2xl">
                  Crayons Bridge manages rights, licensing and distribution authorization. Crayons
                  Loop is the consumer streaming experience.
                </p>
              </div>

              <div className="shrink-0">
                <a
                  href={CRAYONS_LOOP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-elevated px-5 py-2.5 text-xs font-semibold text-fg hover:border-line-strong hover:bg-accent-soft hover:text-accent transition-all"
                >
                  <span>Explore Crayons Loop</span>
                  <span className="text-xs">↗</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Final CTA */}
        <section className="border-b border-line bg-surface py-14 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
                Ready to move your content forward?
              </h2>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link to="/signup">
                  <Button className="h-11 rounded-full px-6 text-sm font-semibold shadow-xs">
                    Create account
                  </Button>
                </Link>
                <Link to="/login">
                  <Button
                    variant="outline"
                    className="h-11 rounded-full border-line px-6 text-sm font-semibold hover:border-line-strong"
                  >
                    Sign in
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 7. Footer */}
      <footer className="bg-surface py-10 px-4 sm:px-6 text-xs text-muted">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="font-semibold text-fg">Crayons Bridge</span>
            <span className="mx-2 text-muted/40">·</span>
            <span>© 2026 StreamVista OPC Pvt Ltd.</span>
          </div>

          <nav
            aria-label="Footer Legal and External Links"
            className="flex flex-wrap items-center gap-5 text-xs text-muted"
          >
            <a href="mailto:privacy@streamvista.com" className="hover:text-fg transition-colors">
              Privacy
            </a>
            <a href="mailto:legal@streamvista.com" className="hover:text-fg transition-colors">
              Terms
            </a>
            <a href="mailto:contact@streamvista.com" className="hover:text-fg transition-colors">
              Contact
            </a>
            <a
              href={CRAYONS_LOOP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fg hover:text-accent font-semibold transition-colors flex items-center gap-0.5"
            >
              <span>Crayons Loop</span>
              <span className="text-[10px]">↗</span>
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
