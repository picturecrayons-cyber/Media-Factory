import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createTitle, listTitles } from "@/lib/bridge/titles";

const STATUS: Record<string, string> = {
  DRAFT: "Draft",
  UPLOADING: "Uploading",
  PREPARING: "Preparing",
  QC_REVIEW: "In review",
  RIGHTS_REVIEW: "Rights",
  LICENSING_READY: "Ready",
  LIVE_FOR_BUYERS: "Live",
  IN_NEGOTIATION: "Negotiation",
  LICENSED: "Licensed",
  DELIVERED: "Delivered",
};

function plate(name: string) {
  const tones = ["#102433", "#1b2433", "#141c28", "#1a2230", "#101820", "#1c2630"];
  let n = 0;
  for (const char of name) n = (n + char.charCodeAt(0)) % tones.length;
  return tones[n];
}

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
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {titles.map((t) => (
        <li key={t.id}>
          <Link to="/title/$id" params={{ id: t.id }} className="block overflow-hidden rounded-2xl border border-line bg-white">
            <div className="aspect-[2/3]" style={{ background: plate(t.name) }} />
            <div className="space-y-1 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{STATUS[t.status] || t.status}</p>
              <p className="line-clamp-2 text-sm font-semibold leading-5">{t.name}</p>
              <p className="mt-1 text-xs text-muted">
                {t.language}
                {t.year ? ` · ${t.year}` : ""}
              </p>
            </div>
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
