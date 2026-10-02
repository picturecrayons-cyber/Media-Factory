import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import { cn } from "@/lib/cn";
import type { BridgeActor } from "@/lib/bridge/session";

type NavItem = { to: string; label: string };

function navFor(actor: BridgeActor): NavItem[] {
  if (actor.internalRole === "admin" || actor.internalRole === "super_admin") {
    return [
      { to: "/admin", label: "Bridge Admin" },
      { to: "/cms", label: "Bridge CMS" },
      { to: "/account", label: "Account" },
    ];
  }
  if (actor.accountType === "independent_creator") {
    return [
      { to: "/creator", label: "My Titles" },
      { to: "/deliveries", label: "Deliveries" },
      { to: "/account", label: "Account" },
    ];
  }
  if (actor.accountType === "studio") {
    return [
      { to: "/studio", label: "Studio Slate" },
      { to: "/deliveries", label: "Deliveries" },
      { to: "/account", label: "Account" },
    ];
  }
  if (actor.accountType === "buyer") {
    return [
      { to: "/buyer", label: "Buyer Desk" },
      { to: "/account", label: "Account" },
    ];
  }
  return [{ to: "/account", label: "Account" }];
}

function NavLink({ item }: { item: NavItem }) {
  return <Link to={item.to} className="bridge-nav-item" activeProps={{ className: "bridge-nav-item bridge-nav-active" }}>{item.label}</Link>;
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        "inline-flex shrink-0 items-baseline gap-1 font-display text-xl font-semibold tracking-tight text-fg sm:text-2xl",
        className,
      )}
      aria-label="Crayons Bridge home"
    >
      <span>Crayons</span>
      <span className="text-accent">Bridge</span>
    </Link>
  );
}

export function BridgeShell({ actor, title, children }: { actor: BridgeActor; title: string; children: ReactNode }) {
  const nav = navFor(actor);
  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-50 border-b border-line bg-surface/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center gap-6 px-4 py-3.5 sm:px-6 lg:px-8">
          <BrandMark />
          <nav className="hidden flex-1 items-center gap-1 md:flex">{nav.map((item) => <NavLink key={item.label} item={item} />)}</nav>
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
    </div>
  );
}
