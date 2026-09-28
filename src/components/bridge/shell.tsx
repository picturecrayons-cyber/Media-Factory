import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import { cn } from "@/lib/cn";
import type { BridgeActor } from "@/lib/bridge/session";

const CRAYONS_LOOP_URL = import.meta.env.VITE_LOOP_URL || "https://crayonsloop.com";

type NavItem = {
  to?: string;
  href?: string;
  label: string;
  group: "WORKSPACE" | "BUSINESS" | "LOOP CMS" | "OPERATIONS" | "ADMIN";
  show: (a: BridgeActor) => boolean;
};

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", group: "WORKSPACE", show: () => true },
  { to: "/workspace", label: "Titles", group: "WORKSPACE", show: () => true },
  { to: "/workspace", label: "Submissions", group: "WORKSPACE", show: (a) => a.accountType !== "buyer" },
  { to: "/workspace", label: "Assets & QC", group: "WORKSPACE", show: (a) => a.accountType !== "buyer" || Boolean(a.internalRole) },
  { to: "/workspace", label: "Rights", group: "BUSINESS", show: () => true },
  { to: "/workspace", label: "Licensing", group: "BUSINESS", show: () => true },
  { to: "/buyer", label: "Buyers & Screeners", group: "BUSINESS", show: (a) => a.accountType === "buyer" || Boolean(a.internalRole) },
  { to: "/loop-cms", label: "Loop CMS", group: "LOOP CMS", show: (a) => Boolean(a.internalRole) },
  { to: "/loop-cms", label: "Catalog & Publish", group: "LOOP CMS", show: (a) => Boolean(a.internalRole) },
  { to: "/loop-cms", label: "Artwork & Metadata", group: "LOOP CMS", show: (a) => Boolean(a.internalRole) },
  { to: "/loop-cms", label: "Homepage & Visibility", group: "LOOP CMS", show: (a) => Boolean(a.internalRole) },
  { to: "/internal", label: "Distribution", group: "OPERATIONS", show: (a) => Boolean(a.internalRole) },
  { to: "/internal", label: "Deliveries", group: "OPERATIONS", show: (a) => Boolean(a.internalRole) },
  { to: "/internal", label: "Audit & Operations", group: "ADMIN", show: (a) => Boolean(a.internalRole) },
  { to: "/account", label: "Team & Account", group: "ADMIN", show: () => true },
];

function SidebarLink({ item }: { item: NavItem }) {
  if (item.href) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className="bridge-nav-item">
        <span>{item.label}</span><span className="text-[10px]">↗</span>
      </a>
    );
  }
  return <Link to={item.to!} className="bridge-nav-item" activeProps={{ className: "bridge-nav-item bridge-nav-active" }}>{item.label}</Link>;
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn("inline-flex items-center gap-2 font-display text-base font-semibold tracking-tight text-fg", className)} aria-label="Crayons Bridge home">
      <span aria-hidden="true" className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-fg">C</span>
      <span>CRAYONS <span className="text-accent">BRIDGE</span></span>
    </Link>
  );
}

export function BridgeShell({ actor, title, children }: { actor: BridgeActor; title: string; children: ReactNode }) {
  const groups: NavItem["group"][] = ["WORKSPACE", "BUSINESS", "LOOP CMS", "OPERATIONS", "ADMIN"];
  return (
    <div className="min-h-screen bg-bg text-fg">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <aside className="hidden border-r border-line bg-surface lg:flex lg:flex-col">
          <div className="border-b border-line px-5 py-5"><BrandMark /></div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            {groups.map((group) => {
              const items = NAV.filter((n) => n.group === group && n.show(actor));
              if (!items.length) return null;
              return (
                <div key={group} className="mb-6">
                  <p className="px-3 pb-2 text-[10px] font-semibold tracking-[0.2em] text-faint">{group}</p>
                  <div className="space-y-1">
                    {items.map((item, index) => <SidebarLink key={group + item.label + index} item={item} />)}
                    {group === "LOOP CMS" && actor.internalRole ? <SidebarLink item={{ href: CRAYONS_LOOP_URL, label: "Open Loop storefront", group, show: () => true }} /> : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-line p-4">
            <div className="rounded-2xl bg-elevated p-3">
              <p className="truncate text-sm font-semibold">{actor.organizationName || actor.displayName}</p>
              <p className="mt-1 truncate text-xs text-muted">{actor.internalRole?.replaceAll("_", " ") || actor.accountType.replaceAll("_", " ")}</p>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
            <div className="lg:hidden"><BrandMark /></div>
            <div className="hidden lg:block">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Crayons Bridge</p>
              <p className="text-sm text-muted">Media supply chain · rights · Loop CMS · delivery</p>
            </div>
            <div className="flex items-center gap-3">
              {actor.internalRole ? <span className="hidden rounded-full border border-line bg-elevated px-3 py-1 text-xs font-medium text-muted sm:inline-flex">{actor.internalRole.replaceAll("_", " ")}</span> : null}
              <UserButton />
            </div>
          </header>

          <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
            <div className="mb-7"><h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1></div>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
