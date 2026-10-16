import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import type { BridgeActor } from "@/lib/bridge/session";
import { hasPermission } from "@/lib/bridge/rbac";
import { cn } from "@/lib/cn";

type NavItem = { to: string; label: string };

function navigationFor(actor: BridgeActor): NavItem[] {
  const items: NavItem[] = [];

  if (actor.internalRole === "super_admin") {
    items.push({ to: "/dashboard", label: "Dashboard" });
  }

  items.push({ to: "/workspace", label: "Titles" });

  if (hasPermission(actor, "delivery.read")) {
    items.push({ to: "/deliveries", label: "Deliveries" });
  }

  if (actor.internalRole) {
    items.push({ to: "/internal", label: "Operations" });
  }

  if (actor.internalRole === "admin" || actor.internalRole === "super_admin") {
    items.push({ to: "/admin", label: "Admin" });
  }

  items.push({ to: "/account", label: "Account" });
  return items;
}

function NavLink({ item }: { item: NavItem }) {
  return (
    <Link
      to={item.to}
      className="bridge-nav-item shrink-0"
      activeProps={{ className: "bridge-nav-item bridge-nav-active shrink-0" }}
    >
      {item.label}
    </Link>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn("inline-flex items-center shrink-0", className)}
      aria-label="Crayons Bridge home"
    >
      <svg viewBox="0 0 168 48" role="img" aria-label="Crayons Bridge" className="bridge-logo block h-[42px] w-auto sm:h-[46px] lg:h-[48px]">
        <text x="0" y="16" fill="#6f6f6f" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="13" fontWeight="600" letterSpacing="0.5">crayons</text>
        <text x="0" y="40" fill="#08b8e8" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="26" fontWeight="700" letterSpacing="-0.5">bridge</text>
      </svg>
    </Link>
  );
}

export function BridgeShell({ actor, title, children }: { actor: BridgeActor; title: string; children: ReactNode }) {
  const nav = navigationFor(actor);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-50 border-b border-line bg-surface/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3.5 sm:px-6 lg:px-8">
          <BrandMark />
          <a href="https://crayonsloop.in/" target="_blank" rel="noreferrer" className="hidden text-sm font-semibold text-muted transition hover:text-fg lg:order-3 lg:inline">Open Crayons Loop ↗</a>
          <div className="ml-auto flex items-center gap-3">
            {actor.internalRole ? <span className="hidden rounded-full border border-line px-3 py-1 text-xs text-muted sm:inline">{actor.internalRole.replaceAll("_", " ")}</span> : null}
            <UserButton />
          </div>
          <nav aria-label="Main navigation" className="order-3 flex w-full items-center gap-1 overflow-x-auto pb-1 md:order-none md:w-auto md:flex-1 md:pb-0">
            {nav.map((item) => <NavLink key={item.label} item={item} />)}
          </nav>
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
