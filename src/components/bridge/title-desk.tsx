import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/bridge/status-rail";
import { createTitle, listTitles } from "@/lib/bridge/titles";

export function TitleList({ empty, query = "" }: { empty: string; query?: string }) {
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const titles = (titlesQ.data?.titles ?? []).filter((t) => !query || `${t.name} ${t.language} ${t.year ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  if (titlesQ.isPending) return <p className="text-sm text-muted">Loading titles…</p>;
  if (titlesQ.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-accent">
        <p>Could not load titles.</p>
        <Button type="button" onClick={() => void titlesQ.refetch()}>Retry</Button>
      </div>
    );
  }
  if (!titles.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line rounded-sm border border-line">
      {titles.map((t) => (
        <li key={t.id}>
          <Link
            to="/title/$id"
            params={{ id: t.id }}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-fg/5"
          >
            <div>
              <p className="font-medium">{t.name}</p>
              <p className="text-sm text-muted">
                {t.contentType ? `${t.contentType} · ` : ""}
                {t.language}
                {t.year ? ` · ${t.year}` : ""}
              </p>
            </div>
            <StatusChip status={t.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function CreateTitleForm({
  defaults,
}: {
  defaults?: { language?: string; country?: string; producer?: string; contentType?: string };
} = {}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      createTitle({
        data: {
          name,
          language: defaults?.language || "Malayalam",
          contentType: defaults?.contentType || "Film",
          countryOfOrigin: defaults?.country || "India",
          producer: defaults?.producer || undefined,
        },
      }),
    onSuccess: (res) => {
      toast("Title opened");
      void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
      if (res.title) navigate({ to: "/title/$id", params: { id: res.title.id } });
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Could not create title"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mut.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
      <label className="min-w-0 flex-1 text-sm">
        <span className="sr-only">Title</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="New title name" className="h-12 w-full rounded-xl border border-line-strong bg-white px-3" />
      </label>
      <Button type="submit" disabled={mut.isPending} className="h-12 rounded-xl px-5">{mut.isPending ? "Adding…" : "Add"}</Button>
    </form>
  );
}
