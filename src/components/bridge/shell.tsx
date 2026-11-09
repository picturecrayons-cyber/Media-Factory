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
      aria-label="Crayons Bridge"
    >
      <svg viewBox="0 0 168 48" role="img" aria-label="Crayons Bridge" className="bridge-logo block h-[42px] w-auto sm:h-[46px] lg:h-[48px]">
        <text x="0" y="16" fill="#6f6f6f" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="13" fontWeight="600" letterSpacing="0.5">crayons</text>
        <text x="0" y="40" fill="#007291" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="26" fontWeight="700" letterSpacing="-0.5">bridge</text>
      </svg>
    </Link>
  );
}

export function BridgeShell({ actor, title, children }: { actor: BridgeActor; title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-50 border-b border-line bg-surface/95 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <BrandMark />
          <div className="flex items-center gap-3">
            {actor.internalRole ? <span className="hidden rounded-full border border-line px-3 py-1 text-xs text-muted sm:inline">{actor.internalRole.replaceAll("_", " ")}</span> : null}
            <UserButton />
          </div>
        </div>
      </header>
      <div className="mx-auto flex min-h-[calc(100vh-65px)] max-w-[1600px]">
        <aside className="hidden w-60 shrink-0 border-r border-line bg-surface/60 px-4 py-6 md:block">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Workspace</p>
          <nav aria-label="Main workspace navigation" className="mt-3 grid gap-1">
            {NAV.map((item) => <NavLink key={item.label} item={item} />)}
          </nav>
          <div className="mt-8 border-t border-line pt-5">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Distribution</p>
            <a href="https://crayonsloop.in/" target="_blank" rel="noreferrer" className="mt-2 block rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-fg/5 hover:text-fg">Crayons Loop ↗</a>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <nav aria-label="Mobile workspace navigation" className="mb-5 flex gap-1 overflow-x-auto pb-1 md:hidden">
            {NAV.map((item) => <NavLink key={item.label} item={item} />)}
          </nav>
          <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Crayons Bridge</p>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
            </div>
            <p className="text-xs text-muted">{actor.organizationName || actor.displayName}</p>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
