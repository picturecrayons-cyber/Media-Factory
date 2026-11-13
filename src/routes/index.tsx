import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SignedOut } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getBridgeSession } from "@/lib/bridge/session";

export const Route = createFileRoute("/")({ component: Home });

const WORKFLOW_STEPS = [
  { step: "01", title: "Upload", description: "Masters, artwork and supporting assets." },
  { step: "02", title: "QC", description: "Technical checks and review progress." },
  { step: "03", title: "Rights", description: "Ownership, permissions and availability." },
  { step: "04", title: "License", description: "Screeners, offers and agreements." },
  { step: "05", title: "Deliver", description: "Authorized, secure distribution." },
  { step: "06", title: "Earn", description: "Track recorded commercial activity." },
];

const AUDIENCES = [
  {
    number: "01",
    title: "Creators",
    description: "Prepare your work, organize assets and follow each title through its rights and licensing journey.",
    action: "Start as Creator",
    to: "/signup" as const,
    search: { role: "creator" },
  },
  {
    number: "02",
    title: "Studios",
    description: "Coordinate your slate, teams, production handoffs, media and title approvals in one workspace.",
    action: "Create Studio Workspace",
    to: "/signup" as const,
    search: { role: "studio" },
  },
  {
    number: "03",
    title: "Buyers",
    description: "Discover available titles and manage licensing conversations within your approved organization.",
    action: "Explore Buyer Access",
    to: "/signup" as const,
    search: { role: "buyer" },
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
      <main className="grid min-h-screen place-items-center bg-white p-6">
        <p className="text-sm text-slate-500">Opening your workspace…</p>
      </main>
    );
  }

  if (user) {
    if (sessionQ.data?.home) return <Navigate to={sessionQ.data.home as any} replace />;
    if (!sessionQ.data?.profile) return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased selection:bg-cyan-100 selection:text-slate-950">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-3.5 sm:px-6 lg:px-8">
          <Link to="/" aria-label="Crayons Bridge home" className="flex shrink-0 items-center">
            <img
              src="/logo/crayons-bridge-logo-3d.png"
              alt="Crayons Bridge"
              width={1840}
              height={1136}
              loading="eager"
              decoding="async"
              draggable={false}
              className="h-10 w-auto max-w-[132px] object-contain sm:h-11 sm:max-w-[144px]"
            />
          </Link>

          <nav aria-label="Main navigation" className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            <a href="#platform" className="transition-colors hover:text-slate-950">Platform</a>
            <a href="#workflow" className="transition-colors hover:text-slate-950">How it works</a>
            <a href="#workspaces" className="transition-colors hover:text-slate-950">Who it serves</a>
            <a href="#authority" className="transition-colors hover:text-slate-950">Bridge to Loop</a>
          </nav>

          <div className="flex shrink-0 items-center gap-3 text-sm">
            <Link to="/login" className="hidden font-semibold text-slate-600 transition-colors hover:text-slate-950 sm:inline-flex">
              Sign in
            </Link>
            <SignedOut>
              <Link to="/signup">
                <Button size="sm" className="rounded-full bg-slate-950 px-5 font-semibold text-white shadow-sm transition hover:bg-cyan-900">
                  Create account
                </Button>
              </Link>
            </SignedOut>
          </div>
        </div>
      </header>

      <main>
        <section id="platform" className="relative isolate overflow-hidden border-b border-slate-200 bg-gradient-to-br from-slate-50 via-white to-cyan-50/70">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-60">
            <div className="absolute -right-28 -top-40 h-[34rem] w-[34rem] rounded-full border border-cyan-200/70" />
            <div className="absolute -right-12 -top-24 h-[26rem] w-[26rem] rounded-full border border-cyan-200/60" />
            <div className="absolute right-20 top-16 h-2 w-2 rounded-full bg-cyan-500" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-200 to-transparent" />
          </div>

          <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.08fr_.92fr] lg:gap-16 lg:px-8 lg:py-28">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white/80 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-900 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-600" />
                Business-class media operations
              </div>

              <h1 className="mt-7 max-w-3xl font-display text-[2.75rem] font-semibold leading-[1.04] tracking-[-0.055em] text-slate-950 sm:text-5xl lg:text-[4.35rem]">
                Media rights, licensing and content distribution.
                <span className="mt-2 block text-cyan-800">Connected in one workspace.</span>
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                Prepare your titles, protect ownership, coordinate quality checks and manage licensing before content is authorized for delivery.
              </p>

              <p className="mt-5 text-sm font-semibold tracking-wide text-slate-800">
                Prepare. Protect. License. Deliver.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/signup">
                  <Button className="h-12 rounded-full bg-cyan-800 px-7 text-sm font-semibold text-white shadow-lg shadow-cyan-900/10 transition hover:bg-cyan-950">
                    Create your workspace
                  </Button>
                </Link>
                <Link to="/login" className="inline-flex h-12 items-center rounded-full border border-slate-300 bg-white/80 px-7 text-sm font-semibold text-slate-800 transition hover:border-slate-500 hover:bg-white">
                  Sign in
                </Link>
              </div>

              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-200 pt-5 text-xs font-medium text-slate-500">
                <span>For creators and studios</span>
                <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:block" />
                <span>For buyers and investors</span>
                <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:block" />
                <span>One rights authority</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-cyan-100/80 via-white to-slate-100 blur-2xl" />
              <div className="relative overflow-hidden rounded-[1.65rem] border border-slate-200 bg-white shadow-[0_28px_90px_-42px_rgba(15,45,65,0.38)]">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-800">The Bridge workflow</p>
                    <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">One controlled path</h2>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    By design
                  </span>
                </div>

                <div className="p-5 sm:p-6">
                  <div className="grid grid-cols-2 gap-3">
                    {WORKFLOW_STEPS.map((step, index) => (
                      <div key={step.step} className="relative min-h-[112px] rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[11px] font-bold text-cyan-800">{step.step}</span>
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-600" />
                        </div>
                        <h3 className="mt-3 text-sm font-semibold text-slate-900">{step.title}</h3>
                        <p className="mt-1 text-[11px] leading-5 text-slate-500">{step.description}</p>
                        {index < WORKFLOW_STEPS.length - 1 ? <span aria-hidden="true" className="sr-only">Next workflow stage</span> : null}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3.5 text-white">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Authority boundary</p>
                      <p className="mt-1 text-sm font-semibold">Bridge authorizes. Loop delivers.</p>
                    </div>
                    <span aria-hidden="true" className="text-xl text-cyan-300">→</span>
                  </div>
                </div>
              </div>
              <p className="relative mt-4 text-center text-[11px] text-slate-500">
                A clear workflow — without invented performance numbers or status claims.
              </p>
            </div>
          </div>
        </section>

        <section id="workflow" className="border-b border-slate-200 bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div className="max-w-2xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-800">A clear operating model</p>
                <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
                  From first upload to authorized delivery.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-7 text-slate-500">
                Each stage has a purpose. Rights, QC and legal approval remain distinct decisions — not decorative progress indicators.
              </p>
            </div>

            <div className="mt-10 grid overflow-hidden rounded-3xl border border-slate-200 bg-slate-200 gap-px sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {WORKFLOW_STEPS.map((step) => (
                <article key={step.step} className="flex min-h-44 flex-col bg-slate-50 p-5 transition-colors hover:bg-white">
                  <span className="font-mono text-xs font-bold text-cyan-800">{step.step}</span>
                  <h3 className="mt-7 text-lg font-semibold tracking-tight text-slate-950">{step.title}</h3>
                  <p className="mt-2 text-xs leading-6 text-slate-500">{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="workspaces" className="border-b border-slate-200 bg-slate-50 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-800">Purpose-built workspaces</p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
                The right tools for every side of the business.
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                Each account enters its own workspace. Access is based on verified account and organization permissions.
              </p>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-4">
              {AUDIENCES.map((audience) => (
                <article key={audience.number} className="group flex min-h-[260px] flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-cyan-300 hover:shadow-xl hover:shadow-slate-900/5">
                  <span className="font-mono text-xs font-bold text-cyan-800">{audience.number}</span>
                  <h3 className="mt-7 text-xl font-semibold tracking-tight text-slate-950">{audience.title}</h3>
                  <p className="mt-3 flex-1 text-sm leading-7 text-slate-600">{audience.description}</p>
                  <Link to={audience.to} search={audience.search as any} className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-cyan-900 transition-colors group-hover:text-cyan-700">
                    {audience.action} <span aria-hidden="true">→</span>
                  </Link>
                </article>
              ))}

              <article className="flex min-h-[260px] flex-col rounded-3xl border border-slate-900 bg-slate-950 p-6 text-white shadow-sm">
                <span className="font-mono text-xs font-bold text-cyan-300">04</span>
                <h3 className="mt-7 text-xl font-semibold tracking-tight">Investors</h3>
                <p className="mt-3 flex-1 text-sm leading-7 text-slate-300">
                  Follow approved participation opportunities and access only the investment records assigned to you.
                </p>
                <Link to="/contact" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 transition-colors hover:text-white">
                  Request Investor Access <span aria-hidden="true">→</span>
                </Link>
              </article>
            </div>
          </div>
        </section>

        <section id="authority" className="border-b border-slate-200 bg-white py-16 sm:py-20">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[.85fr_1.15fr] lg:items-center lg:px-8">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-800">One ecosystem. Clear responsibility.</p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
                Bridge authorizes. Loop delivers.
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <article className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-6">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-900">Crayons Bridge</p>
                <h3 className="mt-3 text-lg font-semibold text-slate-950">The business control plane</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  Titles, assets, QC, legal review, rights, licensing and delivery authorization.
                </p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-600">Crayons Loop</p>
                <h3 className="mt-3 text-lg font-semibold text-slate-950">The audience experience</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  Consumer discovery, viewing, playback and viewer entitlements for Bridge-authorized releases.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="bg-slate-950 py-16 text-white sm:py-20">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 sm:px-6 md:flex-row md:items-center lg:px-8">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">Bring your next title into focus</p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                Make every step clear. Keep every decision accountable.
              </h2>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Link to="/signup">
                <Button className="h-12 rounded-full bg-cyan-500 px-7 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">
                  Create account
                </Button>
              </Link>
              <Link to="/login" className="inline-flex h-12 items-center rounded-full border border-slate-600 px-7 text-sm font-semibold text-white transition hover:border-slate-300">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-slate-950 px-5 pb-9 text-xs text-slate-400 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 border-t border-slate-800 pt-7 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo/crayons-bridge-logo-3d.png" alt="" width={1840} height={1136} loading="lazy" decoding="async" className="h-8 w-auto max-w-[96px] object-contain" />
            <span>© 2026 StreamVista OPC Pvt Ltd.</span>
          </div>
          <nav aria-label="Footer links" className="flex flex-wrap items-center gap-5">
            <Link to="/privacy" className="transition-colors hover:text-white">Privacy</Link>
            <Link to="/terms" className="transition-colors hover:text-white">Terms</Link>
            <Link to="/contact" className="transition-colors hover:text-white">Contact</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
