import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { createRightsReadySubmission } from "@/lib/bridge/submissions";
import { BRIDGE_LOOP_LANES, type BridgeLoopLane } from "@/lib/bridge/loop-lanes";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/submit-film")({ component: RightsReadySubmission });

const LANGUAGES = ["Malayalam", "Tamil", "Telugu", "Kannada", "Hindi", "English", "Other"];
const TERRITORIES = ["IN", "GCC", "US", "CA", "GB", "AU", "Worldwide"];
const EXPLOITATION = ["OTT / Streaming", "SVOD", "TVOD", "AVOD", "FAST", "Broadcast / TV", "Theatrical", "Educational", "Airline / Ancillary", "Festival / Screening"];
const BUYERS = ["OTT platform", "Broadcaster", "Distributor", "Aggregator", "International buyer", "Educational buyer", "Festival / screening", "Crayons Loop", "Open to qualified buyers"];
const LOOP_PREFERENCES = [
  { value: "NOT_DECIDED", label: "Not decided yet" },
  { value: "CONSIDER_LOOP", label: "Consider for Crayons Loop" },
  { value: "NOT_FOR_LOOP", label: "Do not consider for Loop" },
] as const;

type LoopPreference = (typeof LOOP_PREFERENCES)[number]["value"];

function RightsReadySubmission() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [contentType, setContentType] = useState<BridgeLoopLane>("Film");
  const [originalLanguage, setOriginalLanguage] = useState("Malayalam");
  const [otherLanguage, setOtherLanguage] = useState("");
  const [country, setCountry] = useState("India");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [runtime, setRuntime] = useState("");
  const [rightsLanguages, setRightsLanguages] = useState<string[]>(["Malayalam"]);
  const [territories, setTerritories] = useState<string[]>(["IN"]);
  const [exploitation, setExploitation] = useState<string[]>(["OTT / Streaming"]);
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [exclusivity, setExclusivity] = useState<"EXCLUSIVE" | "NON_EXCLUSIVE">("NON_EXCLUSIVE");
  const [loopPreference, setLoopPreference] = useState<LoopPreference>("NOT_DECIDED");
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

  const language = originalLanguage === "Other" ? otherLanguage.trim() : originalLanguage;
  const rightsWindowValid = Boolean(windowStart && windowEnd && new Date(windowEnd) > new Date(windowStart));
  const externalScreenerValid = screenerMode !== "SECURE_EXTERNAL" || screenerUrl.startsWith("https://") || screenerUrl.startsWith("http://");
  const stepValid = [
    Boolean(name.trim() && language.length >= 2 && country && Number(year) >= 1895 && Number(year) <= 2100 && Number(runtime) >= 1 && Number(runtime) <= 600 && synopsis.trim()),
    rightsLanguages.length > 0 && territories.length > 0 && exploitation.length > 0 && rightsWindowValid,
    Boolean(authorityType && evidenceType && confirmed),
    buyers.length > 0 && externalScreenerValid,
    true,
  ][step - 1];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (step !== 5 || !stepValid) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createRightsReadySubmission({
        data: {
          name: name.trim(),
          synopsis: synopsis.trim(),
          contentType,
          loopDistributionPreference: loopPreference,
          originalLanguage: language,
          countryOfOrigin: country,
          releaseYear: Number(year),
          runtimeMinutes: Number(runtime),
          rightsLanguages,
          territories,
          exploitation,
          windowStart,
          windowEnd,
          exclusivity,
          authorityType: authorityType as "RIGHTS_OWNER",
          authorizationEvidenceType: evidenceType as "RIGHTS_AGREEMENT",
          authorizationConfirmed: true,
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
    ["Title details", Boolean(name.trim() && language.length >= 2 && country && year && runtime && synopsis.trim())],
    ["Rights scope", rightsLanguages.length > 0 && territories.length > 0 && exploitation.length > 0 && rightsWindowValid],
    ["Authorization", Boolean(authorityType && evidenceType && confirmed)],
    ["Buyer access", buyers.length > 0 && externalScreenerValid],
    ["Loop preference", Boolean(loopPreference)],
  ];

  const steps = ["Title details", "Rights scope", "Authorization", "Buyer access", "Review"];

  return (
    <main className="min-h-screen bg-bg p-4 sm:p-6">
      <form onSubmit={(e) => void onSubmit(e)} className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-line bg-surface p-5 sm:p-7">
        <BrandMark />
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Crayons Bridge · Finished film</p>
          <h1 className="mt-2 font-display text-3xl">Start a finished-film submission</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">Complete one short step at a time. Your title is created as a DRAFT; QC, rights approval and Loop publication remain separate decisions.</p>
        </header>

        <nav aria-label="Submission steps" className="grid grid-cols-5 gap-1">
          {steps.map((label, index) => (
            <button key={label} type="button" onClick={() => index + 1 < step ? setStep(index + 1) : undefined} className="min-w-0 text-left" aria-current={step === index + 1 ? "step" : undefined}>
              <span className={`block h-1.5 rounded-full ${step >= index + 1 ? "bg-accent" : "bg-line"}`} />
              <span className={`mt-2 block truncate text-[10px] sm:text-xs ${step === index + 1 ? "font-semibold text-fg" : "text-muted"}`}>{index + 1}. {label}</span>
            </button>
          ))}
        </nav>

        {step === 1 ? (
          <section className="space-y-4">
            <div><h2 className="font-display text-xl">01 · Title details</h2><p className="mt-1 text-sm text-muted">Tell us what the finished work is.</p></div>
            <label className="block text-sm">Title<input required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">Content type<select required value={contentType} onChange={(e) => setContentType(e.target.value as BridgeLoopLane)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3">{BRIDGE_LOOP_LANES.map((lane) => <option key={lane.id} value={lane.loopType}>{lane.label}</option>)}</select></label>
              <label className="block text-sm">Original language<select required value={originalLanguage} onChange={(e) => setOriginalLanguage(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3">{LANGUAGES.map((x) => <option key={x}>{x}</option>)}</select></label>
              {originalLanguage === "Other" ? <label className="block text-sm sm:col-span-2">Specify language<input required value={otherLanguage} onChange={(e) => setOtherLanguage(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label> : null}
              <label className="block text-sm">Country of origin<select value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"><option>India</option><option>United Arab Emirates</option><option>United States</option><option>United Kingdom</option><option>Other</option></select></label>
              <label className="block text-sm">Release year<input required type="number" min="1895" max="2100" value={year} onChange={(e) => setYear(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
              <label className="block text-sm">Runtime (minutes)<input required type="number" min="1" max="600" value={runtime} onChange={(e) => setRuntime(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
            </div>
            <label className="block text-sm">Synopsis<textarea required maxLength={4000} rows={4} value={synopsis} onChange={(e) => setSynopsis(e.target.value)} className="mt-1 w-full rounded-lg border border-line-strong bg-elevated px-3 py-2" /></label>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-4">
            <div><h2 className="font-display text-xl">02 · Rights scope</h2><p className="mt-1 text-sm text-muted">Choose the rights you are authorized to offer.</p></div>
            <div><p className="text-sm font-medium">Rights languages</p><div className="mt-2 flex flex-wrap gap-2">{LANGUAGES.filter((x) => x !== "Other").map((x) => <label key={x} className="rounded-full border border-line px-3 py-2 text-sm"><input className="mr-2" type="checkbox" checked={rightsLanguages.includes(x)} onChange={() => toggle(x, rightsLanguages, setRightsLanguages)} />{x}</label>)}</div></div>
            <div><p className="text-sm font-medium">Territories</p><div className="mt-2 flex flex-wrap gap-2">{TERRITORIES.map((x) => <label key={x} className="rounded-full border border-line px-3 py-2 text-sm"><input className="mr-2" type="checkbox" checked={territories.includes(x)} onChange={() => toggle(x, territories, setTerritories)} />{x}</label>)}</div></div>
            <div><p className="text-sm font-medium">Exploitation rights</p><div className="mt-2 flex flex-wrap gap-2">{EXPLOITATION.map((x) => <label key={x} className="rounded-full border border-line px-3 py-2 text-sm"><input className="mr-2" type="checkbox" checked={exploitation.includes(x)} onChange={() => toggle(x, exploitation, setExploitation)} />{x}</label>)}</div></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">Rights start<input required type="date" value={windowStart.slice(0, 10)} onChange={(e) => setWindowStart(e.target.value + "T00:00:00.000Z")} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
              <label className="text-sm">Rights end<input required type="date" min={windowStart.slice(0, 10) || undefined} value={windowEnd.slice(0, 10)} onChange={(e) => setWindowEnd(e.target.value + "T23:59:59.999Z")} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
              <label className="text-sm">Exclusivity<select value={exclusivity} onChange={(e) => setExclusivity(e.target.value as typeof exclusivity)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"><option value="NON_EXCLUSIVE">Non-exclusive</option><option value="EXCLUSIVE">Exclusive</option></select></label>
            </div>
            <div className="rounded-xl border border-line p-4">
              <h3 className="font-semibold">Loop distribution preference</h3>
              <p className="mt-1 text-sm text-muted">This is separate from Content Type. Your preference does not publish the title to Loop.</p>
              <div className="mt-3 grid gap-2">
                {LOOP_PREFERENCES.map((option) => <label key={option.value} className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm"><input type="radio" name="loop-preference" checked={loopPreference === option.value} onChange={() => setLoopPreference(option.value)} className="mt-1" /><span>{option.label}</span></label>)}
              </div>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-4">
            <div><h2 className="font-display text-xl">03 · Authorization</h2><p className="mt-1 text-sm text-muted">Tell Bridge what authority you have to offer these rights.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Your authority<select value={authorityType} onChange={(e) => setAuthorityType(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"><option value="RIGHTS_OWNER">Rights owner</option><option value="PRODUCER">Producer / production company</option><option value="AUTHORIZED_REPRESENTATIVE">Authorized representative</option><option value="DISTRIBUTOR_SALES_AGENT">Distributor / sales agent</option><option value="LICENSEE_WITH_ONWARD_RIGHTS">Licensee with onward rights</option><option value="OTHER">Other</option></select></label>
              <label className="text-sm">Evidence type<select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"><option value="RIGHTS_AGREEMENT">Rights agreement</option><option value="CHAIN_OF_TITLE">Chain of title</option><option value="AUTHORIZATION_LETTER">Authorization letter</option><option value="DISTRIBUTION_AGREEMENT">Distribution agreement</option><option value="OTHER">Other</option></select></label>
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm"><input required type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" /><span>I confirm that I am authorized to submit this title and that the selected rights scope is accurate. Bridge will verify supporting evidence before licensing.</span></label>
            <p className="text-xs leading-relaxed text-muted">Upload the signed evidence in the private Title Document Vault. This declaration alone does not approve rights.</p>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="space-y-4">
            <div><h2 className="font-display text-xl">04 · Buyer access</h2><p className="mt-1 text-sm text-muted">Choose the buyer categories that may be considered after approval.</p></div>
            <div><p className="text-sm font-medium">Buyer channels</p><div className="mt-2 flex flex-wrap gap-2">{BUYERS.map((x) => <label key={x} className="rounded-full border border-line px-3 py-2 text-sm"><input className="mr-2" type="checkbox" checked={buyers.includes(x)} onChange={() => toggle(x, buyers, setBuyers)} />{x}</label>)}</div></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Screener<select value={screenerMode} onChange={(e) => setScreenerMode(e.target.value as typeof screenerMode)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"><option value="PRIVATE_BRIDGE">Private Bridge screener</option><option value="SECURE_EXTERNAL">Secure external screener</option><option value="NONE">No screener yet</option></select></label>
              {screenerMode === "SECURE_EXTERNAL" ? <label className="text-sm">Secure screener URL<input required type="url" value={screenerUrl} onChange={(e) => setScreenerUrl(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label> : null}
            </div>
            <p className="text-xs text-muted">Screener access never grants master-download permission. Buyer visibility is controlled by Bridge approval.</p>
          </section>
        ) : null}

        {step === 5 ? (
          <section className="space-y-4">
            <div><h2 className="font-display text-xl">05 · Review your submission</h2><p className="mt-1 text-sm text-muted">Check these details before creating the DRAFT title record.</p></div>
            <dl className="grid gap-3 rounded-xl border border-line p-4 text-sm sm:grid-cols-2">
              <div><dt className="text-muted">Title</dt><dd className="font-medium">{name}</dd></div>
              <div><dt className="text-muted">Content type</dt><dd className="font-medium">{BRIDGE_LOOP_LANES.find((x) => x.loopType === contentType)?.label}</dd></div>
              <div><dt className="text-muted">Original language</dt><dd className="font-medium">{language}</dd></div>
              <div><dt className="text-muted">Loop distribution preference</dt><dd className="font-medium">{LOOP_PREFERENCES.find((x) => x.value === loopPreference)?.label}</dd></div>
              <div><dt className="text-muted">Country / year</dt><dd className="font-medium">{country} · {year}</dd></div>
              <div><dt className="text-muted">Runtime</dt><dd className="font-medium">{runtime} minutes</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted">Synopsis</dt><dd>{synopsis}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted">Rights scope</dt><dd>{territories.join(", ")} · {exploitation.join(", ")}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted">Buyer channels</dt><dd>{buyers.join(", ")}</dd></div>
            </dl>
            <div className="rounded-xl bg-elevated p-4 text-sm">
              <p className="font-semibold">What happens next?</p>
              <p className="mt-1 text-muted">Bridge creates a DRAFT record and queues the submitted rights information for authorized review. QC, Legal approval, buyer access, licensing and Loop publication are separate gates.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">{checks.map(([label, ok]) => <p key={label as string} className="text-sm">{ok ? "✓" : "○"} {label as string}</p>)}</div>
          </section>
        ) : null}

        {error ? <p role="alert" className="text-sm text-accent">{error}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <Button type="button" variant="outline" disabled={step === 1 || busy} onClick={() => setStep((current) => Math.max(1, current - 1))}>Back</Button>
          {step < 5 ? <Button type="button" disabled={!stepValid} onClick={() => setStep((current) => Math.min(5, current + 1))}>Continue</Button> : <Button type="submit" disabled={busy || checks.some(([, ok]) => !ok)} className="rounded-full px-6">{busy ? "Creating submission…" : "Create submission"}</Button>}
        </div>
        <p className="text-center text-xs text-muted">Crayons Bridge · StreamVista OPC Pvt Ltd</p>
      </form>
    </main>
  );
}
