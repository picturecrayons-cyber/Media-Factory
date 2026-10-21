import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/bridge/status-rail";
import { createTitle, deleteEmptyDraftTitle, listTitles, updateTitle } from "@/lib/bridge/titles";
import { listTitleAssets, requestAssetDownload } from "@/lib/bridge/assets";
import type { BridgeTitle } from "@/lib/bridge/types";
import { BRIDGE_LOOP_LANES } from "@/lib/bridge/loop-lanes";

export function TitleList({ empty, query = "", canManage = false, canSeeInternalId = false }: { empty: string; query?: string; canManage?: boolean; canSeeInternalId?: boolean }) {
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const titles = (titlesQ.data?.titles ?? []).filter((t) => !query || `${t.name} ${t.language} ${t.year ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const deletableTitleIds = titlesQ.data?.deletableTitleIds ?? [];
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
        <li key={t.id}><TitleListItem title={t} canManage={canManage} canSeeInternalId={canSeeInternalId} canDeleteDraft={deletableTitleIds.includes(t.id)} /></li>
      ))}
    </ul>
  );
}


function TitleListItem({ title, canManage, canSeeInternalId, canDeleteDraft }: { title: BridgeTitle; canManage: boolean; canSeeInternalId: boolean; canDeleteDraft: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const copyTitleId = async () => {
    try {
      await navigator.clipboard.writeText(title.id);
      toast("Title ID copied");
    } catch {
      toast.error("Could not copy Title ID. Check browser clipboard permissions.");
    }
  };
  const [name, setName] = useState(title.name);
  const [language, setLanguage] = useState(title.language);
  const [year, setYear] = useState(title.year ? String(title.year) : "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const previewQ = useQuery({
    queryKey: ["bridge-title-list-thumbnail", title.id],
    queryFn: async () => {
      const result = await listTitleAssets({ data: { titleId: title.id } });
      const priority = ["thumbnail", "poster_vertical", "poster", "poster_horizontal"];
      const candidates = priority
        .map((kind) => result.assets.find((item) => item.kind === kind && item.verified))
        .filter((asset): asset is (typeof result.assets)[number] => Boolean(asset));
      for (const asset of candidates) {
        try {
          const signed = await requestAssetDownload({ data: { assetId: asset.id } });
          return signed.url;
        } catch {
          // Try the next public artwork variant if this one is not buyer-readable.
        }
      }
      return null;
    },
    enabled: false,
    retry: false,
    staleTime: 4 * 60 * 1000,
  });
  const save = useMutation({
    mutationFn: () => updateTitle({ data: {
      id: title.id,
      name: name.trim(),
      language: language.trim(),
      year: year.trim() ? Number(year) : null,
    } }),
    onSuccess: () => {
      toast("Title details updated");
      setEditing(false);
      void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
      void qc.invalidateQueries({ queryKey: ["bridge-title", title.id] });
    },
    onError: (error) => toast(error instanceof Error ? error.message : "Could not update title"),
  });
  const remove = useMutation({
    mutationFn: () => deleteEmptyDraftTitle({ data: { id: title.id, confirmName: title.name } }),
    onSuccess: () => {
      toast("Empty draft title deleted");
      setConfirmDelete(false);
      void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Could not delete title";
      // Refresh eligibility after a stale delete action so titles with newly linked records
      // switch from Delete to Review instead of repeatedly offering a blocked action.
      void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
      toast.error(message);
    },
  });

  return (
    <div className="px-3 py-3 sm:px-4">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
        <Link to="/title/$id" params={{ id: title.id }} className="flex min-w-0 items-center gap-3 hover:text-accent sm:gap-4" onMouseEnter={() => { if (!previewQ.data && !previewQ.isFetching) void previewQ.refetch(); }} onFocus={() => { if (!previewQ.data && !previewQ.isFetching) void previewQ.refetch(); }}>
          <div className="grid h-16 w-12 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-elevated sm:h-20 sm:w-14">
            {previewQ.data ? (
              <img src={previewQ.data} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden="true" className="text-[9px] font-semibold tracking-wide text-muted">POSTER</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{title.name}</p>
            <p className="mt-1 text-sm text-muted">
              {title.contentType ? title.contentType + " · " : ""}
              {title.language}
              {title.year ? " · " + title.year : ""}
            </p>
          </div>
        </Link>
        {canSeeInternalId ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="font-mono" title={title.id}>ID: {title.id}</span>
            <Button type="button" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => void copyTitleId()} aria-label={`Copy title ID for ${title.name}`}>
              Copy ID
            </Button>
          </div>
        ) : null}
        </div>
        <StatusChip status={title.status} />
        {canManage ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => { setName(title.name); setLanguage(title.language); setYear(title.year ? String(title.year) : ""); setEditing((v) => !v); }}>
              {editing ? "Cancel" : "Edit"}
            </Button>
            {title.status === "DRAFT" && canDeleteDraft ? (
              <Button type="button" variant="outline" className="h-8 px-2 text-xs text-destructive" onClick={() => setConfirmDelete(true)}>Delete</Button>
            ) : title.status === "DRAFT" ? (
              <Link to="/title/$id" params={{ id: title.id }} className="inline-flex h-8 items-center rounded-md border border-line px-2 text-xs text-muted hover:text-fg" aria-label={`Review linked records for ${title.name}`}>Review</Link>
            ) : null}
          </div>
        ) : null}
      </div>
      {editing && canManage ? (
        <form className="mt-3 grid gap-2 rounded-lg border border-line bg-elevated/40 p-3 sm:grid-cols-[2fr_1fr_100px_auto]" onSubmit={(event) => { event.preventDefault(); if (!name.trim() || !language.trim() || (year && (!Number.isInteger(Number(year)) || Number(year) < 1895 || Number(year) > 2100))) { toast("Check title, language and year"); return; } save.mutate(); }}>
          <label className="text-xs text-muted">Title<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} className="mt-1 h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm text-fg" /></label>
          <label className="text-xs text-muted">Language<input value={language} onChange={(event) => setLanguage(event.target.value)} required maxLength={40} className="mt-1 h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm text-fg" /></label>
          <label className="text-xs text-muted">Year<input value={year} onChange={(event) => setYear(event.target.value)} inputMode="numeric" className="mt-1 h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm text-fg" /></label>
          <div className="flex items-end"><Button type="submit" disabled={save.isPending} className="h-9 px-3 text-xs">{save.isPending ? "Saving…" : "Save"}</Button></div>
        </form>
      ) : null}
      {confirmDelete ? (
        <div role="dialog" aria-modal="true" aria-label="Delete empty draft title" className="mt-3 rounded-lg border border-red-300/50 bg-elevated p-3">
          <p className="text-sm font-semibold">Delete “{title.name}”?</p>
          <p className="mt-1 text-xs text-muted">Only an empty DRAFT with no assets or linked business records can be deleted. Titles with history must be retained and reviewed.</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button type="button" className="h-8 px-3 text-xs" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? "Deleting…" : "Confirm delete"}</Button>
          </div>
          {remove.isError ? <p role="alert" className="mt-2 text-xs text-muted">{remove.error instanceof Error ? remove.error.message : "Deletion blocked"}</p> : null}
        </div>
      ) : null}
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
