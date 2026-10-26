import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { SignedOut } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { createEnquiry } from "@/lib/bridge/leads";
import { listPublicPosters } from "@/lib/bridge/simple-desk";
import { listPublicPartners } from "@/lib/bridge/partners";
import { getBridgeSession } from "@/lib/bridge/session";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Crayons Bridge — film rights, licensing and delivery" },
      { name: "description", content: "Crayons Bridge is the business desk for film titles, rights, licensing and delivery. Operated by StreamVista OPC Pvt Ltd." },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "Crayons Bridge" },
      { property: "og:description", content: "Film titles, rights, licensing and delivery." },
      { property: "og:url", content: "https://www.crayonspictures.in/" },
    ],
    links: [{ rel: "canonical", href: "https://www.crayonspictures.in/" }],
  }),
  component: Home,
});

const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Record",
    description: "Add the title and one file.",
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

function PosterHero({ posters }: { posters: Array<{ name: string; url: string }> }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const startX = useRef(0);
  useEffect(() => {
    if (posters.length < 2 || paused) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % posters.length), 4500);
    return () => window.clearInterval(timer);
  }, [posters.length, paused]);
  const poster = posters[index];
  if (!poster) return null;
  const step = (direction: number) => setIndex((value) => (value + direction + posters.length) % posters.length);
  return (
    <section
      className="relative overflow-hidden border-b border-line bg-[#071018]"
      aria-label="Posters"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(event) => {
        startX.current = event.touches[0]?.clientX ?? 0;
        setPaused(true);
      }}
      onTouchEnd={(event) => {
        const delta = (event.changedTouches[0]?.clientX ?? 0) - startX.current;
        if (delta > 48) step(-1);
        if (delta < -48) step(1);
        setPaused(false);
      }}
    >
      <img src={poster.url} alt={poster.name} className="mx-auto h-[62vh] max-h-[720px] w-full object-contain" />
      <p className="absolute bottom-4 left-5 right-24 truncate text-sm font-semibold text-white">{poster.name}</p>
      {posters.length > 1 ? (
        <div className="absolute bottom-3 right-4 flex gap-2">
          <button type="button" aria-label="Previous poster" onClick={() => step(-1)} className="h-11 w-11 rounded-full bg-white/90 text-lg font-semibold text-[#071018]">‹</button>
          <button type="button" aria-label="Next poster" onClick={() => step(1)} className="h-11 w-11 rounded-full bg-white/90 text-lg font-semibold text-[#071018]">›</button>
        </div>
      ) : null}
    </section>
  );
}

function Enquiry() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await createEnquiry({
        data: {
          name: String(form.get("name") || ""),
          email: String(form.get("email") || ""),
          organization: String(form.get("organization") || ""),
          message: String(form.get("message") || ""),
        },
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-start">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Crayons Bridge",
        url: "https://www.crayonspictures.in/",
        email: "abijithasokan@crayonspictures.com",
        parentOrganization: { "@type": "Organization", name: "StreamVista OPC Pvt Ltd" },
      }) }} />
      <div>
        <h2 className="font-display text-3xl font-semibold tracking-tight">Talk to the desk.</h2>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted">Licensing, delivery, and catalogue enquiries come here. A person replies.</p>
      </div>
      {sent ? <p className="rounded-2xl border border-line bg-[#f4f7f8] p-6 text-sm font-semibold">Received. We will reply by email.</p> : (
        <form onSubmit={(event) => void onSubmit(event)} className="grid gap-3">
          <input name="name" required placeholder="Name" className="h-12 rounded-xl border border-line-strong bg-white px-3" />
          <input name="email" type="email" required placeholder="Work email" className="h-12 rounded-xl border border-line-strong bg-white px-3" />
          <input name="organization" placeholder="Company" className="h-12 rounded-xl border border-line-strong bg-white px-3" />
          <textarea name="message" required minLength={8} rows={4} placeholder="What do you need?" className="rounded-xl border border-line-strong bg-white px-3 py-2" />
          {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
          <button type="submit" disabled={busy} className="h-12 rounded-full bg-[#0b1220] text-sm font-semibold text-white">{busy ? "Sending…" : "Send enquiry"}</button>
        </form>
      )}
    </div>
  );
}

function Home() {
  const { user, isPending } = useCurrentUserState();
  const partnersQ = useQuery({ queryKey: ["public-partners"], queryFn: () => listPublicPartners(), staleTime: 120_000 });
  const postersQ = useQuery({ queryKey: ["public-posters"], queryFn: () => listPublicPosters(), staleTime: 120_000 });
  const sessionQ = useQuery({
    queryKey: ["bridge-session", user?.id],
    queryFn: () => getBridgeSession(),
    enabled: !isPending && Boolean(user),
    retry: false,
  });

  if (user && sessionQ.data?.home) return <Navigate to={sessionQ.data.home as any} replace />;
  if (user && sessionQ.isSuccess && !sessionQ.data?.profile) return <Navigate to="/onboarding" replace />;

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
        <PosterHero posters={postersQ.data?.posters ?? []} />
        <section className="bridge-home-hero border-b border-line bg-white">
          <div className="mx-auto max-w-7xl px-5 py-14 text-center sm:px-6 sm:py-16 lg:py-20">
            <div className="mx-auto max-w-5xl">
              <div className="mx-auto flex justify-center">
                <BrandMark className="text-3xl sm:text-4xl lg:text-5xl" />
              </div>
              <h1 className="bridge-hero-copy mx-auto mt-8 max-w-4xl font-display text-[2.45rem] font-semibold leading-[1.02] tracking-[-0.04em] text-fg sm:text-5xl lg:text-[3.9rem]">
                The title network.
              </h1>
              <p className="bridge-hero-subcopy mx-auto mt-4 max-w-2xl text-base leading-7 text-muted sm:text-lg">
                One record for the film, the rights, and the delivery.
              </p>

              <div className="bridge-hero-actions mt-7 flex flex-wrap items-center justify-center gap-3 sm:mt-8">
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

        <section className="border-b border-line bg-white py-8">
          <div className="mx-auto max-w-7xl px-5 sm:px-6">
            <h2 className="text-lg font-semibold">Partners</h2>
            <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
              {(partnersQ.data?.partners ?? []).map((partner) => (
                <a key={partner.publicUrl} href={partner.publicUrl} className="flex min-w-64 items-center gap-3 rounded-2xl border border-line p-4" target="_blank" rel="noreferrer">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#102433] text-xs font-semibold text-white">LOOP</span>
                  <span>
                    <span className="block text-sm font-semibold">{partner.name}</span>
                    <span className="block text-xs text-muted">{partner.kind} · {partner.sharePct}% · {partner.contact}</span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-b border-line bg-surface/50 py-10 sm:py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
                From record to delivery.
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
                Built for the media business.
              </h2>
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
              <div className="flex flex-col justify-between rounded-3xl border border-line bg-elevated p-7 sm:p-8">
                <div>
                  <h3 className="font-display text-2xl font-semibold text-fg">
                    Creators
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    Manage your titles from the record to delivery.
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
                  Crayons Bridge manages rights, licensing and distribution authorization. Crayons
                  Loop is the consumer streaming experience.
                </p>
              </div>


            </div>
          </div>
        </section>

        <section className="border-b border-line bg-white py-12 sm:py-16">
          <Enquiry />
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
            <Link to="/privacy" className="hover:text-fg transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-fg transition-colors">Terms</Link>
            <Link to="/dmca" className="hover:text-fg transition-colors">DMCA</Link>
            <Link to="/disclaimer" className="hover:text-fg transition-colors">Disclaimer</Link>
            <Link to="/refund" className="hover:text-fg transition-colors">Refunds</Link>
            <Link to="/grievance" className="hover:text-fg transition-colors">Grievance</Link>
            <Link to="/business" className="hover:text-fg transition-colors">Business</Link>
            <Link to="/contact" className="hover:text-fg transition-colors">Contact</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
