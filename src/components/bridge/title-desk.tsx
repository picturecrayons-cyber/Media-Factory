import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/bridge/status-rail";
import { archiveDraftTitle, createTitle, listArchivedDraftTitles, listTitles, restoreArchivedDraftTitle } from "@/lib/bridge/titles";
import { getBridgeSession } from "@/lib/bridge/session";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { BRIDGE_LOOP_LANES } from "@/lib/bridge/loop-lanes";

export function TitleList({ empty, query = "" }: { empty: string; query?: string }) {
  const { user, isPending: userPending } = useCurrentUserState();
  const sessionQ = useQuery({
    queryKey: ["bridge-session", user?.id],
    queryFn: () => getBridgeSession(),
    enabled: !userPending && Boolean(user),
    retry: false,
  });
  const actor = sessionQ.data?.profile ?? null;
  const identity = [actor?.userId ?? user?.id ?? "anonymous", actor?.accountType ?? "unresolved", actor?.organizationId ?? null];
  const titlesKey = ["bridge-titles", ...identity];
  const archivedKey = ["bridge-archived-titles", ...identity];
  const canManageOwnDrafts = Boolean(actor?.emailVerified && !actor.internalRole && ["independent_creator", "studio"].includes(actor.accountType));
  const titlesQ = useQuery({
    queryKey: titlesKey,
    queryFn: () => listTitles(),
    enabled: Boolean(actor?.userId && actor.emailVerified),
    retry: 1,
  });
  const archivedQ = useQuery({
    queryKey: archivedKey,
    queryFn: () => listArchivedDraftTitles(),
    enabled: canManageOwnDrafts,
    retry: 1,
  });
  const qc = useQueryClient();
  const [search, setSearch] = useState(query);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<{ id: string; name: string } | null>(null);
  const [restoreReason, setRestoreReason] = useState("");

  const archive = useMutation({
    mutationFn: () => {
      if (!archiveTarget) throw new Error("Select a draft first.");
      return archiveDraftTitle({ data: { titleId: archiveTarget.id, reason: archiveReason } });
    },
    onSuccess: () => {
      toast.success("Draft archived. No title or media was deleted.");
      setArchiveTarget(null);
      setArchiveReason("");
      void qc.invalidateQueries({ queryKey: titlesKey });
      void qc.invalidateQueries({ queryKey: archivedKey });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Archive blocked."),
  });
  const restore = useMutation({
    mutationFn: () => {
      if (!restoreTarget) throw new Error("Select an archived draft first.");
      return restoreArchivedDraftTitle({ data: { titleId: restoreTarget.id, reason: restoreReason } });
    },
    onSuccess: () => {
      toast.success("Draft restored.");
      setRestoreTarget(null);
      setRestoreReason("");
      void qc.invalidateQueries({ queryKey: titlesKey });
      void qc.invalidateQueries({ queryKey: archivedKey });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Restore blocked."),
  });

  if (userPending || sessionQ.isPending || titlesQ.isPending) return <p className="text-sm text-muted">Loading titles…</p>;
  if (sessionQ.isError || !actor) return <p role="alert" className="text-sm text-muted">Your account scope could not be verified. Refresh the workspace and try again.</p>;
  if (titlesQ.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-accent">
        <p>Could not load titles.</p>
        <Button type="button" onClick={() => void titlesQ.refetch()}>Retry</Button>
      </div>
    );
  }

  const finishedFilms = (titlesQ.data?.titles ?? []).filter((title) => title.submissionType !== "story_concept");
  const visibleTitles = finishedFilms.filter((title) => {
    const matchesText = !search || `${title.name} ${title.language} ${title.year ?? ""} ${title.contentType ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || title.status === statusFilter;
    return matchesText && matchesStatus;
  });

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
        <input aria-label="Search title library" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search titles, language or year" className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm" />
        <select aria-label="Filter by workflow status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-lg border border-line bg-bg px-3 text-sm">
          <option value="ALL">All statuses</option>
          {["DRAFT", "UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
        </select>
      </div>
      <p className="text-xs text-muted">{visibleTitles.length} of {finishedFilms.length} finished films · Story / Concept submissions are listed separately.</p>
      {visibleTitles.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {visibleTitles.map((title) => (
            <li key={title.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <Link to="/title/$id" params={{ id: title.id }} className="min-w-0 flex-1 rounded-md py-1 hover:text-accent">
                <p className="font-medium">{title.name}</p>
                <p className="text-sm text-muted">{title.contentType ? `${title.contentType} · ` : ""}{title.language}{title.year ? ` · ${title.year}` : ""}</p>
              </Link>
              <div className="flex shrink-0 items-center gap-3">
                <StatusChip status={title.status} />
                {canManageOwnDrafts && title.status === "DRAFT" ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setArchiveTarget({ id: title.id, name: title.name })}>Archive draft</Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">{finishedFilms.length ? "No finished films match these filters." : empty}</p>}

      {archivedQ.isError ? <p role="alert" className="text-sm text-muted">Archived drafts could not be loaded. Refresh to retry.</p> : null}
      {(archivedQ.data?.titles?.length ?? 0) > 0 ? (
        <section className="space-y-2">
          <h3 className="font-semibold">Archived drafts</h3>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {archivedQ.data?.titles.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div><p className="font-medium">{item.name}</p><p className="text-xs text-muted">{item.archive_reason}</p></div>
                <Button type="button" size="sm" variant="outline" onClick={() => setRestoreTarget({ id: item.id, name: item.name })}>Restore</Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {archiveTarget ? (
        <div role="dialog" aria-modal="true" aria-label="Confirm draft archive" className="rounded-xl border border-line bg-surface p-4 space-y-3">
          <h3 className="font-semibold">Archive draft: {archiveTarget.name}</h3>
          <p className="text-sm text-muted">Only an untouched DRAFT can be archived. Any linked asset, QC, Legal, Rights, payment, submission, delivery, document or unknown dependency blocks the operation. No record is hard-deleted.</p>
          <label className="block text-sm">Reason<textarea value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} minLength={3} maxLength={2000} required rows={3} className="mt-1 w-full rounded-lg border border-line bg-elevated p-3" /></label>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => { setArchiveTarget(null); setArchiveReason(""); }}>Cancel</Button>
            <Button type="button" disabled={archive.isPending || archiveReason.trim().length < 3} onClick={() => archive.mutate()}>{archive.isPending ? "Checking…" : "Confirm Archive"}</Button>
          </div>
        </div>
      ) : null}
      {restoreTarget ? (
        <div role="dialog" aria-modal="true" aria-label="Confirm draft restore" className="rounded-xl border border-line bg-surface p-4 space-y-3">
          <h3 className="font-semibold">Restore draft: {restoreTarget.name}</h3>
          <label className="block text-sm">Reason<textarea value={restoreReason} onChange={(event) => setRestoreReason(event.target.value)} minLength={3} maxLength={2000} required rows={3} className="mt-1 w-full rounded-lg border border-line bg-elevated p-3" /></label>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => { setRestoreTarget(null); setRestoreReason(""); }}>Cancel</Button>
            <Button type="button" disabled={restore.isPending || restoreReason.trim().length < 3} onClick={() => restore.mutate()}>{restore.isPending ? "Checking…" : "Confirm Restore"}</Button>
          </div>
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
