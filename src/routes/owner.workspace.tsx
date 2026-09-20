import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { listTitles, platformOverview } from "@/lib/cinema";
import { listQcJobs, listTerritories, runQc, toggleTerritory } from "@/lib/ops";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/owner/workspace")({ component: OwnerWorkspace });

type Tab = "ingest" | "rights" | "qc";

function OwnerWorkspace() {
  const { user, isPending } = useCurrentUserState();
  const [tab, setTab] = useState<Tab>("ingest");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "rights" || t === "qc" || t === "ingest") setTab(t);
  }, []);
  const select = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "ingest") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState({}, "", url);
  };

  const o = useQuery({ queryKey: ["overview"], queryFn: () => platformOverview(), enabled: !!user });
  const titles = useQuery({ queryKey: ["titles"], queryFn: () => listTitles(), enabled: !!user });
  const terr = useQuery({ queryKey: ["territories"], queryFn: () => listTerritories(), enabled: !!user });
  const qc = useQuery({ queryKey: ["qc"], queryFn: () => listQcJobs(), enabled: !!user });
  const client = useQueryClient();
  const tog = useMutation({
    mutationFn: (code: string) => toggleTerritory({ data: { code } }),
    onSuccess: () => {
      toast("Territory rule updated");
      void client.invalidateQueries({ queryKey: ["territories"] });
      void client.invalidateQueries({ queryKey: ["overview"] });
    },
  });
  const run = useMutation({
    mutationFn: (titleId: string) => runQc({ data: { titleId } }),
    onSuccess: () => {
      toast("QC pass recorded · LUFS -24");
      void client.invalidateQueries({ queryKey: ["qc"] });
      void client.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  if (isPending) return <main className="grid min-h-screen place-items-center text-muted">Loading…</main>;
  if (!user) return <RedirectToSignIn />;

  const published = (titles.data ?? []).filter((t) => t.published);

  return (
    <AdminShell>
      <p className="text-[11px] tracking-[0.22em] text-loop uppercase">Owner workspace</p>
      <h1 className="font-display mt-1 text-3xl tracking-wide">Media · Rights · QC</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Ingest ladders, territory geo-fence, and loudness verification for the Loop catalog.
      </p>

      <div className="mt-6 flex gap-1 rounded-lg border border-line bg-elevated p-1">
        {(
          [
            ["ingest", "Ingest"],
            ["rights", "Rights"],
            ["qc", "QC"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => select(id)}
            className={cn(
              "h-10 flex-1 rounded-md text-xs tracking-wide uppercase",
              tab === id ? "bg-fg text-bg" : "text-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "ingest" ? (
        <section className="mt-8 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-line bg-elevated p-4">
              <p className="text-[11px] tracking-wide text-muted uppercase">Status</p>
              <p className="mt-2 font-display text-xl">INGEST READY</p>
            </div>
            <div className="rounded-lg border border-line bg-elevated p-4">
              <p className="text-[11px] tracking-wide text-muted uppercase">HLS streams</p>
              <p className="mt-2 font-display text-xl">{o.data?.hlsReady ?? 0} ready</p>
              <p className="mt-1 text-xs text-muted">Adaptive HLS · 1080p · 720p · 480p</p>
            </div>
            <div className="rounded-lg border border-line bg-elevated p-4">
              <p className="text-[11px] tracking-wide text-muted uppercase">AWS S3 media bucket</p>
              <p className="mt-2 font-mono text-sm">{o.data?.s3}</p>
            </div>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] tracking-wide text-muted uppercase">
              <tr>
                <th className="pb-2 font-medium">Title</th>
                <th className="pb-2 font-medium">Ladder</th>
                <th className="pb-2 font-medium">Bucket</th>
              </tr>
            </thead>
            <tbody>
              {published.map((t) => (
                <tr key={t.id} className="border-t border-line">
                  <td className="py-3">{t.title}</td>
                  <td className="text-muted">{t.hlsReady ? "1080 / 720 / 480" : "Queued"}</td>
                  <td className="font-mono text-xs text-faint">s3://loop-media/{t.slug}/</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === "rights" ? (
        <section className="mt-8">
          <p className="text-sm text-muted">
            Territory geo-fencing · worldwide distribution with per-market rules.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(terr.data ?? []).map((row) => (
              <button
                key={row.code}
                type="button"
                onClick={() => tog.mutate(row.code)}
                className={cn(
                  "flex items-center justify-between rounded-lg border p-4 text-left",
                  row.enabled ? "border-ok/40 bg-ok/5" : "border-line bg-elevated",
                )}
              >
                <div>
                  <p className="font-mono text-xs text-faint">{row.code}</p>
                  <p className="mt-1">{row.name}</p>
                </div>
                <span className={cn("text-[10px] tracking-wide uppercase", row.enabled ? "text-ok" : "text-warn")}>
                  {row.enabled ? "Enforced" : "Off"}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "qc" ? (
        <section className="mt-8 space-y-4">
          <p className="text-sm text-muted">
            LUFS -24 audio normalization, black-frame scan, and 23.976 cadence verification.
          </p>
          <div className="flex flex-wrap gap-2">
            {published.map((t) => (
              <Button
                key={t.id}
                variant="outline"
                className="h-10 text-xs"
                onClick={() => run.mutate(t.id)}
                disabled={run.isPending}
              >
                Run QC · {t.title}
              </Button>
            ))}
          </div>
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] tracking-wide text-muted uppercase">
              <tr>
                <th className="pb-2 font-medium">When</th>
                <th className="pb-2 font-medium">Title</th>
                <th className="pb-2 font-medium">LUFS</th>
                <th className="pb-2 font-medium">Black</th>
                <th className="pb-2 font-medium">Cadence</th>
                <th className="pb-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {(qc.data ?? []).map((job) => (
                <tr key={job.id} className="border-t border-line">
                  <td className="py-2 text-muted">{new Date(job.created_at).toLocaleString()}</td>
                  <td>{job.title_id}</td>
                  <td>{job.lufs}</td>
                  <td>{job.black_frames}</td>
                  <td>{job.cadence}</td>
                  <td className="text-ok uppercase">{job.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </AdminShell>
  );
}
