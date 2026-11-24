import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { createRightsReadySubmission } from "@/lib/bridge/submissions";
import { BRIDGE_LOOP_LANES, type BridgeLoopLane } from "@/lib/bridge/loop-lanes";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/submit-film")({ component: RightsReadySubmission });

const LANGUAGES = ["Malayalam", "Tamil", "Telugu", "Kannada", "Hindi", "English"];
const TERRITORIES = ["IN", "GCC", "US", "CA", "GB", "AU", "Worldwide"];
const MEDIA_RIGHTS = [
  "OTT / Digital streaming",
  "SVOD",
  "TVOD",
  "AVOD / FAST",
  "Digital download",
  "Satellite",
  "Broadcast television",
  "Theatrical",
  "YouTube",
  "Music / Audio",
  "Physical distribution",
  "Educational",
  "Airline / Ancillary",
  "Festival / Screening",
];
const BUYERS = ["OTT platform", "Broadcaster", "Distributor", "Aggregator", "International buyer", "Educational buyer", "Festival / screening", "Crayons Loop", "Open to qualified buyers"];
const SYNOPSIS_MAX_WORDS = 250;
function countWords(value: string) {
  return value.trim() ? value.trim().split(/\\s+/).length : 0;
}

function RightsReadySubmission() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [contentType, setContentType] = useState<BridgeLoopLane>("Film");
  const [originalLanguage, setOriginalLanguage] = useState("Malayalam");
  const [rightsLanguages, setRightsLanguages] = useState<string[]>(["Malayalam"]);
  const [dubLanguages, setDubLanguages] = useState<string[]>([]);
  const [subtitleLanguages, setSubtitleLanguages] = useState<string[]>([]);
  const [bridgeDistributionAccepted, setBridgeDistributionAccepted] = useState(false);
  const [country, setCountry] = useState("India");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [runtime, setRuntime] = useState("");
  const [territories, setTerritories] = useState<string[]>(["IN"]);
  const [exploitation, setExploitation] = useState<string[]>(["OTT / Digital streaming"]);
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [exclusivity, setExclusivity] = useState<"EXCLUSIVE" | "NON_EXCLUSIVE">("NON_EXCLUSIVE");
  const [authorityType, setAuthorityType] = useState("RIGHTS_OWNER");
  const [evidenceType, setEvidenceType] = useState("RIGHTS_AGREEMENT");
  const [buyers, setBuyers] = useState<string[]>(["Open to qualified buyers"]);
  const [screenerMode, setScreenerMode] = useState<"NONE" | "PRIVATE_BRIDGE" | "SECURE_EXTERNAL">("PRIVATE_BRIDGE");
  const [screenerUrl, setScreenerUrl] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isPending) return <main className="grid min-h-screen place-items-center bg-bg p-6"><p className="text-sm text-muted">Loading session…</p></main>;
  if (!user) return <RedirectToSignIn />;

  const toggle = (value: string, values: string[], setValues: (v: string[]) => void) =>
    setValues(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await createRightsReadySubmission({
        data: {
          name,
          synopsis,
          contentType: contentType === "Series" ? "SERIES" : contentType === "Short" ? "SHORT" : contentType === "Vertical drama" ? "OTHER" : "FEATURE",
          originalLanguage,
          countryOfOrigin: country,
          releaseYear: Number(year),
          runtimeMinutes: Number(runtime),
          rightsLanguages: [...new Set([...rightsLanguages, ...dubLanguages, ...subtitleLanguages])],
          territories,
          exploitation,
          windowStart,
          windowEnd,
          exclusivity,
          authorityType: authorityType as "RIGHTS_OWNER",
          authorizationEvidenceType: evidenceType as "RIGHTS_AGREEMENT",
          authorizationConfirmed: confirmed,
          buyerChannels: buyers,
          screenerMode,
          screenerUrl: screenerUrl || undefined,
        },
      });
      void navigate({ to: "/title/$id", params: { id: result.titleId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit title");
    } finally {
      setBusy(false);
    }
  }

  const checks = [
    ["Title identity", Boolean(name && synopsis && countWords(synopsis) <= SYNOPSIS_MAX_WORDS && originalLanguage && country && year && runtime)],
    ["Rights scope", rightsLanguages.length > 0 && territories.length > 0 && exploitation.length > 0 && Boolean(windowStart && windowEnd)],
    ["Distribution appointment", bridgeDistributionAccepted],
    ["Authorization", Boolean(authorityType && evidenceType && confirmed)],
    ["Buyer intent", buyers.length > 0],
    ["Screener", screenerMode !== "SECURE_EXTERNAL" || Boolean(screenerUrl)],
  ];

  return (
    <main className="min-h-screen bg-bg p-6">
      <form onSubmit={(e) => void onSubmit(e)} className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-line bg-surface p-6 md:p-8">
        <BrandMark />
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Crayons Bridge</p>
          <h1 className="mt-2 font-display text-3xl">Submit title to Crayons Bridge</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">One simple submission to Bridge Admin. Bridge reviews the title and evidence before any buyer can see or license it.</p>
        </header>

        <section className="space-y-4">
          <h2 className="font-display text-xl">01 · Title</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">Title<input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
            <label className="text-sm">Loop lane<select value={contentType} onChange={(e) => setContentType(e.target.value as BridgeLoopLane)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3">{BRIDGE_LOOP_LANES.map((lane) => <option key={lane.id} value={lane.loopType}>{lane.label}</option>)}</select></label>
            <label className="text-sm">Original language<select value={originalLanguage} onChange={(e) => setOriginalLanguage(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3">{LANGUAGES.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="text-sm">Country<select value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"><option>India</option><option>United Arab Emirates</option><option>United States</option><option>United Kingdom</option><option>Other</option></select></label>
            <label className="text-sm">Release year<input required type="number" min="1895" max="2100" value={year} onChange={(e) => setYear(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
            <label className="text-sm">Runtime (minutes)<input required type="number" min="1" max="600" value={runtime} onChange={(e) => setRuntime(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
            <label className="text-sm sm:col-span-2">Synopsis <span className="text-muted">(maximum 250 words)</span><textarea required maxLength={2500} rows={4} value={synopsis} onChange={(e) => setSynopsis(e.target.value)} className="mt-1 w-full rounded-lg border border-line-strong bg-elevated px-3 py-2" /><span className="mt-1 block text-xs text-muted">{countWords(synopsis)} / {SYNOPSIS_MAX_WORDS} words</span></label>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-xl">02 · Rights you want Bridge to handle</h2>
          <div className="space-y-3">
            <div><p className="text-sm font-medium">Original film audio</p><p className="text-xs text-muted">The language spoken in the supplied master film.</p><div className="mt-2 flex flex-wrap gap-2">{LANGUAGES.map((x) => <label key={x} className="rounded-full border border-line px-3 py-2 text-sm"><input className="mr-2" type="checkbox" checked={rightsLanguages.includes(x)} onChange={() => toggle(x, rightsLanguages, setRightsLanguages)} />{x}</label>)}</div></div>
            <div><p className="text-sm font-medium">Dubbing / additional audio requested</p><p className="text-xs text-muted">Bridge may coordinate dubbing and post-production as a separate service. Selecting a language does not mean dubbing rights are already owned.</p><div className="mt-2 flex flex-wrap gap-2">{LANGUAGES.filter((x) => !rightsLanguages.includes(x)).map((x) => <label key={x} className="rounded-full border border-line px-3 py-2 text-sm"><input className="mr-2" type="checkbox" checked={dubLanguages.includes(x)} onChange={() => toggle(x, dubLanguages, setDubLanguages)} />{x}</label>)}</div></div>
            <div><p className="text-sm font-medium">Subtitle languages</p><div className="mt-2 flex flex-wrap gap-2">{LANGUAGES.filter((x) => !rightsLanguages.includes(x)).map((x) => <label key={x} className="rounded-full border border-line px-3 py-2 text-sm"><input className="mr-2" type="checkbox" checked={subtitleLanguages.includes(x)} onChange={() => toggle(x, subtitleLanguages, setSubtitleLanguages)} />{x}</label>)}</div></div>
            <div><p className="text-sm font-medium">Territories</p><div className="mt-2 flex flex-wrap gap-2">{TERRITORIES.map((x) => <label key={x} className="rounded-full border border-line px-3 py-2 text-sm"><input className="mr-2" type="checkbox" checked={territories.includes(x)} onChange={() => toggle(x, territories, setTerritories)} />{x}</label>)}</div></div>
            <div><p className="text-sm font-medium">Distribution rights requested</p><p className="text-xs text-muted">Select only the rights you are authorising Crayons Bridge to represent.</p><div className="mt-2 flex flex-wrap gap-2">{MEDIA_RIGHTS.map((x) => <label key={x} className="rounded-full border border-line px-3 py-2 text-sm"><input className="mr-2" type="checkbox" checked={exploitation.includes(x)} onChange={() => toggle(x, exploitation, setExploitation)} />{x}</label>)}</div></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">Rights start<input required type="date" value={windowStart.slice(0, 10)} onChange={(e) => setWindowStart(e.target.value + "T00:00:00.000Z")} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
              <label className="text-sm">Rights end<input required type="date" value={windowEnd.slice(0, 10)} onChange={(e) => setWindowEnd(e.target.value + "T23:59:59.999Z")} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
              <label className="text-sm">Exclusivity<select value={exclusivity} onChange={(e) => setExclusivity(e.target.value as typeof exclusivity)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"><option value="NON_EXCLUSIVE">Non-exclusive</option><option value="EXCLUSIVE">Exclusive</option></select></label>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-xl">03 · Authorization</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Your authority<select value={authorityType} onChange={(e) => setAuthorityType(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"><option value="RIGHTS_OWNER">Rights owner</option><option value="PRODUCER">Producer / production company</option><option value="AUTHORIZED_REPRESENTATIVE">Authorized representative</option><option value="DISTRIBUTOR_SALES_AGENT">Distributor / sales agent</option><option value="LICENSEE_WITH_ONWARD_RIGHTS">Licensee with onward rights</option><option value="OTHER">Other</option></select></label>
            <label className="text-sm">Evidence type<select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"><option value="RIGHTS_AGREEMENT">Rights agreement</option><option value="CHAIN_OF_TITLE">Chain of title</option><option value="AUTHORIZATION_LETTER">Authorization letter</option><option value="DISTRIBUTION_AGREEMENT">Distribution agreement</option><option value="OTHER">Other</option></select></label>
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm"><input required type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" /><span>I confirm that I am authorized to submit this title and that the selected rights scope is accurate. Bridge will verify the supporting evidence before licensing.</span></label>
          <p className="text-xs leading-relaxed text-muted">Your contracts and ownership documents stay private in Bridge. Bridge Admin will review this submission and request any missing documents before rights can be cleared.</p>
          <div className="rounded-xl border border-line p-3 space-y-2"><p className="text-sm font-medium">Bridge distribution appointment</p><p className="text-xs text-muted">Proposed appointment: Crayons Bridge as master distributor for 5 years, limited to the media, languages, territories and rights you explicitly select above. This is a proposal for review, not an automatic grant. The final term becomes effective only after the rights owner accepts the agreement and Bridge verifies the evidence.</p><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={bridgeDistributionAccepted} onChange={(e) => setBridgeDistributionAccepted(e.target.checked)} className="mt-1" /><span>I agree to discuss this proposed five-year master-distribution appointment with Crayons Bridge, subject to a separate written agreement.</span></label></div>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-xl">04 · Intended buyer channels</h2>
          <div><p className="text-sm font-medium">Buyer channels</p><div className="mt-2 flex flex-wrap gap-2">{BUYERS.map((x) => <label key={x} className="rounded-full border border-line px-3 py-2 text-sm"><input className="mr-2" type="checkbox" checked={buyers.includes(x)} onChange={() => toggle(x, buyers, setBuyers)} />{x}</label>)}</div></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Screener<select value={screenerMode} onChange={(e) => setScreenerMode(e.target.value as typeof screenerMode)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"><option value="PRIVATE_BRIDGE">Private Bridge screener</option><option value="SECURE_EXTERNAL">Secure external screener</option><option value="NONE">No screener yet</option></select></label>
            {screenerMode === "SECURE_EXTERNAL" ? <label className="text-sm">Secure screener URL<input required type="url" value={screenerUrl} onChange={(e) => setScreenerUrl(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label> : null}
          </div>
          <p className="text-xs text-muted">Screener access never grants master-download permission.</p>
        </section>

        <section className="rounded-2xl border border-line bg-elevated p-4">
          <h2 className="font-display text-lg">Submission check</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{checks.map(([label, ok]) => <p key={label as string} className="text-sm">{ok ? "✓" : "○"} {label as string}</p>)}</div>
          <p className="mt-3 text-xs leading-relaxed text-muted">Your submission goes to Bridge Admin first. It is not sent directly to buyers, does not grant distribution rights, and does not publish the title to buyers or Crayons Loop.</p>
        </section>

        {error ? <p role="alert" className="text-sm text-accent">{error}</p> : null}
        <Button type="submit" disabled={busy || !confirmed || countWords(synopsis) > SYNOPSIS_MAX_WORDS || !bridgeDistributionAccepted} className="w-full rounded-full">{busy ? "Submitting…" : "Submit to Crayons Bridge"}</Button>
        <p className="text-center text-xs text-muted">Crayons Bridge is operated by StreamVista OPC Pvt Ltd.</p>
      </form>
    </main>
  );
}
