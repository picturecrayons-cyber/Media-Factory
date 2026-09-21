import { Link, useRouterState } from "@tanstack/react-router";
import { Search, Shield } from "lucide-react";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCinemaUI } from "@/lib/cinema-ui";
import { cn } from "@/lib/cn";

const LINKS = [
  { to: "/", label: "Home" },
  { to: "/browse", label: "Browse" },
  { to: "/my-list", label: "My List" },
  { to: "/plans", label: "Plans" },
  { to: "/account", label: "Account" },
] as const;

export function CinemaNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isPending } = useCurrentUserState();
  const setSearchOpen = useCinemaUI((s) => s.setSearchOpen);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40">
      <div className="pointer-events-auto bg-gradient-to-b from-bg via-bg/80 to-transparent">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:h-[72px] sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <img src="/logo.png" alt="" className="h-7 w-7 object-contain sm:h-8 sm:w-8" />
            <span className="font-display text-xs tracking-[0.22em] uppercase sm:text-sm">
              <span className="hidden text-muted sm:inline">Crayons </span>
              <span className="text-loop">Loop</span>
            </span>
          </Link>
          <nav className="ml-3 hidden items-center gap-5 text-sm text-muted md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={cn("transition-colors hover:text-fg", pathname === l.to && "text-fg")}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              aria-label="Search"
              onClick={() => setSearchOpen(true)}
              className="grid size-11 place-items-center rounded-md text-muted hover:bg-fg/8 hover:text-fg"
            >
              <Search className="size-4" />
            </button>
            <SignedIn>
              <Link
                to="/admin"
                className="grid size-11 place-items-center rounded-md text-muted hover:bg-fg/8 hover:text-fg"
                aria-label="Mission Control"
              >
                <Shield className="size-4" />
              </Link>
            </SignedIn>
            <div className="loop-user">
              {isPending ? (
                <div className="size-8 animate-pulse rounded-full bg-fg/10" />
              ) : user ? (
                <UserButton />
              ) : (
                <SignedOut>
                  <Link
                    to="/login"
                    className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-fg"
                  >
                    Sign in
                  </Link>
                </SignedOut>
              )}
            </div>
          </div>
        </div>
        <nav className="hide-scroll flex gap-4 overflow-x-auto px-4 pb-2 text-xs text-muted md:hidden">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className={cn("shrink-0 py-1", pathname === l.to && "text-fg")}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
