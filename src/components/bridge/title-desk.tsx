import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createTitle, listTitles } from "@/lib/bridge/titles";

const STATUS: Record<string, string> = {
  DRAFT: "Draft",
  UPLOADING: "Uploading",
  PREPARING: "Preparing",
  QC_REVIEW: "In review",
  RIGHTS_REVIEW: "Rights",
  LICENSING_READY: "Ready",
  LIVE_FOR_BUYERS: "Live",
  IN_NEGOTIATION: "Negotiation",
  LICENSED: "Licensed",
  DELIVERED: "Delivered",
};

export function OwnerReport() {
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const titles = titlesQ.data?.titles ?? [];
  const review = titles.filter((title) => ["PREPARING", "QC_REVIEW", "RIGHTS_REVIEW"].includes(title.status));
  const listed = titles.filter((title) => ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(title.status));
  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <h2 className="text-lg font-semibold">Reports</h2>
      <p className="mt-1 text-sm text-muted">{titlesQ.isPending ? "Loading…" : `${titles.length} titles · ${review.length} in review · ${listed.length} cleared or listed`}</p>
      <ul className="mt-3 divide-y divide-line">
        {listed.map((title) => (
          <li key={title.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <Link to="/title/$id" params={{ id: title.id }} className="font-semibold">{title.name}</Link>
            <span className="text-muted">{STATUS[title.status] || title.status}</span>
          </li>
        ))}
        {!titlesQ.isPending && listed.length === 0 ? <li className="py-2 text-sm text-muted">Nothing is licensed yet.</li> : null}
      </ul>
    </section>
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
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
      {titles.map((t) => (
        <li key={t.id}>
          <Link to="/title/$id" params={{ id: t.id }} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{t.name}</span>
              <span className="text-xs text-muted">{t.language}{t.year ? ` · ${t.year}` : ""}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-muted">{STATUS[t.status] || t.status}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const LANGUAGES = ["Malayalam", "Tamil", "Telugu", "Kannada", "Hindi", "English", "Bengali", "Marathi", "Other"];
const TERRITORIES = ["India", "Worldwide", "South Asia", "GCC", "North America", "United Kingdom", "Europe", "Australia / New Zealand", "Other"];
const MEDIA = ["SVOD", "TVOD", "AVOD", "FAST", "Broadcast", "Theatrical", "Airline", "Educational", "Festival", "Crayons Loop"];
const DESTINATIONS = ["Crayons Loop", "External OTT", "Broadcast / TV", "TVOD / EST", "FAST", "Festival / Educational", "Buyer delivery"];

function toggle(current: string[], value: string, checked: boolean) {
  return checked ? [...current, value] : current.filter((item) => item !== value);
}

function Checks({ label, values, selected, onChange }: { label: string; values: string[]; selected: string[]; onChange: (value: string, checked: boolean) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <label key={value} className="flex min-h-10 items-center gap-2 rounded-full border border-line px-3 text-xs">
            <input type="checkbox" checked={selected.includes(value)} onChange={(e) => onChange(value, e.target.checked)} />
            {value}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CreateTitleForm({
  defaults,
}: {
  defaults?: { language?: string; country?: string; producer?: string; contentType?: string };
} = {}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [originalTitle, setOriginalTitle] = useState("");
  const [contentType, setContentType] = useState(defaults?.contentType || "Film");
  const [language, setLanguage] = useState(defaults?.language || "Malayalam");
  const [year, setYear] = useState("");
  const [runtime, setRuntime] = useState("");
  const [extraLanguages, setExtraLanguages] = useState<string[]>([]);
  const [synopsis, setSynopsis] = useState("");
  const [country, setCountry] = useState(defaults?.country || "India");
  const [releaseDate, setReleaseDate] = useState("");
  const [director, setDirector] = useState("");
  const [producer, setProducer] = useState(defaults?.producer || "");
  const [territories, setTerritories] = useState<string[]>(["India"]);
  const [rightsLanguages, setRightsLanguages] = useState<string[]>([defaults?.language || "Malayalam"]);
  const [media, setMedia] = useState<string[]>(["Crayons Loop"]);
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [exclusivity, setExclusivity] = useState<"EXCLUSIVE" | "NON_EXCLUSIVE">("NON_EXCLUSIVE");
  const [sublicensingAllowed, setSublicensingAllowed] = useState(false);
  const [promotionalRights, setPromotionalRights] = useState(true);
  const [rightsBasis, setRightsBasis] = useState<"OWNER" | "EXCLUSIVE_LICENSEE" | "AUTHORIZED_DISTRIBUTOR" | "PRODUCER_AUTHORITY">("OWNER");
  const [authorizationAttested, setAuthorizationAttested] = useState(false);
  const [screenerAccess, setScreenerAccess] = useState<"BRIDGE_PRIVATE_SCREENER" | "SCREENER_PENDING">("SCREENER_PENDING");
  const [destinations, setDestinations] = useState<string[]>(["Crayons Loop"]);
  const mut = useMutation({
    mutationFn: () =>
      createTitle({
        data: {
          name,
          originalTitle: originalTitle || undefined,
          contentType,
          language,
          additionalLanguages: extraLanguages,
          year: year ? Number(year) : undefined,
          runtimeMinutes: runtime ? Number(runtime) : undefined,
          synopsis,
          countryOfOrigin: country || undefined,
          releaseDate: releaseDate || undefined,
          director: director || undefined,
          producer: producer || undefined,
          territories,
          rightsLanguages,
          media,
          windowStart: new Date(windowStart).toISOString(),
          windowEnd: new Date(windowEnd).toISOString(),
          exclusivity,
          sublicensingAllowed,
          promotionalRights,
          rightsBasis,
          authorizationAttested,
          screenerAccess,
          intendedDestinations: destinations,
        },
      }),
    onSuccess: (res) => {
      toast("Title opened");
      void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
      if (res.title) navigate({ to: "/title/$id", params: { id: res.title.id } });
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Could not create title"),
  });

  if (!open) {
    return <Button type="button" className="h-12 rounded-xl px-5" onClick={() => setOpen(true)}>New title</Button>;
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-4 rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">New title</h2>
        <button type="button" className="text-sm font-semibold" onClick={() => setOpen(false)}>Close</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Title name
          <input id="new-title-name" name="name" autoComplete="off" required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line-strong px-3" />
        </label>
        <label className="text-sm font-medium">Original title
          <input id="new-title-original" name="original-title" autoComplete="off" value={originalTitle} onChange={(e) => setOriginalTitle(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line-strong px-3" />
        </label>
        <label className="text-sm font-medium">Content type
          <select id="new-title-type" name="content-type" autoComplete="off" value={contentType} onChange={(e) => setContentType(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line-strong px-3">
            <option>Film</option><option>Series</option><option>Vertical drama</option><option>Short</option>
          </select>
        </label>
        <label className="text-sm font-medium">Language
          <select id="new-title-language" name="language" autoComplete="off" value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line-strong px-3">
            {LANGUAGES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Year
          <input id="new-title-year" name="year" autoComplete="off" type="number" min="1895" max="2100" value={year} onChange={(e) => setYear(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line-strong px-3" />
        </label>
        <label className="text-sm font-medium">Runtime, minutes
          <input id="new-title-runtime" name="runtime" autoComplete="off" type="number" min="1" max="600" value={runtime} onChange={(e) => setRuntime(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line-strong px-3" />
        </label>
      </div>
      <Checks label="Additional languages" values={LANGUAGES} selected={extraLanguages} onChange={(v, c) => setExtraLanguages(toggle(extraLanguages, v, c))} />
      <label className="block text-sm font-medium">Synopsis
        <textarea id="new-title-synopsis" name="synopsis" autoComplete="off" required minLength={20} rows={4} value={synopsis} onChange={(e) => setSynopsis(e.target.value)} className="mt-1 w-full rounded-xl border border-line-strong px-3 py-2" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Country
          <input id="new-title-country" name="country" autoComplete="country-name" value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line-strong px-3" />
        </label>
        <label className="text-sm font-medium">Release date
          <input id="new-title-release" name="release-date" autoComplete="off" type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line-strong px-3" />
        </label>
        <label className="text-sm font-medium">Director
          <input id="new-title-director" name="director" autoComplete="off" value={director} onChange={(e) => setDirector(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line-strong px-3" />
        </label>
        <label className="text-sm font-medium">Producer
          <input id="new-title-producer" name="producer" autoComplete="organization" value={producer} onChange={(e) => setProducer(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line-strong px-3" />
        </label>
      </div>
      <Checks label="Territories" values={TERRITORIES} selected={territories} onChange={(v, c) => setTerritories(toggle(territories, v, c))} />
      <Checks label="Rights languages" values={LANGUAGES} selected={rightsLanguages} onChange={(v, c) => setRightsLanguages(toggle(rightsLanguages, v, c))} />
      <Checks label="Exploitation" values={MEDIA} selected={media} onChange={(v, c) => setMedia(toggle(media, v, c))} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Rights start
          <input id="new-title-window-start" name="rights-start" autoComplete="off" required type="date" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line-strong px-3" />
        </label>
        <label className="text-sm font-medium">Rights end
          <input id="new-title-window-end" name="rights-end" autoComplete="off" required type="date" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line-strong px-3" />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm font-medium">Exclusivity
          <select id="new-title-exclusivity" name="exclusivity" autoComplete="off" value={exclusivity} onChange={(e) => setExclusivity(e.target.value as typeof exclusivity)} className="mt-1 h-11 w-full rounded-xl border border-line-strong px-3">
            <option value="NON_EXCLUSIVE">Non-exclusive</option>
            <option value="EXCLUSIVE">Exclusive</option>
          </select>
        </label>
        <label className="text-sm font-medium">Sublicensing
          <select id="new-title-sublicense" name="sublicensing" autoComplete="off" value={String(sublicensingAllowed)} onChange={(e) => setSublicensingAllowed(e.target.value === "true")} className="mt-1 h-11 w-full rounded-xl border border-line-strong px-3">
            <option value="false">Not allowed</option>
            <option value="true">Allowed</option>
          </select>
        </label>
        <label className="text-sm font-medium">Promotional rights
          <select id="new-title-promo" name="promotional" autoComplete="off" value={String(promotionalRights)} onChange={(e) => setPromotionalRights(e.target.value === "true")} className="mt-1 h-11 w-full rounded-xl border border-line-strong px-3">
            <option value="true">Included</option>
            <option value="false">Not included</option>
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium">Rights basis
        <select id="new-title-basis" name="rights-basis" autoComplete="off" value={rightsBasis} onChange={(e) => setRightsBasis(e.target.value as typeof rightsBasis)} className="mt-1 h-11 w-full rounded-xl border border-line-strong px-3">
          <option value="OWNER">Rights owner</option>
          <option value="EXCLUSIVE_LICENSEE">Exclusive licensee</option>
          <option value="AUTHORIZED_DISTRIBUTOR">Authorized distributor</option>
          <option value="PRODUCER_AUTHORITY">Producer authority</option>
        </select>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input required type="checkbox" checked={authorizationAttested} onChange={(e) => setAuthorizationAttested(e.target.checked)} className="mt-1" />
        I am authorized to submit these rights. Evidence is still required before a buyer can license.
      </label>
      <label className="block text-sm font-medium">Screener
        <select id="new-title-screener" name="screener" autoComplete="off" value={screenerAccess} onChange={(e) => setScreenerAccess(e.target.value as typeof screenerAccess)} className="mt-1 h-11 w-full rounded-xl border border-line-strong px-3">
          <option value="SCREENER_PENDING">Upload after this record</option>
          <option value="BRIDGE_PRIVATE_SCREENER">Ready to upload now</option>
        </select>
      </label>
      <Checks label="Delivery" values={DESTINATIONS} selected={destinations} onChange={(v, c) => setDestinations(toggle(destinations, v, c))} />
      <Button type="submit" disabled={mut.isPending || !authorizationAttested} className="h-12 rounded-xl px-5">{mut.isPending ? "Saving…" : "Save title"}</Button>
    </form>
  );
}
