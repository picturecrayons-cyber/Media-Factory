import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import type { BridgeActor } from "@/lib/bridge/session";
import { cn } from "@/lib/cn";

type NavItem = { to: string; label: string };
type Navigation = { primary: NavItem[]; more: NavItem[] };

function navigationFor(actor: BridgeActor): Navigation {
  if (actor.internalRole) {
    const primary: NavItem[] = [
      { to: "/internal", label: "Operations" },
      { to: "/workspace", label: "Titles" },
    ];
    const more: NavItem[] = [{ to: "/account", label: "Account" }];

    if (actor.internalRole === "admin" || actor.internalRole === "super_admin") {
      more.unshift(
        { to: "/admin", label: "Admin" },
        { to: "/admin-cms", label: "Website CMS" },
      );
    }

    if (actor.internalRole === "super_admin") {
      primary.unshift({ to: "/dashboard", label: "Founder Centre" });
      more.splice(2, 0, { to: "/cms", label: "Loop Gateway" });
    }

    return { primary, more };
  }

  const accountNavigation: Record<BridgeActor["accountType"], NavItem[]> = {
    independent_creator: [
      { to: "/creator", label: "Creator Home" },
      { to: "/workspace", label: "My Titles" },
      { to: "/deliveries", label: "Updates & Deliveries" },
    ],
    studio: [
      { to: "/studio", label: "Studio Home" },
      { to: "/workspace", label: "Titles" },
      { to: "/deliveries", label: "Deliveries" },
    ],
    buyer: [{ to: "/buyer", label: "Buyer Desk" }],
    investor: [{ to: "/investor", label: "Portfolio" }],
  };

  return {
    primary: accountNavigation[actor.accountType],
    more: [{ to: "/account", label: "Account" }],
  };
}

function NavLink({ item }: { item: NavItem }) {
  return (
    <Link
      to={item.to}
      className="bridge-nav-item whitespace-nowrap"
      activeProps={{ className: "bridge-nav-item bridge-nav-active whitespace-nowrap" }}
    >
      {item.label}
    </Link>
  );
}

function NavigationLinks({ navigation }: { navigation: Navigation }) {
  return (
    <>
      {navigation.primary.map((item) => <NavLink key={item.to} item={item} />)}
      {navigation.more.length > 0 ? (
        <details className="group relative shrink-0">
          <summary className="bridge-nav-item flex cursor-pointer list-none items-center gap-2 whitespace-nowrap [&::-webkit-details-marker]:hidden">
            More
            <span aria-hidden="true" className="text-[10px] transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="absolute right-0 top-full z-[60] mt-2 min-w-48 rounded-xl border border-line bg-surface p-2 shadow-xl">
            {navigation.more.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="block rounded-lg px-3 py-2.5 text-sm text-muted transition hover:bg-elevated hover:text-fg"
                activeProps={{ className: "block rounded-lg bg-elevated px-3 py-2.5 text-sm font-semibold text-fg" }}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </details>
      ) : null}
    </>
  );
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
  const navigation = navigationFor(actor);
  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-50 border-b border-line bg-surface/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center gap-6 px-4 py-3.5 sm:px-6 lg:px-8">
          <BrandMark />
          <nav aria-label="Primary navigation" className="hidden flex-1 items-center gap-1 overflow-visible md:flex">
            <NavigationLinks navigation={navigation} />
          </nav>
          <a href="https://crayonsloop.in/" target="_blank" rel="noreferrer" className="hidden text-sm font-semibold text-muted transition hover:text-fg lg:inline">Open Crayons Loop ↗</a>
          <div className="ml-auto flex items-center gap-3">
            {actor.internalRole ? <span className="hidden rounded-full border border-line px-3 py-1 text-xs text-muted sm:inline">{actor.internalRole.replaceAll("_", " ")}</span> : null}
            <UserButton />
          </div>
        </div>
        <nav aria-label="Mobile primary navigation" className="flex gap-1 overflow-visible border-t border-line px-4 py-2 md:hidden">
          <NavigationLinks navigation={navigation} />
        </nav>
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
