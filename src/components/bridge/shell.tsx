import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import { cn } from "@/lib/cn";
import type { BridgeActor } from "@/lib/bridge/session";

const CRAYONS_LOOP_URL = import.meta.env.VITE_LOOP_URL || "https://crayonsloop.com";

type NavItem = { to?: string; href?: string; label: string; show: (a: BridgeActor) => boolean };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", show: () => true },
  { to: "/workspace", label: "Titles", show: () => true },
  { to: "/buyer", label: "Buyers", show: (a) => a.accountType === "buyer" || Boolean(a.internalRole) },
  { to: "/internal", label: "Distribution", show: (a) => Boolean(a.internalRole) },
  { to: "/admin", label: "Admin", show: (a) => a.internalRole === "admin" || a.internalRole === "super_admin" },
  { to: "/account", label: "Account", show: () => true },
];

function NavLink({ item }: { item: NavItem }) {
  if (item.href) return <a href={item.href} target="_blank" rel="noreferrer" className="bridge-nav-item">{item.label} ↗</a>;
  return <Link to={item.to!} className="bridge-nav-item" activeProps={{ className: "bridge-nav-item bridge-nav-active" }}>{item.label}</Link>;
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn("inline-flex items-center shrink-0", className)}
      aria-label="Crayons Bridge home"
    >
      <img
        src="/brand/logo.png"
        alt="Crayons Bridge"
        className="bridge-logo block h-auto w-[124px] object-contain sm:w-[144px] lg:w-[156px]"
      />
    </Link>
  );
}

export function BridgeShell({ actor, title, children }: { actor: BridgeActor; title: string; children: ReactNode }) {
  const visible = NAV.filter((n) => n.show(actor));
  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-50 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center gap-6 px-4 py-3 sm:px-6 lg:px-8">
          <BrandMark />
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {visible.map((item) => <NavLink key={item.label} item={item} />)}
            {actor.internalRole ? <NavLink item={{ href: CRAYONS_LOOP_URL, label: "Crayons Loop", show: () => true }} /> : null}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {actor.internalRole ? <span className="hidden rounded-full border border-line px-3 py-1 text-xs text-muted sm:inline">{actor.internalRole.replaceAll("_", " ")}</span> : null}
            <UserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Crayons Bridge</p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          </div>
          <p className="text-sm text-muted">{actor.organizationName || actor.displayName}</p>
        </div>
        {children}
      </main>
    </div>
  );
}
