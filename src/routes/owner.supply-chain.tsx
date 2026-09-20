import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { listTitles } from "@/lib/cinema";
import { listLocJobs, startLocJob } from "@/lib/ops";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/owner/supply-chain")({ component: SupplyChain });

function SupplyChain() {
  const { user, isPending } = useCurrentUserState();
  const titles = useQuery({ queryKey: ["titles"], queryFn: () => listTitles(), enabled: !!user });
  const jobs = useQuery({ queryKey: ["loc"], queryFn: () => listLocJobs(), enabled: !!user });
  const client = useQueryClient();
  const published = (titles.data ?? []).filter((t) => t.published);
  const [titleId, setTitleId] = useState("");
  const [language, setLanguage] = useState("en");
  const [kind, setKind] = useState<"subtitles" | "metadata" | "vertical">("subtitles");

  const start = useMutation({
    mutationFn: () =>
      startLocJob({
        data: { titleId: titleId || published[0]?.id, language, kind },
      }),
    onSuccess: () => {
      toast("Localization job queued");
      void client.invalidateQueries({ queryKey: ["loc"] });
    },
  });

  if (isPending) return <main className="grid min-h-screen place-items-center text-muted">Loading…</main>;
  if (!user) return <RedirectToSignIn />;

  return (
    <AdminShell>
      <p className="text-[11px] tracking-[0.22em] text-loop uppercase">CC 05 · AI & localization</p>
      <h1 className="font-display mt-1 text-3xl tracking-wide">Supply chain</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Multi-language subtitles, AI metadata translation, and vertical clips.
      </p>

      <form
        className="mt-8 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-elevated p-4"
        onSubmit={(e) => {
          e.preventDefault();
          start.mutate();
        }}
      >
        <label className="text-xs tracking-wide text-muted uppercase">
          Title
          <select
            value={titleId || published[0]?.id || ""}
            onChange={(e) => setTitleId(e.target.value)}
            className="mt-1 block h-11 min-w-48 rounded-md border border-line bg-bg px-3 text-sm font-normal tracking-normal text-fg normal-case"
          >
            {published.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs tracking-wide text-muted uppercase">
          Language
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="mt-1 block h-11 rounded-md border border-line bg-bg px-3 text-sm font-normal tracking-normal text-fg normal-case"
          >
            <option value="ml">Malayalam</option>
            <option value="en">English</option>
            <option value="ar">Arabic</option>
            <option value="te">Telugu</option>
          </select>
        </label>
        <label className="text-xs tracking-wide text-muted uppercase">
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="mt-1 block h-11 rounded-md border border-line bg-bg px-3 text-sm font-normal tracking-normal text-fg normal-case"
          >
            <option value="subtitles">Subtitles</option>
            <option value="metadata">Metadata</option>
            <option value="vertical">Vertical clip</option>
          </select>
        </label>
        <Button type="submit" disabled={start.isPending || !published.length}>
          Queue job
        </Button>
      </form>

      <table className="mt-8 w-full text-left text-sm">
        <thead className="text-[11px] tracking-wide text-muted uppercase">
          <tr>
            <th className="pb-2 font-medium">When</th>
            <th className="pb-2 font-medium">Title</th>
            <th className="pb-2 font-medium">Lang</th>
            <th className="pb-2 font-medium">Kind</th>
            <th className="pb-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {(jobs.data ?? []).map((j) => (
            <tr key={j.id} className="border-t border-line">
              <td className="py-2 text-muted">{new Date(j.created_at).toLocaleString()}</td>
              <td>{j.title_id}</td>
              <td className="uppercase">{j.language}</td>
              <td>{j.kind}</td>
              <td className="text-ok uppercase">{j.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminShell>
  );
}
