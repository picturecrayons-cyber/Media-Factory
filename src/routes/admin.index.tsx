import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Map, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { getConfig, platformOverview, syncPlatform } from "@/lib/cinema";
import { connectPlatform } from "@/lib/ops";
import { COMMAND_CENTERS } from "@/lib/command-centers";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/admin/")({ component: AdminHome });

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] tracking-wide uppercase",
        ok ? "bg-ok/15 text-ok" : "bg-warn/15 text-warn",
      )}
    >
      {label}
    </span>
  );
}

function AdminHome() {
  const { user, isPending } = useCurrentUserState();
  const q = useQuery({
    queryKey: ["overview"],
    queryFn: () => platformOverview(),
    enabled: !!user,
  });
  const cfg = useQuery({ queryKey: ["config"], queryFn: () => getConfig(), enabled: !!user });
  const qc = useQueryClient();
  const connected = Boolean(q.data?.connectedAt);

  const connect = useMutation({
    mutationFn: () => connectPlatform(),
    onSuccess: (r) => {
      toast(`Connected · ${r.db} · Razorpay ${r.razorpay}`);
      void qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
  const sync = useMutation({
    mutationFn: () => syncPlatform(),
    onSuccess: (r) => {
      toast(`Synced · ${r.liveTitles} live / ${r.hlsReady} HLS`);
      void qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  if (isPending) return <main className="grid min-h-screen place-items-center text-muted">Loading…</main>;
  if (!user) return <RedirectToSignIn />;
  const o = q.data;

  return (
    <AdminShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.22em] text-loop uppercase">Platform command center</p>
          <h1 className="font-display mt-1 text-3xl tracking-wide">Mission Control</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Mapped from crayonsloop.com — catalog, ingest, rights, QC, screeners, edge, and fail-closed playback.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => connect.mutate()} disabled={connect.isPending}>
            <Link2 className="size-4" />
            {connected ? "Reconnect" : "Connect"}
          </Button>
          <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
            <RefreshCw className={cn("size-4", sync.isPending && "animate-spin")} />
            Sync
          </Button>
        </div>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["Database", o?.db ?? "…", true],
            ["Catalog health", o ? `${o.liveTitles} live / ${o.totalTitles} total` : "…", true],
            ["HLS ingest", o ? `${o.hlsReady} stream(s) ready` : "…", (o?.hlsReady ?? 0) > 0],
            ["Fail-closed", o?.failClosed ? "ACTIVE" : "OPEN", !!o?.failClosed],
          ] as [string, string, boolean][]
        ).map(([k, v, ok]) => (
          <div key={k} className="rounded-lg border border-line bg-elevated p-4">
            <p className="text-[11px] tracking-wide text-muted uppercase">{k}</p>
            <p className="mt-2 font-display text-xl">{v}</p>
            <div className="mt-2">
              <StatusChip ok={!!ok} label={ok ? "Connected" : "Awaiting"} />
            </div>
          </div>
        ))}
      </div>

      <section className="mt-8 rounded-xl border border-line bg-panel p-5">
        <h2 className="text-sm tracking-[0.16em] text-muted uppercase">Connect · Sync · Map · Configure</h2>
        <p className="mt-2 text-xs text-muted">
          Razorpay {o?.razorpay ?? "—"} · Schema {o?.schema ?? "—"} · {o?.s3} · {o?.edge}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => connect.mutate()}
            className="rounded-lg border border-line bg-bg p-4 text-left hover:border-line-strong"
          >
            <Link2 className="size-4 text-muted" />
            <p className="font-display mt-3 tracking-wide">Connect</p>
            <p className="mt-2 text-xs text-muted">
              {connected
                ? `Handshake ${new Date(o?.connectedAt ?? "").toLocaleString()}`
                : "Bind database, Razorpay, HLS, S3, fail-closed"}
            </p>
          </button>
          <button
            type="button"
            onClick={() => sync.mutate()}
            className="rounded-lg border border-line bg-bg p-4 text-left hover:border-line-strong"
          >
            <RefreshCw className="size-4 text-muted" />
            <p className="font-display mt-3 tracking-wide">Sync</p>
            <p className="mt-2 text-xs text-muted">
              {o?.lastSync ? `Last ${new Date(o.lastSync).toLocaleString()}` : "Pull catalog telemetry"}
            </p>
          </button>
          <Link
            to="/admin/command-center"
            className="rounded-lg border border-line bg-bg p-4 hover:border-line-strong"
          >
            <Map className="size-4 text-muted" />
            <p className="font-display mt-3 tracking-wide">Map</p>
            <p className="mt-2 text-xs text-muted">10 command centers mapped to owner surfaces</p>
          </Link>
          <Link
            to="/admin/customization"
            className="rounded-lg border border-line bg-bg p-4 hover:border-line-strong"
          >
            <Settings2 className="size-4 text-muted" />
            <p className="font-display mt-3 tracking-wide">Configure</p>
            <p className="mt-2 text-xs text-muted">
              Announcement, hero, kids label · {cfg.data?.revisionCount ?? 0} revision(s) · Undo
            </p>
          </Link>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm tracking-[0.16em] text-muted uppercase">Ten command centers</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {COMMAND_CENTERS.map((c) => (
            <a
              key={c.id}
              href={c.href}
              className="flex items-start justify-between gap-3 rounded-lg border border-line bg-elevated p-4 hover:border-line-strong"
            >
              <div>
                <p className="text-[11px] text-faint">COMMAND CENTER {c.id}</p>
                <p className="mt-1 font-medium">{c.title}</p>
                <p className="mt-1 text-xs text-muted">{c.kicker}</p>
                <p className="mt-3 text-[11px] tracking-wide text-fg uppercase">{c.action}</p>
              </div>
              <StatusChip ok label={c.status} />
            </a>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}
