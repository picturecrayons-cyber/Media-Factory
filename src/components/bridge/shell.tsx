import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import { cn } from "@/lib/cn";
import type { BridgeActor } from "@/lib/bridge/session";

const CRAYONS_LOOP_URL = import.meta.env.VITE_LOOP_URL || "https://crayonsloop.com";

const LINKS: { to: string; label: string; show: (a: BridgeActor) => boolean }[] = [
  { to: "/dashboard", label: "Dashboard", show: () => true },
  { to: "/workspace", label: "Titles", show: () => true },
  { to: "/buyer", label: "Buyers", show: (a) => a.accountType === "buyer" || Boolean(a.internalRole) },
  { to: "/internal", label: "Deliveries & Operations", show: (a) => Boolean(a.internalRole) },
  { to: "/account", label: "Account & Team", show: () => true },
];

export function BrandMark({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn("inline-flex items-center", className)} aria-label="Crayons Bridge home">
      <img src="/brand/logo.png" alt="Crayons Bridge" className="h-11 w-auto object-contain sm:h-12" />
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
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <BrandMark />
          <nav className="hidden items-center gap-2 text-sm md:flex">
            {LINKS.filter((l) => l.show(actor)).map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="rounded-full px-3.5 py-1.5 font-medium text-muted transition hover:bg-accent-soft hover:text-fg"
                activeProps={{ className: "bg-accent-soft text-accent font-semibold" }}
              >
                {l.label}
              </Link>
            ))}
            <div className="ml-2 pl-2 border-l border-line flex items-center gap-2">
              <a
                href={CRAYONS_LOOP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition flex items-center gap-1"
                title="Open Crayons Loop Consumer Streaming"
              >
                <span>Crayons Loop</span>
                <span className="text-[10px]">↗</span>
              </a>
              <UserButton />
            </div>
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
