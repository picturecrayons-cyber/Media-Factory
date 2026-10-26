import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import type { BridgeActor } from "@/lib/bridge/session";
import { cn } from "@/lib/cn";

type NavItem = {
  to: "/gallery" | "/dashboard" | "/internal" | "/studio" | "/buyer" | "/investor" | "/creator" | "/workspace" | "/deliveries" | "/account";
  label: string;
};

const LEGAL = [
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
  { to: "/dmca", label: "DMCA" },
  { to: "/disclaimer", label: "Disclaimer" },
  { to: "/business", label: "Business" },
  { to: "/contact", label: "Contact" },
] as const;

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
  const items: NavItem[] = [
    { to: "/gallery", label: "Library" },
    desk,
  ];
  if (actor.accountType !== "buyer" && actor.accountType !== "investor") items.push({ to: "/workspace", label: "Titles" });
  items.push({ to: "/deliveries", label: "Deliveries" }, { to: "/account", label: "Account" });
  return items;
}

const ROLE: Record<string, string> = {
  independent_creator: "Creator",
  studio: "Studio",
  buyer: "Buyer",
  investor: "Investor",
  admin: "Admin",
  super_admin: "Super admin",
  qc_reviewer: "QC",
  legal_reviewer: "Legal",
  finance: "Finance",
  viewer: "Viewer",
};

function roleLabel(actor: BridgeActor) {
  const account = ROLE[actor.accountType] || "Account";
  const internal = actor.internalRole ? ROLE[actor.internalRole] : "";
  return internal ? `${account} · ${internal}` : account;
}

const row = "flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-muted";
const rowOn = "flex min-h-11 items-center rounded-xl bg-accent-soft px-3 text-sm font-semibold text-fg";
const tab = "flex min-h-14 items-center justify-center px-1 text-[11px] font-semibold text-muted";
const tabOn = "flex min-h-14 items-center justify-center px-1 text-[11px] font-semibold text-fg";

export function BrandMark({ className, to = "/" }: { className?: string; to?: "/" | "/gallery" }) {
  return (
    <Link to={to} className={cn("inline-flex items-center", className)} aria-label="Crayons Bridge">
      <svg viewBox="0 0 168 36" role="img" aria-label="Crayons Bridge" className="block h-8 w-auto">
        <g fill="none" stroke="#08b8e8" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4">
          <path d="M6 24V20C6 13 11 8 18 8s12 5 12 12v4" />
          <path d="M6 24h24M12 19v5M24 19v5" />
        </g>
        <text x="40" y="15" fill="currentColor" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="9" fontWeight="700" letterSpacing="1">CRAYONS</text>
        <text x="39" y="31" fill="#08b8e8" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="18" fontWeight="800">bridge</text>
      </svg>
    </Link>
  );
}

export function BridgeShell({ actor, title, children }: { actor: BridgeActor; title: string; children: ReactNode }) {
  const items = navFor(actor);
  return (
    <div className="min-h-dvh bg-[#f4f7f8] text-fg">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-white md:flex">
        <div className="px-4 py-5">
          <BrandMark to="/gallery" />
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {items.map((item) => (
            <Link key={item.to} to={item.to} className={row} activeProps={{ className: rowOn }}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line px-4 py-4">
          <UserButton />
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
            {LEGAL.map((item) => (
              <Link key={item.to} to={item.to}>{item.label}</Link>
            ))}
          </div>
        </div>
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white px-4 md:hidden">
          <BrandMark to="/gallery" />
          <UserButton />
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-8">
          <div className="mb-5 flex items-center justify-between gap-3 md:mb-6">
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
            <p className="shrink-0 rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold">{roleLabel(actor)}</p>
          </div>
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((item) => (
            <Link key={item.to} to={item.to} className={tab} activeProps={{ className: tabOn }}>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
