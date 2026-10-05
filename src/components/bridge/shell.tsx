import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import type { BridgeActor } from "@/lib/bridge/session";
import { cn } from "@/lib/cn";

type NavItem = { to: string; label: string };

function navFor(actor: BridgeActor): NavItem[] {
  if (actor.internalRole === "qc_reviewer") {
    return [
      { to: "/internal", label: "QC" },
      { to: "/deliveries", label: "Deliveries" },
      { to: "/account", label: "Account" },
    ];
  }
  if (actor.internalRole === "legal_reviewer") {
    return [
      { to: "/internal", label: "Legal" },
      { to: "/deliveries", label: "Deliveries" },
      { to: "/account", label: "Account" },
    ];
  }
  if (actor.internalRole === "finance") {
    return [
      { to: "/deliveries", label: "Finance" },
      { to: "/account", label: "Account" },
    ];
  }
  if (actor.internalRole === "viewer") {
    return [
      { to: "/internal", label: "Operations" },
      { to: "/account", label: "Account" },
    ];
  }
  if (actor.internalRole === "admin" || actor.internalRole === "super_admin") {
    return [
      { to: "/admin", label: "Admin" },
      { to: "/cms", label: "CMS" },
      { to: "/deliveries", label: "Deliveries" },
      { to: "/account", label: "Account" },
    ];
  }
  if (actor.accountType === "independent_creator") {
    return [
      { to: "/creator", label: "Titles" },
      { to: "/deliveries", label: "Deliveries" },
      { to: "/account", label: "Account" },
    ];
  }
  if (actor.accountType === "studio") {
    return [
      { to: "/studio", label: "Studio" },
      { to: "/deliveries", label: "Deliveries" },
      { to: "/account", label: "Account" },
    ];
  }
  if (actor.accountType === "buyer") {
    return [
      { to: "/buyer", label: "Buyer" },
      { to: "/account", label: "Account" },
    ];
  }
  if (actor.accountType === "investor") {
    return [
      { to: "/investor", label: "Investor" },
      { to: "/account", label: "Account" },
    ];
  }
  return [{ to: "/account", label: "Account" }];
}

function NavLink({ item }: { item: NavItem }) {
  return (
    <Link
      to={item.to}
      className="bridge-nav-item"
      activeProps={{ className: "bridge-nav-item bridge-nav-active" }}
    >
      {item.label}
    </Link>
  );
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

export function BridgeShell({
  actor,
  title,
  children,
}: {
  actor: BridgeActor;
  title: string;
  children: ReactNode;
}) {
  const nav = navFor(actor);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-50 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center gap-6 px-5 py-4 sm:px-6">
          <BrandMark />
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {nav.map((item) => <NavLink key={item.label} item={item} />)}
          </nav>
          <div className="ml-auto flex items-center">
            <UserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-5 py-8 sm:px-6 sm:py-10">
        <div className="mb-8">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">Crayons Bridge</p>
          <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
            {actor.organizationName ? <p className="text-sm text-muted">{actor.organizationName}</p> : null}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
