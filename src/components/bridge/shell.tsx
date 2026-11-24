import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import type { BridgeActor } from "@/lib/bridge/session";
import { cn } from "@/lib/cn";

type NavItem = { to: string; label: string };

function navigationFor(actor: BridgeActor): NavItem[] {
  if (actor.internalRole === "super_admin") {
    return [
      { to: "/dashboard", label: "Founder Centre" },
      { to: "/workspace", label: "Titles & Submissions" },
      { to: "/admin/workstations", label: "QC & Rights" },
      { to: "/internal", label: "Distribution" },
      { to: "/admin/buyers", label: "Buyers" },
      { to: "/admin/users", label: "People & Organizations" },
      { to: "/admin/services", label: "Services" },
      { to: "/deliveries", label: "Vendor Jobs" },
      { to: "/admin-cms", label: "Website CMS" },
      { to: "/admin/audit", label: "Audit & Security" },
      { to: "/account", label: "Account" },
    ];
  }
  if (actor.internalRole) {
    const items: NavItem[] = [{ to: "/internal", label: "Operations" }, { to: "/workspace", label: "Titles" }];
    if (actor.internalRole === "admin") items.push({ to: "/admin", label: "Admin" }, { to: "/admin/team", label: "Team" }, { to: "/admin-cms", label: "Website CMS" });
    return [...items, { to: "/account", label: "Account" }];
  }
  const accountNavigation: Record<BridgeActor["accountType"], NavItem[]> = {
    independent_creator: [{ to: "/creator", label: "My Dashboard" }, { to: "/workspace", label: "My Titles & Submissions" }],
    studio: [{ to: "/studio", label: "Studio Dashboard" }, { to: "/workspace", label: "Titles & Submissions" }, { to: "/deliveries", label: "Vendor Services" }],
    buyer: [{ to: "/buyer", label: "Title Marketplace" }],
    investor: [{ to: "/investor", label: "Investment Desk" }],
  };
  return [...accountNavigation[actor.accountType], { to: "/account", label: "Account" }];
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <Link to={item.to} onClick={onNavigate}
      className="flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-muted transition hover:bg-elevated hover:text-fg"
      activeProps={{ className: "flex min-h-10 items-center rounded-lg bg-accent-soft px-3 text-sm font-semibold text-accent" }}>
      {item.label}
    </Link>
  );
}

export function BrandMark({ className, size = "default" }: { className?: string; size?: "default" | "large" }) {
  return (
    <Link to="/" className={cn("inline-flex items-center shrink-0", className)} aria-label="Crayons Bridge">
      <img
        src="/logo/crayons-bridge-logo-3d.png"
        alt="Crayons Bridge"
        className={cn("bridge-logo block w-auto object-contain", size === "large" ? "h-[76px] sm:h-[92px] lg:h-[112px] max-w-[min(92vw,520px)]" : "h-[38px] max-w-[190px]")}
        fetchPriority={size === "large" ? "high" : "auto"}
      />
    </Link>
  );
}

export function BridgeShell({ actor, title, children }: { actor: BridgeActor; title: string; children: ReactNode }) {
  const navigation = navigationFor(actor);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-line bg-surface px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold md:hidden">
            {menuOpen ? "Close" : "Menu"}
          </button>
          <BrandMark />
        </div>
        <div className="flex items-center gap-3">
          {actor.internalRole ? <span className="hidden rounded-full border border-line px-3 py-1 text-xs text-muted sm:inline">{actor.internalRole.replaceAll("_", " ")}</span> : null}
          <a href="https://crayonsloop.in/" target="_blank" rel="noreferrer" className="hidden text-xs font-medium text-muted hover:text-fg sm:inline">Loop ↗</a>
          <UserButton />
        </div>
      </header>
      <div className="mx-auto flex max-w-[1600px]">
        <aside className={cn("fixed inset-y-16 left-0 z-40 w-64 border-r border-line bg-surface p-3 transition-transform md:sticky md:top-16 md:block md:h-[calc(100vh-4rem)] md:translate-x-0", menuOpen ? "translate-x-0" : "-translate-x-full")}>
          <p className="px-3 pb-2 pt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{actor.internalRole === "super_admin" ? "Super Admin" : actor.accountType.replaceAll("_", " ")}</p>
          <nav aria-label="Primary navigation" className="grid gap-1">
            {navigation.map((item) => <NavLink key={item.to} item={item} onNavigate={() => setMenuOpen(false)} />)}
          </nav>
        </aside>
        {menuOpen ? <button aria-label="Close navigation" className="fixed inset-16 z-30 bg-black/20 md:hidden" onClick={() => setMenuOpen(false)} /> : null}
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3">
            <h1 className="font-display text-xl font-semibold tracking-tight">{title}</h1>
            <p className="truncate text-xs text-muted">{actor.organizationName || actor.displayName}</p>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
