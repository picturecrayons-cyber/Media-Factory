import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/bridge/status-rail";
import { createTitle, listTitles, removeDraftTitle } from "@/lib/bridge/titles";
import { BRIDGE_LOOP_LANES } from "@/lib/bridge/loop-lanes";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";

export function TitleList({ empty, query = "" }: { empty: string; query?: string }) {
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const qc = useQueryClient();
  const [search, setSearch] = useState(query);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [kindFilter, setKindFilter] = useState("FILM");
  const archiveDraft = useMutation({
    mutationFn: (id: string) => removeDraftTitle({ data: { id } }),
    onSuccess: () => {
      toast.success("Draft archived");
      void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Draft could not be archived"),
  });
  const allTitles = titlesQ.data?.titles ?? [];
  const titles = allTitles.filter((t) => {
    const matchesText = !search || `${t.name} ${t.language} ${t.year ?? ""} ${t.contentType ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
    const matchesKind = kindFilter === "ALL" || kindFilter === "FILM";
    return matchesText && matchesStatus && matchesKind;
  });
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
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_180px]">
        <input
          aria-label="Search title library"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search titles, language or year"
          className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm"
        />
        <select aria-label="Filter by workflow status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-lg border border-line bg-bg px-3 text-sm">
          <option value="ALL">All statuses</option>
          {["DRAFT","UPLOADING","PREPARING","QC_REVIEW","RIGHTS_REVIEW","LICENSING_READY","LIVE_FOR_BUYERS","IN_NEGOTIATION","LICENSED","DELIVERED"].map((status) => <option key={status} value={status}>{status.replaceAll("_"," ")}</option>)}
        </select>
        <select aria-label="Filter by title type" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)} className="h-10 rounded-lg border border-line bg-bg px-3 text-sm">
          <option value="ALL">All title types</option>
          <option value="FILM">Finished films</option>
          <option value="CONCEPT">Story / Concept</option>
        </select>
      </div>
      <p className="text-xs text-muted">{titles.length} of {allTitles.length} finished-film records · Open a title to view its full Bridge workspace.</p>
      {kindFilter === "CONCEPT" ? <MyStoryConcepts /> : null}
      {kindFilter === "CONCEPT" ? null : !titles.length ? <p className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">{allTitles.length ? "No titles match these filters." : empty}</p> : (
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
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
            {t.status === "DRAFT" ? (
              <Button type="button" variant="outline" size="sm" disabled={archiveDraft.isPending}
                onClick={() => {
                  if (window.confirm("Archive this draft? It will be hidden from your active workspace and can be restored by Super Admin. Drafts with assets, rights or review records are blocked.")) archiveDraft.mutate(t.id);
                }}>
                {archiveDraft.isPending ? "Archiving…" : "Delete draft"}
              </Button>
            ) : null}
          </div>
        </li>
      ))}
      </ul>
      )}
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
      <label className="text-sm sm:col-span-2">Title *<input required minLength={2} maxLength={160} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
      <label className="text-sm">Original language *<input required minLength={2} maxLength={40} value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
      <label className="text-sm">Content type *
        <select required value={contentType} onChange={(e) => setContentType(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3">
          {BRIDGE_LOOP_LANES.map((lane) => <option key={lane.id} value={lane.loopType}>{lane.label}</option>)}
        </select>
      </label>
      {!concise && <p className="text-xs text-muted sm:col-span-2">Required fields are marked *. Complete the optional metadata before submitting. This creates a private DRAFT only.</p>}
      {!concise && <>
        <label className="text-sm">Malayalam / original title<input maxLength={160} value={nameMl} onChange={(e) => setNameMl(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm">Release year<input type="number" min={1895} max={2100} value={year} onChange={(e) => setYear(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm">Country of origin<input maxLength={80} value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm">Release date<input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm">Runtime (minutes)<input type="number" min={1} max={600} value={runtimeMinutes} onChange={(e) => setRuntimeMinutes(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm">Director<input maxLength={160} value={director} onChange={(e) => setDirector(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm">Producer / Production<input maxLength={200} value={producer} onChange={(e) => setProducer(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm sm:col-span-2">Cast<textarea maxLength={4000} value={cast} onChange={(e) => setCast(e.target.value)} rows={2} placeholder="Comma-separated names" className="mt-1 w-full rounded-lg border border-line-strong bg-elevated px-3 py-2" /></label>
        <label className="text-sm sm:col-span-2">Synopsis<textarea minLength={20} maxLength={4000} value={synopsis} onChange={(e) => setSynopsis(e.target.value)} rows={3} placeholder="20+ characters for a complete synopsis" className="mt-1 w-full rounded-lg border border-line-strong bg-elevated px-3 py-2" /></label>
        <label className="text-sm">License fee (INR)<input type="number" min={0} max={20000000} step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Optional" className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
      </>}
      <div className="sm:col-span-2 rounded-lg border border-line bg-bg/70 p-3 text-xs text-muted">Creator and Studio data are scoped to the authenticated owner/Studio organization. Draft creation does not grant QC, Legal, licensing or publishing approval.</div>
      <div className="flex items-end sm:col-span-2"><Button type="submit" disabled={mut.isPending || name.trim().length < 2 || language.trim().length < 2} className="rounded-full px-6">{mut.isPending ? "Saving…" : "Save as Draft"}</Button></div>
    </form>
  );
}
