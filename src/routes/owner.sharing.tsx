import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { listTitles } from "@/lib/cinema";
import { generateScreener, listScreeners } from "@/lib/ops";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/owner/sharing")({ component: Sharing });

function Sharing() {
  const { user, isPending } = useCurrentUserState();
  const titles = useQuery({ queryKey: ["titles"], queryFn: () => listTitles(), enabled: !!user });
  const rows = useQuery({ queryKey: ["screeners"], queryFn: () => listScreeners(), enabled: !!user });
  const client = useQueryClient();
  const published = (titles.data ?? []).filter((t) => t.published);
  const [titleId, setTitleId] = useState("");

  const gen = useMutation({
    mutationFn: () => generateScreener({ data: { titleId: titleId || published[0]?.id } }),
    onSuccess: (r) => {
      toast(`Screener ${r.token} · locks ${new Date(r.expiresAt).toLocaleString()}`);
      void client.invalidateQueries({ queryKey: ["screeners"] });
      void client.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  if (isPending) return <main className="grid min-h-screen place-items-center text-muted">Loading…</main>;
  if (!user) return <RedirectToSignIn />;

  return (
    <AdminShell>
      <p className="text-[11px] tracking-[0.22em] text-loop uppercase">CC 06 · Screeners & sharing</p>
      <h1 className="font-display mt-1 text-3xl tracking-wide">Buyer screeners</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Dynamic forensic watermarks and 72-hour time-locks. Links are session-bound.
      </p>

      <form
        className="mt-8 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-elevated p-4"
        onSubmit={(e) => {
          e.preventDefault();
          gen.mutate();
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
        <Button type="submit" disabled={gen.isPending || !published.length}>
          Generate link
        </Button>
      </form>

      <table className="mt-8 w-full text-left text-sm">
        <thead className="text-[11px] tracking-wide text-muted uppercase">
          <tr>
            <th className="pb-2 font-medium">Token</th>
            <th className="pb-2 font-medium">Title</th>
            <th className="pb-2 font-medium">Watermark</th>
            <th className="pb-2 font-medium">Expires</th>
          </tr>
        </thead>
        <tbody>
          {(rows.data ?? []).map((s) => (
            <tr key={s.id} className="border-t border-line">
              <td className="py-2 font-mono text-xs">{s.token}</td>
              <td>{s.title_id}</td>
              <td className="text-muted">{s.watermark}</td>
              <td className="text-muted">{new Date(s.expires_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!(rows.data ?? []).length ? (
        <p className="mt-6 text-sm text-muted">No screeners yet. Generate a time-locked buyer link.</p>
      ) : null}
    </AdminShell>
  );
}
