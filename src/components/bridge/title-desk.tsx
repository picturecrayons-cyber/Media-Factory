import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/bridge/status-rail";
import { createTitle, listTitles } from "@/lib/bridge/titles";
import { BRIDGE_LOOP_LANES } from "@/lib/bridge/loop-lanes";
import { listTitleAssets, requestAssetDownload } from "@/lib/bridge/assets";

function TitlePoster({ titleId, titleName }: { titleId: string; titleName: string }) {
  const assetsQ = useQuery({
    queryKey: ["bridge-title-poster-assets", titleId],
    queryFn: () => listTitleAssets({ data: { titleId } }),
    staleTime: 60_000,
    retry: false,
  });
  const poster = (assetsQ.data?.assets ?? [])
    .filter((asset) => asset.verified && asset.contentType?.startsWith("image/") && ["poster_vertical", "poster", "thumbnail"].includes(asset.kind))
    .sort((a, b) => {
      const priority = (kind: string) => kind === "poster_vertical" ? 0 : kind === "poster" ? 1 : 2;
      return priority(a.kind) - priority(b.kind);
    })[0];
  const previewQ = useQuery({
    queryKey: ["bridge-title-poster-preview", poster?.id],
    queryFn: () => requestAssetDownload({ data: { assetId: poster!.id } }),
    enabled: Boolean(poster?.verified && poster.contentType?.startsWith("image/")),
    staleTime: 4 * 60_000,
    retry: false,
  });
  const src = previewQ.data?.url;
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <div className="h-24 w-16 shrink-0 overflow-hidden rounded-md border border-line bg-elevated sm:h-28 sm:w-[4.65rem]" aria-label={`Poster for ${titleName}`}>
      {src && !imageFailed ? (
        <img src={src} alt={`${titleName} poster`} loading="lazy" className="h-full w-full object-cover" onError={() => setImageFailed(true)} />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-center text-[10px] text-muted">
          <span aria-hidden="true" className="text-lg leading-none">▧</span>
          <span>{assetsQ.isPending || Boolean(poster && previewQ.isPending) ? "Loading" : "No poster"}</span>
        </div>
      )}
    </div>
  );
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
    <ul className="divide-y divide-line rounded-sm border border-line">
      {titles.map((t) => (
        <li key={t.id}>
          <Link
            to="/title/$id"
            params={{ id: t.id }}
            className="flex items-center gap-3 px-3 py-3 hover:bg-fg/5 sm:gap-4 sm:px-4"
          >
            <TitlePoster titleId={t.id} titleName={t.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{t.name}</p>
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
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2" aria-label="Step 1: title metadata">
      <label className="text-sm sm:col-span-2">Title (required)<input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
      <label className="text-sm">Language (required)<input required value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
      <label className="text-sm">Loop lane
        <select value={contentType} onChange={(e) => setContentType(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3">
          {BRIDGE_LOOP_LANES.map((lane) => <option key={lane.id} value={lane.loopType}>{lane.label}</option>)}
        </select>
      </label>
      {!concise && <>
        <label className="text-sm">Malayalam title<input value={nameMl} onChange={(e) => setNameMl(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm">Release year (required)<input required type="number" min={1895} max={2100} value={year} onChange={(e) => setYear(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm">Country<input value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm">Release date<input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm">Runtime in minutes (required)<input required type="number" min={1} max={600} value={runtimeMinutes} onChange={(e) => setRuntimeMinutes(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm">Director (required)<input required value={director} onChange={(e) => setDirector(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm">Producer / Production (required)<input required value={producer} onChange={(e) => setProducer(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
        <label className="text-sm sm:col-span-2">Cast<textarea value={cast} onChange={(e) => setCast(e.target.value)} rows={2} placeholder="Comma-separated names" className="mt-1 w-full rounded-lg border border-line-strong bg-elevated px-3 py-2" /></label>
        <label className="text-sm sm:col-span-2">Synopsis (at least 20 characters, required)<textarea required minLength={20} value={synopsis} onChange={(e) => setSynopsis(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-line-strong bg-elevated px-3 py-2" /></label>
        <label className="text-sm">License fee (INR)<input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Optional" className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
      </>}
      <p className="text-xs leading-5 text-muted sm:col-span-2">Step 1 saves the draft metadata before any upload begins. Rights, territory windows, and legal authorization remain separate review gates; creating a draft does not authorize publication.</p>
      <div className="flex items-end sm:col-span-2"><Button type="submit" disabled={mut.isPending} className="rounded-full px-6">{mut.isPending ? "Saving metadata…" : "Save Metadata & Create Draft"}</Button></div>
    </form>
  );
}
