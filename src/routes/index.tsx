import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { SignedOut } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getBridgeSession } from "@/lib/bridge/session";
import { DEFAULT_BRIDGE_SITE_CONTENT, getPublicSiteContent } from "@/lib/bridge/site-content";


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
  const siteContentQ = useQuery({
    queryKey: ["bridge-public-site-content"],
    queryFn: () => getPublicSiteContent(),
    retry: 1,
  });
  const siteContent = siteContentQ.data ?? DEFAULT_BRIDGE_SITE_CONTENT;
  const sessionQ = useQuery({
    queryKey: ["bridge-session", user?.id],
    queryFn: () => getBridgeSession(),
    enabled: !isPending && Boolean(user),
    retry: false,
  });

  if (isPending || (user && sessionQ.isPending)) {
    return (
      <main className="grid min-h-screen place-items-center bg-bg p-6">
        <p className="text-sm text-muted">Opening workspace…</p>
      </main>
    );
  }

  if (user && sessionQ.data?.profile && sessionQ.data.home) {
    return <Navigate to={sessionQ.data.home as any} replace />;
  }

  return (
    <div className="min-h-screen bg-white text-fg antialiased selection:bg-accent/20 selection:text-fg">
      <header className="sticky top-0 z-50 border-b border-line bg-white/95 backdrop-blur-md">
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
          </div>
        </div>
      </header>

      <main>
        <section className="bridge-home-hero border-b border-line bg-white">
          <div className="mx-auto max-w-7xl px-5 py-14 text-center sm:px-6 sm:py-16 lg:py-20">
            <div className="mx-auto max-w-5xl">
              <div className="mx-auto flex justify-center">
                <BrandMark className="text-3xl sm:text-4xl lg:text-5xl" />
              </div>
              <h1 className="bridge-hero-copy mx-auto mt-8 max-w-4xl font-display text-[2.45rem] font-semibold leading-[1.02] tracking-[-0.04em] text-fg sm:text-5xl lg:text-[3.9rem]">
                {siteContent.heroTitle}
              </h1>
              <p className="bridge-hero-subcopy mx-auto mt-4 max-w-2xl text-base leading-7 text-muted sm:text-lg">
                {siteContent.heroBody}
              </p>

              <HeroCarousel slides={siteContent.carouselSlides ?? []} />

              <div className="bridge-hero-actions mt-7 flex flex-wrap items-center justify-center gap-3 sm:mt-8">
                {user ? (
                  <Link to="/onboarding">
                    <Button className="h-11 rounded-full px-6 text-sm font-semibold shadow-xs">Continue setup</Button>
                  </Link>
                ) : (
                  <Link to="/signup">
                    <Button className="h-11 rounded-full px-6 text-sm font-semibold shadow-xs">Create account</Button>
                  </Link>
                )}
                {!user ? <Link to="/login" className="px-2 text-sm font-semibold text-muted hover:text-fg transition-colors">Sign in</Link> : null}
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-b border-line bg-surface/50 py-10 sm:py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
                {siteContent.workflowHeading}
              </h2>
            </div>

            <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {WORKFLOW_STEPS.map((step, idx) => (
                <div
                  key={step.step}
                  className="bridge-workflow-card flex min-h-40 flex-col justify-between bg-surface p-5"
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

        <section id="creators" className="border-b border-line bg-surface py-14 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
                {siteContent.audienceHeading}
              </h2>
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
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

        <section className="border-b border-line bg-surface/50 py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 rounded-2xl border border-line bg-surface p-6 sm:p-8">
              <div>
                <h3 className="font-display text-xl font-semibold text-fg">
                  From rights to audience.
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted max-w-2xl">
                  Crayons Bridge manages rights, licensing and distribution authorization for
                  multiple independent Buyers—including OTT platforms, broadcasters, satellite,
                  airline and territory partners. Crayons Loop is our consumer streaming experience,
                  not the only destination or Buyer.
                </p>
              </div>


            </div>
          </div>
        </section>

        <section className="border-b border-line bg-surface py-14 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
                {siteContent.finalCtaHeading}
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
            <Link to="/legal" className="hover:text-fg transition-colors">Legal &amp; Compliance</Link>
            <Link to="/legal/dmca" className="hover:text-fg transition-colors">Copyright / DMCA</Link>
            <Link to="/privacy" className="hover:text-fg transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-fg transition-colors">B2B Terms</Link>
            <Link to="/contact" className="hover:text-fg transition-colors">Contact</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}


function HeroCarousel({ slides }: { slides: Array<{ imageUrl: string; alt: string; caption: string }> }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % slides.length), 6000);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  if (!slides.length) return null;
  const current = slides[active] ?? slides[0]!;
  return (
    <section aria-label="Featured Crayons Bridge images" className="mx-auto mt-8 max-w-5xl overflow-hidden rounded-3xl border border-line bg-surface text-left shadow-sm">
      <div className="relative aspect-[16/7] min-h-48 w-full bg-elevated">
        <img key={current.imageUrl} src={current.imageUrl} alt={current.alt} className="h-full w-full object-cover" />
        {slides.length > 1 ? (
          <>
            <button type="button" aria-label="Previous image" onClick={() => setActive((active - 1 + slides.length) % slides.length)} className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-xl text-white hover:bg-black/80">‹</button>
            <button type="button" aria-label="Next image" onClick={() => setActive((active + 1) % slides.length)} className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-xl text-white hover:bg-black/80">›</button>
          </>
        ) : null}
      </div>
      {current.caption ? <div className="flex items-center justify-between gap-4 px-4 py-3"><p className="text-sm font-medium text-fg">{current.caption}</p><span className="shrink-0 text-xs text-muted">{active + 1} / {slides.length}</span></div> : slides.length > 1 ? <div className="px-4 py-2 text-right text-xs text-muted">{active + 1} / {slides.length}</div> : null}
      {slides.length > 1 ? (
        <div className="flex items-center justify-center gap-2 border-t border-line px-4 py-3" aria-label="Choose carousel image">
          {slides.map((slide, index) => (
            <button key={slide.imageUrl + index} type="button" aria-label={`Show image ${index + 1}`} aria-current={index === active ? "true" : undefined} onClick={() => setActive(index)} className={`h-2.5 rounded-full transition-all ${index === active ? "w-7 bg-accent" : "w-2.5 bg-line-strong hover:bg-muted"}`} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
