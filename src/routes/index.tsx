import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Film, Globe2, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";

const CRAYONS_LOOP_URL = "https://crayonsloop.com/";

export const Route = createFileRoute("/")({ component: Home });

const WORKFLOW_STEPS = [
  { step: "01", title: "Upload", description: "Masters, audio, subtitles, artwork and documents." },
  { step: "02", title: "QC", description: "Technical readiness and asset validation." },
  { step: "03", title: "Rights", description: "Ownership, territories, languages and windows." },
  { step: "04", title: "License", description: "Screeners, buyers, offers and agreements." },
  { step: "05", title: "Deliver", description: "Controlled, authorized distribution packages." },
  { step: "06", title: "Earn", description: "Commercial activity and revenue visibility." },
];

const CAPABILITIES = [
  { icon: Film, eyebrow: "MEDIA SUPPLY CHAIN", title: "Every title. One workspace.", text: "Keep masters, metadata, QC, rights and delivery context together from first upload to market." },
  { icon: ShieldCheck, eyebrow: "RIGHTS & LICENSING", title: "Know what can move.", text: "Structure ownership, availability, territories and licensing activity before content leaves your control." },
  { icon: LockKeyhole, eyebrow: "CONTROLLED DELIVERY", title: "Deliver with confidence.", text: "Move approved assets through a governed workflow built around authorization, accountability and auditability." },
];

function Home() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#05070a] text-white antialiased selection:bg-violet-400/30">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#05070a]/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-9">
            <div className="[&_span]:text-white"><BrandMark /></div>
            <nav className="hidden items-center gap-7 text-xs font-medium text-white/55 lg:flex">
              <a href="#platform" className="transition hover:text-white">Platform</a>
              <a href="#workflow" className="transition hover:text-white">How it works</a>
              <a href="#for-business" className="transition hover:text-white">For business</a>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <SignedOut>
              <Link to="/login" className="hidden rounded-full px-4 py-2 text-xs font-semibold text-white/70 transition hover:text-white sm:inline-flex">Log in</Link>
              <Link to="/signup"><Button size="sm" className="rounded-full bg-white px-5 text-xs font-semibold text-black hover:bg-white/90">Create account</Button></Link>
            </SignedOut>
            <SignedIn>
              <Link to="/dashboard" className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black">Open workspace</Link>
              <UserButton />
            </SignedIn>
          </div>
        </div>
      </header>

      <main>
        <section className="relative min-h-[850px] border-b border-white/10 pt-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_28%,rgba(124,58,237,0.20),transparent_27%),radial-gradient(circle_at_30%_20%,rgba(37,99,235,0.12),transparent_28%)]" />
          <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:64px_64px]" />
          <div className="relative mx-auto grid max-w-7xl gap-16 px-4 pb-24 pt-24 sm:px-6 lg:grid-cols-[1.08fr_.92fr] lg:px-8 lg:pb-32 lg:pt-36">
            <div className="flex flex-col justify-center">
              <div className="mb-7 inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold tracking-[0.16em] text-white/65">
                <Sparkles className="h-3.5 w-3.5 text-violet-300" /> MEDIA SUPPLY CHAIN · RIGHTS · LICENSING
              </div>
              <h1 className="max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-7xl lg:text-[82px]">
                One bridge from <span className="bg-gradient-to-r from-white via-violet-200 to-violet-400 bg-clip-text text-transparent">content to market.</span>
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-white/55 sm:text-lg">
                The professional operating system for preparing, controlling, licensing and delivering film and television content.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link to="/signup"><Button className="h-12 rounded-full bg-white px-6 font-semibold text-black hover:bg-white/90">Create your workspace <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
                <Link to="/login"><Button variant="outline" className="h-12 rounded-full border-white/15 bg-white/[0.03] px-6 text-white hover:bg-white/10 hover:text-white">Log in</Button></Link>
              </div>
              <div className="mt-12 flex flex-wrap gap-x-6 gap-y-3 text-xs text-white/45">
                {["Secure storage","Technical QC","Rights control","Screeners","Licensing"].map((item) => <span key={item} className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-violet-300" />{item}</span>)}
              </div>
            </div>

            <div className="relative flex items-center">
              <div className="absolute -inset-10 rounded-full bg-violet-600/10 blur-3xl" />
              <div className="relative w-full overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.045] p-2 shadow-2xl shadow-violet-950/30 backdrop-blur-xl">
                <div className="rounded-[22px] border border-white/10 bg-[#0b0e14] p-5 sm:p-7">
                  <div className="flex items-center justify-between border-b border-white/10 pb-5">
                    <div><p className="text-[10px] font-semibold tracking-[.2em] text-violet-300">TITLE WORKSPACE</p><p className="mt-2 text-lg font-semibold">Your film, market-ready.</p></div>
                    <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold text-emerald-300">READY</div>
                  </div>
                  <div className="mt-6 space-y-3">
                    {WORKFLOW_STEPS.slice(0,5).map((item, i) => <div key={item.step} className="group flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-[11px] font-bold text-violet-300">{item.step}</div>
                      <div className="min-w-0 flex-1"><div className="flex items-center justify-between"><p className="text-sm font-semibold">{item.title}</p><span className="text-[10px] text-white/35">{i < 4 ? "COMPLETE" : "AUTHORIZED"}</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full w-full rounded-full bg-gradient-to-r from-violet-500 to-blue-400" /></div></div>
                    </div>)}
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                    {[["ASSETS","12"],["TERRITORIES","Global"],["QC","Passed"]].map(([a,b]) => <div key={a} className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-2 py-3"><p className="text-[9px] tracking-widest text-white/35">{a}</p><p className="mt-1 text-xs font-semibold text-white/80">{b}</p></div>)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="workflow" className="border-b border-white/10 bg-[#080a0e] py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl"><p className="text-xs font-bold tracking-[.2em] text-violet-300">THE BRIDGE WORKFLOW</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.04em] sm:text-5xl">A clear path from master file to market.</h2><p className="mt-5 text-base leading-7 text-white/50">One connected workflow replaces fragmented handoffs, spreadsheets and disconnected asset trails.</p></div>
            <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
              {WORKFLOW_STEPS.map((item) => <div key={item.step} className="bg-[#090c11] p-7 transition hover:bg-[#0d1118] sm:p-8"><span className="text-xs font-bold text-violet-300">{item.step}</span><h3 className="mt-8 text-2xl font-semibold">{item.title}</h3><p className="mt-3 text-sm leading-6 text-white/45">{item.description}</p></div>)}
            </div>
          </div>
        </section>

        <section id="platform" className="border-b border-white/10 bg-[#05070a] py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-5 lg:grid-cols-3">{CAPABILITIES.map(({icon: Icon,eyebrow,title,text}) => <article key={title} className="rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.055] to-white/[0.02] p-8 sm:p-9"><div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-400/10"><Icon className="h-5 w-5 text-violet-300" /></div><p className="mt-9 text-[10px] font-bold tracking-[.18em] text-white/35">{eyebrow}</p><h3 className="mt-3 text-2xl font-semibold tracking-tight">{title}</h3><p className="mt-4 text-sm leading-6 text-white/45">{text}</p></article>)}</div>
          </div>
        </section>

        <section id="for-business" className="relative overflow-hidden border-b border-white/10 bg-[#080a0e] py-24 sm:py-32">
          <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
            <div><p className="text-xs font-bold tracking-[.2em] text-violet-300">BUILT FOR MEDIA BUSINESS</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.04em] sm:text-5xl">Creators, studios and buyers on the same bridge.</h2></div>
            <div className="grid gap-4">
              {[["Creators","Prepare titles and control the path to market."],["Studios","Operate catalogs, teams, rights and delivery at scale."],["Buyers","Review authorized opportunities and licensing context."]].map(([title,text]) => <div key={title} className="flex items-start justify-between gap-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6"><div><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm text-white/45">{text}</p></div><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-white/30" /></div>)}
            </div>
          </div>
        </section>

        <section className="bg-[#05070a] py-24 sm:py-32">
          <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
            <Globe2 className="mx-auto h-7 w-7 text-violet-300" />
            <h2 className="mx-auto mt-7 max-w-3xl text-4xl font-semibold tracking-[-.045em] sm:text-6xl">Your content deserves a professional path to market.</h2>
            <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-white/45">Start with a title. Build the rights and delivery record around it. Move forward with control.</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3"><Link to="/signup"><Button className="h-12 rounded-full bg-white px-7 font-semibold text-black hover:bg-white/90">Create account</Button></Link><a href={CRAYONS_LOOP_URL} target="_blank" rel="noopener noreferrer"><Button variant="outline" className="h-12 rounded-full border-white/15 bg-transparent px-7 text-white hover:bg-white/10 hover:text-white">Explore Crayons Loop ↗</Button></a></div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#05070a]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-9 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div><span className="font-semibold text-white/75">Crayons Bridge</span><span className="mx-2">·</span>© 2026 StreamVista OPC Pvt Ltd.</div>
          <div className="flex flex-wrap gap-5"><Link to="/login" className="hover:text-white">Log in</Link><Link to="/signup" className="hover:text-white">Create account</Link><a href={CRAYONS_LOOP_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white">Crayons Loop ↗</a></div>
        </div>
      </footer>
    </div>
  );
}
