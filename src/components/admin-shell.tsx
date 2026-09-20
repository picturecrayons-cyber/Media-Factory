import { Link, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { UserButton } from "@/lib/auth/gates";
import { getConfig, undoConfig } from "@/lib/cinema";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

const NAV = [
  { to: "/admin", label: "Dashboard" },
  { to: "/admin/command-center", label: "10 Command Centers" },
  { to: "/admin/titles", label: "Digital Titles" },
  { to: "/owner/workspace", label: "Owner Workspace" },
  { to: "/owner/supply-chain", label: "Localization" },
  { to: "/owner/sharing", label: "Screeners" },
  { to: "/owner/transfers", label: "Transfers" },
  { to: "/admin/plans", label: "Plans" },
  { to: "/admin/revenue", label: "Revenue" },
  { to: "/admin/customization", label: "Configure" },
] as const;

export function AdminShell({
  children,
  onUndo,
  canUndo,
}: {
  children: ReactNode;
  onUndo?: () => void;
  canUndo?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ["config"], queryFn: () => getConfig() });
  const undo = useMutation({
    mutationFn: () => undoConfig(),
    onSuccess: (r) => {
      toast(r.remaining ? "Last configuration undone" : "Restored default configuration");
      void qc.invalidateQueries({ queryKey: ["config"] });
      onUndo?.();
    },
  });
  const enabled = canUndo ?? (cfg.data?.revisionCount ?? 0) > 0;

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="grid size-10 place-items-center rounded-md hover:bg-fg/8">
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <p className="font-display text-sm tracking-[0.18em] uppercase">
              CL · Crayons Loop
            </p>
            <p className="text-[11px] text-muted">Admin Catalog Hub · Mission Control</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={!enabled || undo.isPending}
              onClick={() => undo.mutate()}
              className="inline-flex h-10 items-center gap-1 rounded-md border border-line px-3 text-xs tracking-wide uppercase disabled:opacity-40"
            >
              <Undo2 className="size-3.5" />
              Undo
            </button>
            <Link to="/" className="hidden text-xs text-muted hover:text-fg sm:inline">
              Public app
            </Link>
            <UserButton />
          </div>
        </div>
        <nav className="hide-scroll mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "h-9 shrink-0 rounded-md px-3 text-xs tracking-wide whitespace-nowrap uppercase",
                pathname === n.to ||
                  pathname === `${n.to}/` ||
                  (n.to !== "/admin" && pathname.startsWith(`${n.to}/`))
                  ? "bg-fg text-bg"
                  : "text-muted hover:bg-fg/8 hover:text-fg",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
