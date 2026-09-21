import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { getConfig, listTitles, saveConfig, undoConfig } from "@/lib/cinema";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/admin/customization")({ component: Customize });

function Customize() {
  const { user, isPending } = useCurrentUserState();
  const cfg = useQuery({ queryKey: ["config"], queryFn: () => getConfig() });
  const titles = useQuery({ queryKey: ["titles"], queryFn: () => listTitles(), enabled: !!user });
  const [form, setForm] = useState({
    announcement: "",
    heroSlug: "jananam-1947-pranayam-thudarunnu",
    kidsLabel: "U-Rated Safe Cinema",
  });
  useEffect(() => {
    if (cfg.data?.config) setForm(cfg.data.config);
  }, [cfg.data]);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => saveConfig({ data: form }),
    onSuccess: () => {
      toast("Configuration saved — Undo available");
      void qc.invalidateQueries({ queryKey: ["config"] });
    },
  });
  const undo = useMutation({
    mutationFn: () => undoConfig(),
    onSuccess: (r) => {
      setForm(r.config);
      toast("Undid last configuration");
      void qc.invalidateQueries({ queryKey: ["config"] });
    },
  });

  if (isPending) return <main className="grid min-h-screen place-items-center text-muted">Loading…</main>;
  if (!user) return <RedirectToSignIn />;

  return (
    <AdminShell>
      <p className="text-[11px] tracking-[0.22em] text-loop uppercase">Configure</p>
      <h1 className="font-display mt-1 text-3xl tracking-wide">App Customization</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Each save is a revision. Undo restores the previous snapshot.
      </p>
      <form
        className="mt-8 max-w-xl space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label className="block text-xs tracking-wide text-muted uppercase">
          Home announcement
          <input
            value={form.announcement}
            onChange={(e) => setForm((f) => ({ ...f, announcement: e.target.value }))}
            className="mt-1 h-11 w-full rounded-md border border-line bg-elevated px-3 text-sm font-normal tracking-normal text-fg normal-case outline-none"
          />
        </label>
        <label className="block text-xs tracking-wide text-muted uppercase">
          Hero title
          <select
            value={form.heroSlug}
            onChange={(e) => setForm((f) => ({ ...f, heroSlug: e.target.value }))}
            className="mt-1 h-11 w-full rounded-md border border-line bg-elevated px-3 text-sm font-normal tracking-normal text-fg normal-case"
          >
            {(titles.data ?? []).map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs tracking-wide text-muted uppercase">
          Kids portal label
          <input
            value={form.kidsLabel}
            onChange={(e) => setForm((f) => ({ ...f, kidsLabel: e.target.value }))}
            className="mt-1 h-11 w-full rounded-md border border-line bg-elevated px-3 text-sm font-normal tracking-normal text-fg normal-case outline-none"
          />
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending}>
            Save configuration
          </Button>
          <Button type="button" variant="outline" onClick={() => undo.mutate()}>
            Undo
          </Button>
        </div>
      </form>
    </AdminShell>
  );
}
