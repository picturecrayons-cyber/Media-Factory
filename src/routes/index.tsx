import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SignedOut } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getBridgeSession } from "@/lib/bridge/session";


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

function Home() {
  const { user, isPending } = useCurrentUserState();
  const sessionQ = useQuery({
    queryKey: ["bridge-session", user?.id],
    queryFn: () => getBridgeSession(),
    enabled: !isPending && Boolean(user),
    retry: false,
  });

  if (isPending || (user && sessionQ.isPending)) {
    return (
      <main className="grid min-h-screen place-items-center bg-bg p-6">
        <p className="text-sm text-gray-400">Opening workspace…</p>
      </main>
    );
  }

  if (user) {
    if (sessionQ.data?.home) return <Navigate to={sessionQ.data.home as any} replace />;
    if (!sessionQ.data?.profile) return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white antialiased selection:bg-amber-500/30 selection:text-white">
      <header className="sticky top-0 z-50 border-b border-[#1a1a1a] bg-[#0a0a0a]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-3.5 sm:px-6 lg:px-8">
          <Link to="/" aria-label="Crayons Bridge home" className="flex items-center gap-3">
            <img src="/logo/crayons-bridge-logo-3d.png" width={32} height={32} alt="" className="h-8 w-8 object-contain" />
            <span className="text-sm font-semibold tracking-wide text-white">Crayons Bridge</span>
          </Link>

          <div className="flex items-center gap-3 text-sm">
            <SignedOut>
              <Link to="/login" className="rounded-full px-4 py-2 text-sm font-medium text-gray-300 hover:text-white">Sign in</Link>
              <Link to="/signup">
                <Button size="sm" className="rounded-full border border-amber-400 bg-amber-500 px-4 py-1.5 text-xs font-semibold text-black hover:bg-amber-400">
                  Create account
                </Button>
              </Link>
            </SignedOut>
          </div>
        </div>
      </header>

      <main>
        <section className="bridge-home-hero border-b border-[#1a1a1a] bg-[#0a0a0a]">
          <div className="mx-auto max-w-7xl px-5 py-14 text-center sm:px-6 sm:py-16 lg:py-20">
            <div className="mx-auto max-w-5xl">
                            <h1 className="bridge-hero-copy mx-auto mt-8 max-w-4xl font-display text-[2.45rem] font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-5xl lg:text-[3.9rem]">
                One bridge from content to market.
              </h1>
              <p className="bridge-hero-subcopy mx-auto mt-4 max-w-2xl text-base leading-7 text-gray-300 sm:text-lg">
                Prepare. Protect. License. Deliver.
              </p>

              <div className="bridge-hero-actions mt-7 flex flex-wrap items-center justify-center gap-3 sm:mt-8">
                <Link to="/signup">
                  <Button className="h-11 rounded-full px-6 text-sm font-semibold shadow-xs">
                    Create account
                  </Button>
                </Link>
                <Link to="/login" className="px-2 text-sm font-semibold text-gray-300 transition-colors hover:text-white">Sign in</Link>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-b border-[#1a1a1a] bg-[#111111] py-10 sm:py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                From upload to delivery.
              </h2>
            </div>

            <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-[#1a1a1a] bg-line sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {WORKFLOW_STEPS.map((step, idx) => (
                <div
                  key={step.step}
                  className="bridge-workflow-card flex min-h-40 flex-col justify-between bg-[#111111] p-5"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-amber-400">{step.step}</span>
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

        <section id="creators" className="border-b border-[#1a1a1a] bg-[#0a0a0a] py-14 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
                Built for the media business.
              </h2>
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
              <div className="flex flex-col justify-between rounded-2xl border border-[#1a1a1a] bg-[#111111] p-7 sm:p-8">
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
                    className="inline-flex items-center text-xs font-semibold text-amber-400 hover:underline"
                  >
                    Start as Creator →
                  </Link>
                </div>
              </div>

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

              <div
                id="investors"
                className="flex flex-col justify-between rounded-3xl border border-line bg-elevated p-7 sm:p-8"
              >
                <div>
                  <h3 className="font-display text-2xl font-semibold text-fg">Investors</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    Track approved title participation and investment records.
                  </p>
                </div>
                <div className="mt-8 pt-5 border-t border-line">
                  <Link
                    to="/contact"
                    className="inline-flex items-center text-xs font-semibold text-accent hover:underline"
                  >
                    Request Investor Access →
                  </Link>
                </div>
              </div>

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

        <section className="border-b border-[#1a1a1a] bg-[#111111] py-12 sm:py-16">
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


            </div>
          </div>
        </section>

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

      <footer className="bg-[#0a0a0a] py-10 px-4 sm:px-6 text-xs text-gray-400">
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
            <Link to="/privacy" className="hover:text-fg transition-colors">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-fg transition-colors">
              Terms
            </Link>
            <Link to="/contact" className="hover:text-fg transition-colors">
              Contact
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
