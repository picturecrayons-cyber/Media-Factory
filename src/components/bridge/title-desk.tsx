import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ArrowUpRight, Clapperboard, Film } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/bridge/status-rail";
import { createTitle, listTitles } from "@/lib/bridge/titles";
import { BRIDGE_LOOP_LANES } from "@/lib/bridge/loop-lanes";

export function TitleList({
  empty,
  query = "",
  contentType,
}: {
  empty: string;
  query?: string;
  /** Exact content-type filter for role dashboards such as Studio Finished Films. */
  contentType?: string;
}) {
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const titles = (titlesQ.data?.titles ?? []).filter((title) => {
    const matchesQuery = !query || `${title.name} ${title.language} ${title.year ?? ""}`.toLowerCase().includes(query.toLowerCase());
    const matchesType = !contentType || title.contentType.trim().toLowerCase() === contentType.trim().toLowerCase();
    return matchesQuery && matchesType;
  });

  if (titlesQ.isPending) return <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-muted">Loading your film catalogue…</div>;
  if (titlesQ.isError) return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-5 text-sm"><p className="text-accent">Could not load titles.</p><Button type="button" onClick={() => void titlesQ.refetch()}>Retry</Button></div>;
  if (!titles.length) return <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center"><Film className="mx-auto h-8 w-8 text-muted" /><p className="mt-3 font-medium">{empty}</p><p className="mt-1 text-sm text-muted">Your submissions will appear here as soon as a title is created.</p></div>;

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {titles.map((title, index) => (
        <li key={title.id} className="min-w-0">
          <Link to="/title/$id" params={{ id: title.id }} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg hover:shadow-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <div className="relative flex h-36 items-end overflow-hidden bg-[#142536] p-4">
              <div aria-hidden="true" className="pointer-events-none absolute -right-7 -top-12 h-44 w-44 rounded-full border border-white/10" />
              <div aria-hidden="true" className="pointer-events-none absolute -right-1 -top-6 h-28 w-28 rounded-full border border-[#d7b878]/30" />
              <div className="relative flex items-center gap-3"><span className="rounded-xl border border-white/15 bg-white/10 p-3 text-[#d7b878]"><Clapperboard className="h-6 w-6" /></span><span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">Bridge title · {String(index + 1).padStart(2, "0")}</span></div>
              <ArrowUpRight className="absolute bottom-4 right-4 h-5 w-5 text-white/70 transition group-hover:translate-x-1" />
            </div>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="min-w-0"><h3 className="line-clamp-2 font-semibold leading-snug text-fg">{title.name}</h3><p className="mt-1 text-xs text-muted">{title.contentType ? `${title.contentType} · ` : ""}{title.language}{title.year ? ` · ${title.year}` : ""}</p></div>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3"><StatusChip status={title.status} /><span className="text-xs font-medium text-muted group-hover:text-accent">Manage title</span></div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
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
