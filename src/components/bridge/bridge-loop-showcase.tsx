import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";

const slides = [
  {
    id: "bridge",
    label: "THE MEDIA SUPPLY CHAIN",
    title: "One secure home for every production.",
    description: "Prepare titles, organize assets, manage rights and coordinate distribution from one connected workspace.",
    cta: "Explore Bridge",
    theme: "bridge",
  },
  {
    id: "loop",
    label: "THE AUDIENCE EXPERIENCE",
    title: "From approved content to every screen.",
    description: "Crayons Loop is the consumer streaming experience, connected to Bridge-authorized catalogue and delivery workflows.",
    cta: "Visit Crayons Loop",
    theme: "loop",
  },
] as const;

export function BridgeLoopShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef<number | null>(null);
  const goTo = useCallback((index: number) => setActive((index + slides.length) % slides.length), []);
  const slide = slides[active];

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % slides.length), 5000);
    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Crayons Bridge and Crayons Loop showcase"
      className="mx-auto w-full max-w-6xl text-left"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
      onTouchStart={(event) => { touchStart.current = event.changedTouches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        if (touchStart.current === null) return;
        const delta = (event.changedTouches[0]?.clientX ?? touchStart.current) - touchStart.current;
        if (Math.abs(delta) > 45) goTo(active + (delta < 0 ? 1 : -1));
        touchStart.current = null;
      }}
    >
      <div className={`relative isolate min-h-[430px] overflow-hidden rounded-[2rem] border border-slate-200 shadow-[0_28px_80px_rgba(15,23,42,0.14)] sm:min-h-[390px] lg:min-h-[420px] ${slide.theme === "bridge" ? "bg-[#071b2a]" : "bg-[#171129]"}`}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className={`absolute -right-20 -top-28 h-80 w-80 rounded-full blur-3xl ${slide.theme === "bridge" ? "bg-cyan-400/25" : "bg-violet-400/30"}`} />
          <div className={`absolute -bottom-40 left-[28%] h-96 w-96 rounded-full blur-3xl ${slide.theme === "bridge" ? "bg-blue-500/20" : "bg-fuchsia-500/20"}`} />
          <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px)", backgroundSize: "42px 42px" }} />
        </div>
        <div key={slide.id} className="bridge-showcase-enter relative grid min-h-[430px] items-center gap-8 px-6 py-10 sm:min-h-[390px] sm:px-10 lg:min-h-[420px] lg:grid-cols-[1.15fr_.85fr] lg:px-14">
          <div className="max-w-2xl">
            <p className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold tracking-[0.2em] text-cyan-100 sm:text-xs">{slide.label}</p>
            <h2 className="mt-5 max-w-2xl font-display text-4xl font-semibold leading-[1.03] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">{slide.title}</h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-slate-200 sm:text-base">{slide.description}</p>
            <div className="mt-7">
              {slide.theme === "bridge" ? (
                <Link to="/signup" className="inline-flex h-11 items-center rounded-full bg-white px-6 text-sm font-semibold text-slate-950 transition hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">{slide.cta}<span className="ml-2" aria-hidden="true">→</span></Link>
              ) : (
                <a href="https://crayonsloop.in/" target="_blank" rel="noreferrer" className="inline-flex h-11 items-center rounded-full bg-white px-6 text-sm font-semibold text-slate-950 transition hover:bg-fuchsia-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">{slide.cta}<span className="ml-2" aria-hidden="true">↗</span></a>
              )}
            </div>
          </div>
          <div className="relative hidden h-64 items-center justify-center lg:flex" aria-hidden="true">
            {slide.theme === "bridge" ? (
              <div className="relative flex h-60 w-60 items-center justify-center rounded-[2.5rem] border border-cyan-100/25 bg-white/[0.07] shadow-[0_30px_80px_rgba(34,211,238,.13)] backdrop-blur-sm">
                <div className="absolute inset-5 rounded-[2rem] border border-dashed border-cyan-100/20" />
                <img src="/logo/crayons-bridge-logo-3d.png" alt="" loading="eager" decoding="async" className="relative z-10 h-44 w-44 object-contain drop-shadow-[0_18px_32px_rgba(0,0,0,.3)]" />
                <span className="absolute -bottom-4 rounded-full border border-cyan-100/20 bg-[#092d40] px-4 py-2 text-xs font-semibold tracking-[0.18em] text-cyan-100">BRIDGE OS</span>
              </div>
            ) : (
              <div className="relative flex h-60 w-60 items-center justify-center rounded-full border border-fuchsia-100/25 bg-gradient-to-br from-violet-300/20 to-fuchsia-300/5 shadow-[0_30px_90px_rgba(192,132,252,.16)]">
                <div className="absolute inset-5 rounded-full border border-dashed border-fuchsia-100/30" />
                <div className="flex h-32 w-32 items-center justify-center rounded-[2rem] border border-white/25 bg-white/10 shadow-2xl backdrop-blur-xl">
                  <span className="font-display text-5xl font-semibold tracking-[-0.08em] text-white">loop</span>
                </div>
                <span className="absolute -bottom-4 rounded-full border border-fuchsia-100/20 bg-[#28183b] px-4 py-2 text-xs font-semibold tracking-[0.18em] text-fuchsia-100">STREAMING</span>
              </div>
            )}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-white/10 bg-black/15 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-2">
            {slides.map((item, index) => (
              <button key={item.id} type="button" onClick={() => goTo(index)} aria-label={`Show ${item.theme === "bridge" ? "Crayons Bridge" : "Crayons Loop"} slide`} aria-current={active === index ? "true" : undefined} className={`h-2 rounded-full transition-all ${active === index ? "w-8 bg-white" : "w-2 bg-white/40 hover:bg-white/75"}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Previous slide" onClick={() => goTo(active - 1)} className="grid h-9 w-9 place-items-center rounded-full border border-white/30 text-white transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">‹</button>
            <button type="button" aria-label="Next slide" onClick={() => goTo(active + 1)} className="grid h-9 w-9 place-items-center rounded-full border border-white/30 text-white transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">›</button>
          </div>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">{slide.title}</p>
    </section>
  );
}
