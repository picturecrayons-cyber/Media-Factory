import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import { cn } from "@/lib/cn";
import type { BridgeActor } from "@/lib/bridge/session";

const LOOP_URL = "https://crayonsloop.in/";
const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/workspace", label: "Titles" },
  { to: "/deliveries", label: "Deliveries" },
  { to: "/account", label: "Account" },
] as const;

export function BrandMark({ className }: { className?: string }) {
  return <Link to="/" className={cn("inline-flex items-center shrink-0", className)} aria-label="Crayons Bridge home"><img src="/brand/logo.png" alt="Crayons Bridge" className="bridge-logo block h-auto w-[124px] object-contain sm:w-[144px] lg:w-[156px]" /></Link>;
}

export function BridgeShell({ actor, title, children }: { actor: BridgeActor; title: string; children: ReactNode }) {
  return <div className="min-h-screen bg-bg text-fg">
    <header className="sticky top-0 z-50 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center gap-5 px-4 py-3 sm:px-6 lg:px-8">
        <BrandMark />
        <nav className="hidden flex-1 items-center gap-1 md:flex">{NAV.map((item)=><Link key={item.to} to={item.to} className="bridge-nav-item" activeProps={{className:"bridge-nav-item bridge-nav-active"}}>{item.label}</Link>)}</nav>
        <a href={LOOP_URL} target="_blank" rel="noreferrer" className="hidden rounded-full border border-line px-4 py-2 text-xs font-semibold hover:border-line-strong md:inline-flex">Crayons Loop ↗</a>
        <div className="ml-auto flex items-center gap-3">{actor.internalRole?<span className="hidden rounded-full border border-line px-3 py-1 text-xs text-muted sm:inline">{actor.internalRole.replaceAll("_"," ")}</span>:null}<UserButton /></div>
      </div>
    </header>
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Crayons Bridge</p><h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1></div><p className="text-xs text-muted">{actor.organizationName || actor.displayName}</p></div>
      {children}
    </main>
  </div>;
}
