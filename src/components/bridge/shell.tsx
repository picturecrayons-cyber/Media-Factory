import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import type { BridgeActor } from "@/lib/bridge/session";
import { cn } from "@/lib/cn";

type NavItem = { to: string; label: string };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/workspace", label: "Titles" },
  { to: "/deliveries", label: "Deliveries" },
  { to: "/account", label: "Account" },
];

function NavLink({ item }: { item: NavItem }) {
  return <Link to={item.to} className="bridge-nav-item" activeProps={{ className: "bridge-nav-item bridge-nav-active" }}>{item.label}</Link>;
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn("inline-flex items-center shrink-0", className)}
      aria-label="Crayons Bridge home"
    >
      <svg viewBox="0 0 208 48" role="img" aria-label="Crayons Bridge" className="bridge-logo block h-[42px] w-auto sm:h-[46px] lg:h-[48px]">
        <g fill="none" stroke="#08b8e8" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6">
          <path d="M7 30V25C7 15 14 9 23 9S39 15 39 25V30" />
          <path d="M7 30H39M15 24V30M31 24V30" />
        </g>
        <circle cx="7" cy="33" r="2" fill="#08b8e8" />
        <circle cx="39" cy="33" r="2" fill="#08b8e8" />
        <text x="49" y="18" fill="currentColor" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="12" fontWeight="700" letterSpacing="1.1">CRAYONS</text>
        <text x="48" y="39" fill="#08b8e8" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="25" fontWeight="800" letterSpacing="-0.7">bridge</text>
      </svg>
    </Link>
  );
}

export function BridgeShell({ actor, title, children }: { actor: BridgeActor; title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-50 border-b border-line bg-surface/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center gap-6 px-4 py-3.5 sm:px-6 lg:px-8">
          <BrandMark />
          <nav className="hidden flex-1 items-center gap-1 md:flex">{NAV.map((item) => <NavLink key={item.label} item={item} />)}</nav>
          <a href="https://crayonsloop.in/" target="_blank" rel="noreferrer" className="hidden text-sm font-semibold text-muted transition hover:text-fg lg:inline">Open Crayons Loop ↗</a>
          <div className="ml-auto flex items-center gap-3">
            {actor.internalRole ? <span className="hidden rounded-full border border-line px-3 py-1 text-xs text-muted sm:inline">{actor.internalRole.replaceAll("_", " ")}</span> : null}
            <UserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Crayons Bridge</p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          </div>
          <p className="text-xs text-muted">{actor.organizationName || actor.displayName}</p>
        </div>
        {children}
      </main>
      <footer className="mx-auto flex max-w-[1440px] flex-wrap gap-x-4 gap-y-2 px-4 pb-8 text-xs text-muted sm:px-6 lg:px-8">
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <Link to="/dmca">DMCA</Link>
        <Link to="/disclaimer">Disclaimer</Link>
        <Link to="/business">Business</Link>
        <Link to="/contact">Contact</Link>
      </footer>
    </div>
  );
}
