import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { listTitles, platformOverview } from "@/lib/cinema";
import { listTransfers, queueTransfer } from "@/lib/ops";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/owner/transfers")({ component: Transfers });

function Transfers() {
  const { user, isPending } = useCurrentUserState();
  const o = useQuery({ queryKey: ["overview"], queryFn: () => platformOverview(), enabled: !!user });
  const titles = useQuery({ queryKey: ["titles"], queryFn: () => listTitles(), enabled: !!user });
  const rows = useQuery({ queryKey: ["transfers"], queryFn: () => listTransfers(), enabled: !!user });
  const client = useQueryClient();
  const published = (titles.data ?? []).filter((t) => t.published);
  const [titleId, setTitleId] = useState("");
  const [destination, setDestination] = useState<"edge" | "s3" | "partner">("edge");

  const queue = useMutation({
    mutationFn: () =>
      queueTransfer({
        data: { titleId: titleId || published[0]?.id, destination },
      }),
    onSuccess: (r) => {
      toast(`Queued · ${r.destination}`);
      void client.invalidateQueries({ queryKey: ["transfers"] });
    },
  });

  if (isPending) return <main className="grid min-h-screen place-items-center text-muted">Loading…</main>;
  if (!user) return <RedirectToSignIn />;

  return (
    <AdminShell>
      <p className="text-[11px] tracking-[0.22em] text-loop uppercase">CC 07 · Content delivery</p>
      <h1 className="font-display mt-1 text-3xl tracking-wide">Edge transfers</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Edge distribution via {o.data?.edge ?? "stream.crayonsloop.com"} and cloud transfers.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-elevated p-4">
          <p className="text-[11px] tracking-wide text-muted uppercase">Edge</p>
          <p className="mt-2 font-mono text-sm">{o.data?.edge}</p>
        </div>
        <div className="rounded-lg border border-line bg-elevated p-4">
          <p className="text-[11px] tracking-wide text-muted uppercase">Origin bucket</p>
          <p className="mt-2 font-mono text-sm">{o.data?.s3}</p>
        </div>
      </div>

      <form
        className="mt-8 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-elevated p-4"
        onSubmit={(e) => {
          e.preventDefault();
          queue.mutate();
        }}
      >
        <label className="text-xs tracking-wide text-muted uppercase">
          Title
          <select
            value={titleId || published[0]?.id || ""}
            onChange={(e) => setTitleId(e.target.value)}
            className="mt-1 block h-11 min-w-56 rounded-md border border-line bg-bg px-3 text-sm font-normal tracking-normal text-fg normal-case"
          >
            {published.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs tracking-wide text-muted uppercase">
          Destination
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value as typeof destination)}
            className="mt-1 block h-11 rounded-md border border-line bg-bg px-3 text-sm font-normal tracking-normal text-fg normal-case"
          >
            <option value="edge">Edge · stream.crayonsloop.com</option>
            <option value="s3">AWS S3 media bucket</option>
            <option value="partner">Partner drop</option>
          </select>
        </label>
        <Button type="submit" disabled={queue.isPending || !published.length}>
          Queue transfer
        </Button>
      </form>

      <table className="mt-8 w-full text-left text-sm">
        <thead className="text-[11px] tracking-wide text-muted uppercase">
          <tr>
            <th className="pb-2 font-medium">When</th>
            <th className="pb-2 font-medium">Title</th>
            <th className="pb-2 font-medium">Destination</th>
            <th className="pb-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {(rows.data ?? []).map((t) => (
            <tr key={t.id} className="border-t border-line">
              <td className="py-2 text-muted">{new Date(t.created_at).toLocaleString()}</td>
              <td>{t.title_id}</td>
              <td className="font-mono text-xs">{t.destination}</td>
              <td className="text-ok uppercase">{t.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!(rows.data ?? []).length ? (
        <p className="mt-6 text-sm text-muted">No cloud transfers queued.</p>
      ) : null}
    </AdminShell>
  );
}
