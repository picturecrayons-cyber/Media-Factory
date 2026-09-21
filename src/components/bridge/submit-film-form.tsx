import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listMySubmissions, submitFilm } from "@/lib/bridge/submissions";
import {
  CERTIFICATION_TEXT,
  COMMERCIAL_PREFERENCE_IDS,
  COMMERCIAL_PREFERENCE_LABELS,
  type CommercialPreferenceId,
} from "@/lib/bridge/submission-policy";

export function SubmitFilmForm() {
  const qc = useQueryClient();
  const listQ = useQuery({ queryKey: ["bridge-submissions"], queryFn: () => listMySubmissions() });
  const [directorName, setDirectorName] = useState("");
  const [studioBanner, setStudioBanner] = useState("");
  const [officialEmail, setOfficialEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [titleMl, setTitleMl] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [genre, setGenre] = useState("");
  const [language, setLanguage] = useState("Malayalam");
  const [year, setYear] = useState("");
  const [runtimeMinutes, setRuntime] = useState("");
  const [maturityRating, setMaturity] = useState("U/A");
  const [screenerUrl, setScreenerUrl] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [backdropUrl, setBackdropUrl] = useState("");
  const [prefs, setPrefs] = useState<CommercialPreferenceId[]>(["licensing"]);
  const [certify, setCertify] = useState(false);

  const mut = useMutation({
    mutationFn: () =>
      submitFilm({
        data: {
          directorName,
          studioBanner: studioBanner || undefined,
          officialEmail,
          phone: phone || undefined,
          title,
          titleMl: titleMl || undefined,
          synopsis,
          genre: genre || undefined,
          language,
          year: year ? Number(year) : undefined,
          runtimeMinutes: runtimeMinutes ? Number(runtimeMinutes) : undefined,
          maturityRating,
          screenerUrl,
          posterUrl: posterUrl || undefined,
          backdropUrl: backdropUrl || undefined,
          commercialPreferences: prefs,
          certify: true as const,
        },
      }),
    onSuccess: (res) => {
      toast(
        res.mailSent
          ? `Submitted ${res.submissionId.slice(0, 8)}. Confirmation mailed.`
          : `Submitted ${res.submissionId.slice(0, 8)}. Mail not sent.`,
      );
      void qc.invalidateQueries({ queryKey: ["bridge-submissions"] });
      void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
      void qc.invalidateQueries({ queryKey: ["studio-overview"] });
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Submit failed"),
  });

  function togglePref(id: CommercialPreferenceId) {
    setPrefs((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!certify) {
      toast("Rights certification is required");
      return;
    }
    mut.mutate();
  }

  const rows = listQ.data?.submissions ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <form onSubmit={onSubmit} className="grid gap-3 text-sm sm:grid-cols-2">
        <p className="sm:col-span-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          Creator / studio
        </p>
        <label>
          Director / creator *
          <input required value={directorName} onChange={(e) => setDirectorName(e.target.value)} className="mt-1 h-9 w-full rounded-sm border border-line-strong bg-elevated px-2" />
        </label>
        <label>
          Studio / banner
          <input value={studioBanner} onChange={(e) => setStudioBanner(e.target.value)} className="mt-1 h-9 w-full rounded-sm border border-line-strong bg-elevated px-2" />
        </label>
        <label>
          Official email *
          <input required type="email" value={officialEmail} onChange={(e) => setOfficialEmail(e.target.value)} className="mt-1 h-9 w-full rounded-sm border border-line-strong bg-elevated px-2" />
        </label>
        <label>
          WhatsApp / phone
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 h-9 w-full rounded-sm border border-line-strong bg-elevated px-2" />
        </label>

        <p className="sm:col-span-2 mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Film</p>
        <label className="sm:col-span-2">
          Title (English) *
          <input required value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 h-9 w-full rounded-sm border border-line-strong bg-elevated px-2" />
        </label>
        <label>
          Title (Malayalam)
          <input value={titleMl} onChange={(e) => setTitleMl(e.target.value)} className="mt-1 h-9 w-full rounded-sm border border-line-strong bg-elevated px-2" />
        </label>
        <label>
          Genre
          <input value={genre} onChange={(e) => setGenre(e.target.value)} className="mt-1 h-9 w-full rounded-sm border border-line-strong bg-elevated px-2" />
        </label>
        <label className="sm:col-span-2">
          Logline / synopsis *
          <textarea required rows={3} value={synopsis} onChange={(e) => setSynopsis(e.target.value)} className="mt-1 w-full rounded-sm border border-line-strong bg-elevated px-2 py-2" />
        </label>
        <label>
          Language
          <input value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-1 h-9 w-full rounded-sm border border-line-strong bg-elevated px-2" />
        </label>
        <label>
          Year
          <input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} className="mt-1 h-9 w-full rounded-sm border border-line-strong bg-elevated px-2" />
        </label>
        <label>
          Runtime (minutes)
          <input inputMode="numeric" value={runtimeMinutes} onChange={(e) => setRuntime(e.target.value)} className="mt-1 h-9 w-full rounded-sm border border-line-strong bg-elevated px-2" />
        </label>
        <label>
          Maturity
          <input value={maturityRating} onChange={(e) => setMaturity(e.target.value)} className="mt-1 h-9 w-full rounded-sm border border-line-strong bg-elevated px-2" />
        </label>

        <p className="sm:col-span-2 mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Media</p>
        <label className="sm:col-span-2">
          Screener URL * (https HLS / MP4)
          <input required type="url" value={screenerUrl} onChange={(e) => setScreenerUrl(e.target.value)} className="mt-1 h-9 w-full rounded-sm border border-line-strong bg-elevated px-2" />
        </label>
        <p className="sm:col-span-2 text-xs text-muted">Screener stays pending until media validation passes. A URL is not READY.</p>
        <label>
          Vertical poster URL
          <input type="url" value={posterUrl} onChange={(e) => setPosterUrl(e.target.value)} className="mt-1 h-9 w-full rounded-sm border border-line-strong bg-elevated px-2" />
        </label>
        <label>
          Backdrop URL
          <input type="url" value={backdropUrl} onChange={(e) => setBackdropUrl(e.target.value)} className="mt-1 h-9 w-full rounded-sm border border-line-strong bg-elevated px-2" />
        </label>

        <p className="sm:col-span-2 mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          Commercial preferences
        </p>
        <fieldset className="sm:col-span-2 grid grid-cols-2 gap-2">
          {COMMERCIAL_PREFERENCE_IDS.map((id) => (
            <label key={id} className="flex items-center gap-2 rounded-sm border border-line px-2 py-1.5">
              <input type="checkbox" checked={prefs.includes(id)} onChange={() => togglePref(id)} />
              {COMMERCIAL_PREFERENCE_LABELS[id]}
            </label>
          ))}
        </fieldset>
        <p className="sm:col-span-2 text-xs text-muted">
          Preferences only. Loop consumer prices are not set here. Publication requires rights + capture + Loop ingest.
        </p>

        <label className="sm:col-span-2 flex items-start gap-2 rounded-sm border border-line bg-surface p-3 text-xs leading-relaxed">
          <input type="checkbox" className="mt-1" checked={certify} onChange={(e) => setCertify(e.target.checked)} />
          <span>{CERTIFICATION_TEXT}</span>
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={mut.isPending || !certify}>
            {mut.isPending ? "Submitting…" : "Submit to Bridge"}
          </Button>
        </div>
      </form>

      <div>
        <h2 className="font-display text-xl">My submissions</h2>
        {listQ.data && "schemaPending" in listQ.data && listQ.data.schemaPending ? (
          <p className="mt-3 text-sm text-muted">Submission schema is not applied yet (migration 0009).</p>
        ) : null}
        {!rows.length ? (
          <p className="mt-3 text-sm text-muted">No film submissions yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-sm border border-line text-sm">
            {rows.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>{s.titleName}</span>
                <span className="text-muted">
                  {s.status.replaceAll("_", " ")} · screener {s.screenerStatus}
                </span>
                <Link to="/title/$id" params={{ id: s.titleId }} className="text-accent underline-offset-4 hover:underline">
                  Title
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
