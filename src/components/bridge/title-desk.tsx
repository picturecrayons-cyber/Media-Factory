import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/bridge/status-rail";
import { createTitle, listTitles } from "@/lib/bridge/titles";
import { BRIDGE_LOOP_LANES } from "@/lib/bridge/loop-lanes";

const STUDIO_TEST_FIXTURE_IDS = new Set([
  "86c01f36770066c716df7a6c0148e133",
  "3b9b45ab1af35bd1f9251aebb50b9e24",
  "test-fixture-paid-film-20261124",
]);

export function isStudioTestFixtureTitle(title: { id: string; name: string }): boolean {
  return STUDIO_TEST_FIXTURE_IDS.has(title.id);
}

type ProductCategory = "all" | "finished_film" | "story_concept";

export function TitleList({ empty, query = "", excludeTestFixtures = false }: { empty: string; query?: string; excludeTestFixtures?: boolean }) {
  const [category, setCategory] = useState<ProductCategory>("all");
  const titlesQ = useQuery({
    queryKey: ["bridge-titles"],
    queryFn: () => listTitles(),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const allTitles = (titlesQ.data?.titles ?? []).filter((t) => !excludeTestFixtures || !isStudioTestFixtureTitle(t));
  const finishedFilms = allTitles.filter((t) => (t.submissionType ?? "finished_film") === "finished_film");
  const storyConcepts = allTitles.filter((t) => t.submissionType === "story_concept");
  const source = category === "finished_film" ? finishedFilms : category === "story_concept" ? storyConcepts : allTitles;
  const titles = source.filter((t) => (!query || `${t.name} ${t.language} ${t.year ?? ""}`.toLowerCase().includes(query.toLowerCase())));
  if (titlesQ.isPending) return <p className="text-sm text-muted">Loading Bridge products…</p>;
  if (titlesQ.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-accent">
        <p>Could not load Bridge products.</p>
        <Button type="button" onClick={() => void titlesQ.refetch()}>Retry</Button>
      </div>
    );
  }
  const tabs: { id: ProductCategory; label: string; count: number }[] = [
    { id: "all", label: "All products", count: allTitles.length },
    { id: "finished_film", label: "Finished Films", count: finishedFilms.length },
    { id: "story_concept", label: "Stories / Concepts", count: storyConcepts.length },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter Bridge products">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={category === tab.id}
            onClick={() => setCategory(tab.id)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${category === tab.id ? "border-fg bg-fg text-bg" : "border-line text-muted hover:border-line-strong hover:text-fg"}`}
          >
            {tab.label} <span className="ml-1 tabular-nums opacity-75">{tab.count}</span>
          </button>
        ))}
      </div>
      {!titles.length ? <p className="text-sm text-muted">{category === "finished_film" ? "No Finished Films are available in this workspace yet." : category === "story_concept" ? "No Stories / Concepts are available in this workspace yet." : empty}</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {titles.map((t) => (
            <article key={t.id} className="flex min-h-40 flex-col justify-between rounded-xl border border-line bg-surface p-4 transition hover:border-accent">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">{t.submissionType === "story_concept" ? "Story / Concept" : "Finished Film"}</p>
                <Link to="/title/$id" params={{ id: t.id }} className="mt-2 block font-display text-lg font-semibold leading-snug hover:text-accent">{t.name}</Link>
                <p className="mt-2 text-xs text-muted">{[t.contentType, t.language, t.year ? String(t.year) : null].filter(Boolean).join(" · ") || "Details pending"}</p>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3"><StatusChip status={t.status} /><Link to="/title/$id" params={{ id: t.id }} className="text-sm font-semibold text-accent hover:underline">Open →</Link></div>
            </article>
          ))}
        </div>
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
