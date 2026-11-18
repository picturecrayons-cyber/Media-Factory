import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/bridge/status-rail";
import { createTitle, listTitles } from "@/lib/bridge/titles";
import { inspectTitleDeletion } from "@/lib/bridge/title-deletion";
import { BRIDGE_LOOP_LANES } from "@/lib/bridge/loop-lanes";

export function TitleList({ empty, query = "", canDelete = false }: { empty: string; query?: string; canDelete?: boolean }) {
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const deletionPreflight = useQuery({
    queryKey: ["bridge-title-delete-preflight", deleteTarget?.id],
    queryFn: () => inspectTitleDeletion({ data: { id: deleteTarget!.id } }),
    enabled: Boolean(deleteTarget),
    retry: false,
  });
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
    <>
    <ul className="divide-y divide-line rounded-sm border border-line">
      {titles.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link
            to="/title/$id"
            params={{ id: t.id }}
            className="min-w-0 flex-1 rounded-md py-1 hover:text-accent"
          >
            <p className="font-medium">{t.name}</p>
            <p className="text-sm text-muted">
              {t.contentType ? `${t.contentType} · ` : ""}
              {t.language}
              {t.year ? ` · ${t.year}` : ""}
            </p>
          </Link>
          <div className="flex shrink-0 items-center gap-3">
            <StatusChip status={t.status} />
            {canDelete && t.status === "DRAFT" ? <Button type="button" variant="outline" className="rounded-full" onClick={() => setDeleteTarget({ id: t.id, name: t.name })}>Delete draft</Button> : null}
          </div>
        </li>
      ))}
    </ul>
    {deleteTarget ? (
      <div role="dialog" aria-modal="true" aria-labelledby="title-delete-review-heading" className="mt-4 rounded-2xl border border-amber-500/40 bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="title-delete-review-heading" className="font-display text-lg font-semibold">Draft deletion review</h3>
            <p className="mt-1 text-sm text-muted">Title: {deleteTarget.name}</p>
          </div>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setDeleteTarget(null)}>Close</Button>
        </div>
        {deletionPreflight.isFetching ? <p className="mt-4 text-sm text-muted">Checking deletion dependencies…</p> : null}
        {deletionPreflight.isError ? <p role="alert" className="mt-4 text-sm text-accent">Preflight could not be completed. Deletion remains blocked. {deletionPreflight.error instanceof Error ? deletionPreflight.error.message : ""}</p> : null}
        {deletionPreflight.data ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-semibold text-amber-400">BLOCKED — draft deletion is not available until draft-only dependencies and storage are verified.</p>
            <p className="text-xs text-muted">Schema-level dependencies are listed below. This check does not count live dependent rows or verify external obligations.</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {deletionPreflight.data.blockers.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
            <div className="rounded-xl border border-line p-3">
              <p className="text-sm font-medium">Database relationships ({deletionPreflight.data.foreignKeys.length})</p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-muted">
                {deletionPreflight.data.foreignKeys.map((fk, index) => <li key={index}>{fk.referencing_table}.{fk.referencing_column} — {fk.on_delete}</li>)}
              </ul>
            </div>
            <p className="text-xs text-muted">No title, database row, or media object has been changed. This review is read-only.</p>
          </div>
        ) : null}
      </div>
    ) : null}
    </>
  );
}

export function CreateTitleForm({ concise = false }: { concise?: boolean } = {}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [nameMl, setNameMl] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [language, setLanguage] = useState("Malayalam");
  const [contentType, setContentType] = useState("Film");
  const [country, setCountry] = useState("India");
  const [releaseDate, setReleaseDate] = useState("");
  const [runtimeMinutes, setRuntimeMinutes] = useState("");
  const [director, setDirector] = useState("");
  const [producer, setProducer] = useState("");
  const [cast, setCast] = useState("");
  const [year, setYear] = useState("");
  const [fee, setFee] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      createTitle({
        data: {
          name,
          nameMl: nameMl || undefined,
          synopsis: synopsis || undefined,
          language: language || undefined,
          year: year ? Number(year) : undefined,
          runtimeMinutes: runtimeMinutes ? Number(runtimeMinutes) : undefined,
          licensingFeePaise: fee ? Math.round(Number(fee) * 100) : undefined,
          contentType: contentType || undefined,
          countryOfOrigin: country || undefined,
          releaseDate: releaseDate || undefined,
          director: director || undefined,
          producer: producer || undefined,
          cast: cast ? cast.split(",").map((v) => v.trim()).filter(Boolean) : undefined,
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
    const feeInr = fee ? Number(fee) : undefined;
    if (feeInr !== undefined && (!Number.isFinite(feeInr) || feeInr < 0 || feeInr > 20_000_000)) {
      toast("License fee must be between ₹0 and ₹2,00,00,000");
      return;
    }
    mut.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">Title<input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
      <label className="text-sm">Language<input value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
      <label className="text-sm">Loop lane
        <select value={contentType} onChange={(e) => setContentType(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3">
          {BRIDGE_LOOP_LANES.map((lane) => <option key={lane.id} value={lane.loopType}>{lane.label}</option>)}
        </select>
      </label>
      {!concise && <>
        <label className="text-sm">Malayalam title<input value={nameMl} onChange={(e) => setNameMl(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm">Year<input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm">Country<input value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm">Release date<input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm">Runtime (minutes)<input inputMode="numeric" value={runtimeMinutes} onChange={(e) => setRuntimeMinutes(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm">Director<input value={director} onChange={(e) => setDirector(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm">Producer / Production<input value={producer} onChange={(e) => setProducer(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm sm:col-span-2">Cast<textarea value={cast} onChange={(e) => setCast(e.target.value)} rows={2} placeholder="Comma-separated names" className="mt-1 w-full rounded-lg border border-line-strong bg-elevated px-3 py-2" /></label>
        <label className="text-sm sm:col-span-2">Synopsis<textarea value={synopsis} onChange={(e) => setSynopsis(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-line-strong bg-elevated px-3 py-2" /></label>
        <label className="text-sm">License fee (INR)<input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Optional" className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
      </>}
      <div className="flex items-end sm:col-span-2"><Button type="submit" disabled={mut.isPending} className="rounded-full px-6">{mut.isPending ? "Creating…" : "Create Title"}</Button></div>
    </form>
  );
}
