import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/bridge/status-rail";
import { createTitle, deleteDraftTitle, listTitles } from "@/lib/bridge/titles";
import { BRIDGE_LOOP_LANES } from "@/lib/bridge/loop-lanes";

export function TitleList({
  empty,
  query = "",
  showSubmissionFilters = false,
  allowDraftDelete = false,
}: {
  empty: string;
  query?: string;
  showSubmissionFilters?: boolean;
  allowDraftDelete?: boolean;
}) {
  const [sourceFilter, setSourceFilter] = useState<"all" | "independent_creator" | "studio">("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const titlesQ = useQuery({
    queryKey: ["bridge-titles"],
    queryFn: () => listTitles(),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDraftTitle({ data: { id, confirmation: "DELETE DRAFT" } }),
    onSuccess: () => { toast.success("Draft title deleted."); void titlesQ.refetch(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Draft deletion blocked."),
  });
  const allTitles = titlesQ.data?.titles ?? [];
  const titles = allTitles
    .filter((t) => sourceFilter === "all" || t.ownerAccountType === sourceFilter)
    .filter((t) => !query || (t.name + " " + t.language + " " + (t.year ?? "")).toLowerCase().includes(query.toLowerCase()))
    .filter((t) => statusFilter === "all" || t.status === statusFilter)
    .filter((t) => typeFilter === "all" || (t.contentType ?? "other").toLowerCase() === typeFilter)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (titlesQ.isPending) return <p className="text-sm text-muted">Loading titles…</p>;
  if (titlesQ.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-accent">
        <p>Could not load titles.</p>
        <Button type="button" onClick={() => void titlesQ.refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">{titles.length} of {allTitles.length} titles</p>
        <div className="flex flex-wrap gap-3">
          {showSubmissionFilters ? (
            <label className="text-xs text-muted">Source
              <select aria-label="Filter titles by submission source" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)} className="ml-2 h-9 rounded-lg border border-line bg-elevated px-2 text-sm text-fg">
                <option value="all">All sources</option>
                <option value="independent_creator">Creator submissions</option>
                <option value="studio">Studio submissions</option>
              </select>
            </label>
          ) : null}
          <label className="text-xs text-muted">Status
            <select aria-label="Filter titles by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="ml-2 h-9 rounded-lg border border-line bg-elevated px-2 text-sm text-fg">
              <option value="all">All statuses</option>
              {[...new Set(allTitles.map((t) => t.status))].sort().map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted">Type
            <select aria-label="Filter titles by type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="ml-2 h-9 rounded-lg border border-line bg-elevated px-2 text-sm text-fg">
              <option value="all">All types</option>
              {[...new Set(allTitles.map((t) => (t.contentType ?? "other").toLowerCase()))].sort().map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
        </div>
      </div>
      {!titles.length ? <p className="rounded-xl border border-dashed border-line p-6 text-sm text-muted">{empty}</p> : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {titles.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <Link to="/title/$id" params={{ id: t.id }} className="min-w-0 flex-1 rounded-md py-1 hover:text-accent">
                <p className="font-medium">{t.name}</p>
                <p className="text-sm text-muted">{t.contentType ? t.contentType + " · " : ""}{t.language}{t.year ? " · " + t.year : ""}</p>
              </Link>
              <div className="flex shrink-0 items-center gap-3">
                <StatusChip status={t.status} />
                {allowDraftDelete && t.status === "DRAFT" ? (
                  <Button type="button" size="sm" variant="outline" disabled={deleteMutation.isPending} onClick={() => {
                    if (window.confirm("Permanently delete this DRAFT title? This cannot be undone. Linked assets or records will block deletion.")) deleteMutation.mutate(t.id);
                  }}>Delete draft</Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">Filters only change the displayed list. Draft deletion is server-authorized, transactional, audited and blocked when linked records or assets remain.</p>
    </div>
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
