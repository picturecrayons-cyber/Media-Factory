import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import { UploadTray } from "@/components/bridge/upload-tray";
import type { BridgeActor } from "@/lib/bridge/session";
import { cn } from "@/lib/cn";

type NavItem = {
  to: "/gallery" | "/dashboard" | "/internal" | "/studio" | "/buyer" | "/investor" | "/creator" | "/workspace" | "/deliveries" | "/account" | "/admin";
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
  const staff = Boolean(actor.internalRole);
  const desk: NavItem | null = staff
    ? actor.internalRole === "super_admin"
      ? { to: "/dashboard", label: "Ops" }
      : { to: "/internal", label: "Ops" }
    : actor.accountType === "studio"
      ? { to: "/studio", label: "Desk" }
      : actor.accountType === "buyer"
        ? { to: "/buyer", label: "Desk" }
        : actor.accountType === "investor"
          ? { to: "/investor", label: "Desk" }
          : { to: "/creator", label: "Desk" };
  const items: NavItem[] = [];
  if (actor.accountType !== "investor" || staff) items.push({ to: "/gallery", label: "Library" });
  if (desk) items.push(desk);
  if (actor.internalRole === "admin" || actor.internalRole === "super_admin") items.push({ to: "/admin", label: "Admin" });
  if (actor.accountType === "studio" || actor.accountType === "independent_creator" || staff) {
    items.push({ to: "/deliveries", label: "Deliveries" });
  }
  items.push({ to: "/account", label: "Account" });
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

export function roleLabel(actor: BridgeActor) {
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
      <img src="/logo/crayons-bridge.png" alt="" className="h-11 w-auto rounded-md bg-black" />
    </Link>
  );
}

const ROLE_DESKS = [
  { to: "/admin" as const, label: "Admin" },
  { to: "/studio" as const, label: "Studio" },
  { to: "/buyer" as const, label: "Buyer" },
  { to: "/creator" as const, label: "Creator" },
];

export function BridgeShell({ actor, title, children }: { actor: BridgeActor; title: string; children: ReactNode }) {
  const items = navFor(actor);
  const path = useRouterState({ select: (state) => state.location.pathname });
  const canOpenRoles = actor.internalRole === "admin" || actor.internalRole === "super_admin";
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
            {title ? <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight md:text-2xl">{title}</h1> : <span />}
            <p className="shrink-0 rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold">{roleLabel(actor)}</p>
          </div>
          <p className="mb-4 text-xs text-muted">www.crayonspictures.in{path}</p>
          {canOpenRoles ? (
            <nav className="mb-5 flex flex-wrap gap-2" aria-label="Role desks">
              {ROLE_DESKS.map((desk) => (
                <Link key={desk.to} to={desk.to} className="rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold">
                  {desk.label}
                  <span className="mt-0.5 block font-normal text-muted">www.crayonspictures.in{desk.to}</span>
                </Link>
              ))}
            </nav>
          ) : null}
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
      <UploadTray />
    </div>
  );
}
