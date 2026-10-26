import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import type { BridgeActor } from "@/lib/bridge/session";
import { cn } from "@/lib/cn";

type NavItem = {
  to: "/gallery" | "/dashboard" | "/internal" | "/studio" | "/buyer" | "/investor" | "/creator" | "/workspace" | "/deliveries" | "/account";
  label: string;
};

function navFor(actor: BridgeActor): NavItem[] {
  const desk: NavItem =
    actor.internalRole === "super_admin"
      ? { to: "/dashboard", label: "Ops" }
      : actor.internalRole
        ? { to: "/internal", label: "Ops" }
        : actor.accountType === "studio"
          ? { to: "/studio", label: "Desk" }
          : actor.accountType === "buyer"
            ? { to: "/buyer", label: "Desk" }
            : actor.accountType === "investor"
              ? { to: "/investor", label: "Desk" }
              : { to: "/creator", label: "Desk" };
  const items = [ { to: "/gallery", label: "Library" }, desk ];
  if (actor.accountType !== "buyer" && actor.accountType !== "investor") items.push({ to: "/workspace", label: "Titles" });
  items.push({ to: "/deliveries", label: "Deliveries" }, { to: "/account", label: "Account" });
  return items;
}

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
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">{navFor(actor).map((item) => <NavLink key={item.label} item={item} />)}</nav>
          <div className="ml-auto flex items-center gap-3">
            {actor.internalRole ? <span className="hidden rounded-full border border-line px-3 py-1 text-xs text-muted sm:inline">{actor.internalRole.replaceAll("_", " ")}</span> : null}
            <UserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="mb-5 font-display text-2xl font-semibold tracking-tight">{title}</h1>
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
