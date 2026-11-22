import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/bridge/status-rail";
import { createTitle, listTitles } from "@/lib/bridge/titles";
import { BRIDGE_LOOP_LANES } from "@/lib/bridge/loop-lanes";

const TITLE_LANGUAGES = ["Malayalam", "Tamil", "Telugu", "Kannada", "Hindi", "English", "Other"];

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
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <StatusChip status={t.status} />
            <Link
              to="/title/$id"
              params={{ id: t.id }}
              aria-label={t.status === "DRAFT" ? `Submit ${t.name} to Bridge workflow` : `Continue ${t.name} in Bridge`}
              className="inline-flex min-h-9 items-center justify-center rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-bg hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {t.status === "DRAFT" ? "Submit to Bridge" : "Continue in Bridge"}
            </Link>

          </div>
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
  const [loopDistributionPreference, setLoopDistributionPreference] = useState<"NOT_DECIDED" | "CONSIDER_LOOP" | "NOT_FOR_LOOP">("NOT_DECIDED");
  const [country, setCountry] = useState("India");
  const [releaseDate, setReleaseDate] = useState("");
  const [runtimeMinutes, setRuntimeMinutes] = useState("");
  const [director, setDirector] = useState("");
  const [producer, setProducer] = useState("");
  const [cast, setCast] = useState("");
  const [year, setYear] = useState("");
  const [fee, setFee] = useState("");
  const [showMore, setShowMore] = useState(!concise);
  const mut = useMutation({
    mutationFn: () => createTitle({
      data: {
        name: name.trim(),
        nameMl: nameMl.trim() || undefined,
        synopsis: synopsis.trim() || undefined,
        language,
        year: year ? Number(year) : undefined,
        runtimeMinutes: runtimeMinutes ? Number(runtimeMinutes) : undefined,
        licensingFeePaise: fee ? Math.round(Number(fee) * 100) : undefined,
        contentType,
        loopDistributionPreference,
        countryOfOrigin: country || undefined,
        releaseDate: releaseDate || undefined,
        director: director.trim() || undefined,
        producer: producer.trim() || undefined,
        cast: cast ? cast.split(",").map((v) => v.trim()).filter(Boolean) : undefined,
      },
    }),
    onSuccess: (res) => {
      toast("Title saved as DRAFT");
      void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
      if (res.title) navigate({ to: "/title/$id", params: { id: res.title.id } });
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Could not create title"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const feeInr = fee ? Number(fee) : undefined;
    const yearNum = year ? Number(year) : undefined;
    const runtimeNum = runtimeMinutes ? Number(runtimeMinutes) : undefined;
    if (feeInr !== undefined && (!Number.isFinite(feeInr) || feeInr < 0 || feeInr > 20_000_000)) {
      toast("License fee must be between ₹0 and ₹2,00,00,000"); return;
    }
    if (yearNum !== undefined && (!Number.isInteger(yearNum) || yearNum < 1895 || yearNum > 2100)) {
      toast("Enter a valid release year"); return;
    }
    if (runtimeNum !== undefined && (!Number.isInteger(runtimeNum) || runtimeNum < 1 || runtimeNum > 600)) {
      toast("Runtime must be between 1 and 600 minutes"); return;
    }
    if (synopsis.trim() && synopsis.trim().length < 20) {
      toast("Synopsis must contain at least 20 characters, or leave it blank"); return;
    }
    mut.mutate();
  }

  const fieldClass = "mt-1 h-10 w-full rounded-lg border border-line-strong bg-elevated px-3 text-sm";
  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-line bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">Title *<input required minLength={2} maxLength={160} value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} /></label>
        <label className="text-sm">Original language *
          <select required value={language} onChange={(e) => setLanguage(e.target.value)} className={fieldClass}>
            {TITLE_LANGUAGES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="text-sm">Content type *
          <select required value={contentType} onChange={(e) => setContentType(e.target.value)} className={fieldClass}>
            {BRIDGE_LOOP_LANES.map((lane) => <option key={lane.id} value={lane.loopType}>{lane.label}</option>)}
          </select>
        </label>
      </div>

      <div className="border-t border-line pt-3">
        <button type="button" aria-expanded={showMore} onClick={() => setShowMore((v) => !v)} className="text-sm font-semibold hover:text-accent">
          {showMore ? "Hide additional metadata −" : "Add more film details +"}
        </button>
        {showMore ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Original / Malayalam title<input maxLength={160} value={nameMl} onChange={(e) => setNameMl(e.target.value)} className={fieldClass} /></label>
            <label className="text-sm">Release year<input type="number" min={1895} max={2100} value={year} onChange={(e) => setYear(e.target.value)} className={fieldClass} /></label>
            <label className="text-sm">Country of origin<input maxLength={80} value={country} onChange={(e) => setCountry(e.target.value)} className={fieldClass} /></label>
            <label className="text-sm">Release date<input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} className={fieldClass} /></label>
            <label className="text-sm">Runtime (minutes)<input type="number" min={1} max={600} value={runtimeMinutes} onChange={(e) => setRuntimeMinutes(e.target.value)} className={fieldClass} /></label>
            <label className="text-sm">Director<input maxLength={160} value={director} onChange={(e) => setDirector(e.target.value)} className={fieldClass} /></label>
            <label className="text-sm">Producer / Production<input maxLength={200} value={producer} onChange={(e) => setProducer(e.target.value)} className={fieldClass} /></label>
            <label className="text-sm">Cast<textarea maxLength={4000} value={cast} onChange={(e) => setCast(e.target.value)} rows={2} placeholder="Separate names with commas" className="mt-1 w-full rounded-lg border border-line-strong bg-elevated px-3 py-2 text-sm" /></label>
            <label className="text-sm sm:col-span-2">Synopsis<textarea maxLength={4000} value={synopsis} onChange={(e) => setSynopsis(e.target.value)} rows={3} placeholder="Optional at draft creation; required before review submission" className="mt-1 w-full rounded-lg border border-line-strong bg-elevated px-3 py-2 text-sm" /></label>
            <label className="text-sm">Licensing fee (INR)<input type="number" min={0} max={20000000} step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Optional" className={fieldClass} /></label>
            <label className="text-sm sm:col-span-2">Loop distribution preference
              <select value={loopDistributionPreference} onChange={(e) => setLoopDistributionPreference(e.target.value as typeof loopDistributionPreference)} className={fieldClass}>
                <option value="NOT_DECIDED">Not decided yet</option><option value="CONSIDER_LOOP">Consider for Crayons Loop</option><option value="NOT_FOR_LOOP">Do not consider for Loop</option>
              </select>
              <span className="mt-1 block text-xs text-muted">Preference only. Does not publish or authorize distribution.</span>
            </label>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <p className="max-w-xl text-xs text-muted">Required fields are marked *. You can save a private draft and complete details later. QC, Rights, Licensing and Loop publication stay independent.</p>
        <Button type="submit" disabled={mut.isPending || name.trim().length < 2 || language.trim().length < 2}>{mut.isPending ? "Saving…" : "Save as Draft"}</Button>
      </div>
    </form>
  );
}
