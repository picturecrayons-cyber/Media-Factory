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
  { to: "/internal", label: "Internal", show: (a) => Boolean(a.internalRole) },
  { to: "/account", label: "Account", show: () => true },
];

export function BrandMark({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn("flex items-center", className)} aria-label="Crayons Bridge">
      <span className="rounded-sm bg-logo-plate px-2 py-1">
        <img
          src="/brand/crayons-bridge-logo.png"
          alt="Crayons Bridge"
          className="h-10 w-auto sm:h-12"
          width={198}
          height={48}
        />
      </span>
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
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <BrandMark />
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {LINKS.filter((l) => l.show(actor)).map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={cn(
                  "rounded-sm px-3 py-2 text-muted hover:text-fg",
                  l.to === home && "text-fg",
                )}
              >
                {l.label}
              </Link>
            ))}
            <UserButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Title record</p>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl">{title}</h1>
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}
