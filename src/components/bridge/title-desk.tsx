import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/bridge/status-rail";
import { createTitle, listTitles } from "@/lib/bridge/titles";

export function TitleList({ empty }: { empty: string }) {
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const titles = titlesQ.data?.titles ?? [];
  if (titlesQ.isPending) return <p className="text-sm text-muted">Loading titles…</p>;
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

export function CreateTitleForm() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [nameMl, setNameMl] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [year, setYear] = useState("");
  const [fee, setFee] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      createTitle({
        data: {
          name,
          nameMl: nameMl || undefined,
          synopsis: synopsis || undefined,
          year: year ? Number(year) : undefined,
          licensingFeePaise: fee ? Math.round(Number(fee) * 100) : undefined,
        },
      }),
    onSuccess: (res) => {
      toast("Title opened as DRAFT");
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
    <form onSubmit={onSubmit} className="grid gap-3 rounded-sm border border-line bg-surface p-4 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">
        Title
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3"
        />
      </label>
      <label className="text-sm">
        Malayalam title
        <input
          value={nameMl}
          onChange={(e) => setNameMl(e.target.value)}
          className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3"
        />
      </label>
      <label className="text-sm">
        Year
        <input
          inputMode="numeric"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3"
        />
      </label>
      <label className="text-sm sm:col-span-2">
        Synopsis
        <textarea
          value={synopsis}
          onChange={(e) => setSynopsis(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-sm border border-line-strong bg-elevated px-3 py-2"
        />
      </label>
      <label className="text-sm">
        License fee (INR)
        <input
          inputMode="decimal"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3"
        />
      </label>
      <div className="flex items-end">
        <Button type="submit" disabled={mut.isPending} className="w-full">
          {mut.isPending ? "Opening…" : "Open draft"}
        </Button>
      </div>
    </form>
  );
}
