import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import { cn } from "@/lib/cn";
import type { BridgeActor } from "@/lib/bridge/session";
import { workspaceHome } from "@/lib/bridge/rbac";

const LINKS: { to: string; label: string; show: (a: BridgeActor) => boolean }[] = [
  { to: "/creator", label: "Creator", show: (a) => !a.internalRole && a.accountType === "independent_creator" },
  { to: "/studio", label: "Studio", show: (a) => !a.internalRole && a.accountType === "studio" },
  { to: "/buyer", label: "Buyer", show: (a) => !a.internalRole && a.accountType === "buyer" },
  { to: "/internal", label: "Admin", show: (a) => Boolean(a.internalRole) },
  { to: "/account", label: "Account", show: () => true },
];

export function BrandMark({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn("inline-flex items-center", className)} aria-label="Crayons Bridge home">
      <img src="/brand/bridge-logo.png" alt="Crayons Bridge" className="h-11 w-auto object-contain sm:h-12" />
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
  const home = workspaceHome(actor);
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <BrandMark />
          <nav className="hidden items-center gap-1 text-sm md:flex">
            {LINKS.filter((l) => l.show(actor)).map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={cn(
                  "rounded-full px-3 py-2 font-medium text-muted transition hover:bg-accent-soft hover:text-fg",
                  l.to === home && "bg-accent-soft text-accent",
                )}
              >
                {l.label}
              </Link>
            ))}
            <UserButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Crayons Bridge</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{title}</h1>
        </div>
        {children}
      </main>
    </div>
  );
}
