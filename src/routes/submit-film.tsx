import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { createRightsReadySubmission } from "@/lib/bridge/submissions";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/submit-film")({ component: RightsReadySubmission });

const LANGUAGES = ["Malayalam", "Tamil", "Telugu", "Kannada", "Hindi", "English"];
const TERRITORIES = ["IN", "GCC", "US", "CA", "GB", "AU", "Worldwide"];
const EXPLOITATION = ["OTT / Streaming", "SVOD", "TVOD", "AVOD", "FAST", "Broadcast / TV", "Theatrical", "Educational", "Airline / Ancillary", "Festival / Screening"];
const BUYERS = ["OTT platform", "Broadcaster", "Distributor", "Aggregator", "International buyer", "Educational buyer", "Festival / screening", "Crayons Loop", "Open to qualified buyers"];

function RightsReadySubmission() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [contentType, setContentType] = useState<"FEATURE" | "SERIES" | "SHORT" | "DOCUMENTARY" | "OTHER">("FEATURE");
  const [originalLanguage, setOriginalLanguage] = useState("Malayalam");
  const [rightsLanguages, setRightsLanguages] = useState<string[]>(["Malayalam"]);
  const [country, setCountry] = useState("India");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [runtime, setRuntime] = useState("");
  const [territories, setTerritories] = useState<string[]>(["IN"]);
  const [exploitation, setExploitation] = useState<string[]>(["OTT / Streaming"]);
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
          contentType,
          originalLanguage,
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
    ["Title identity", Boolean(name && synopsis && originalLanguage && country && year && runtime)],
    ["Rights scope", rightsLanguages.length > 0 && territories.length > 0 && exploitation.length > 0 && Boolean(windowStart && windowEnd)],
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
          <h1 className="mt-2 font-display text-3xl">Submit a title for buyer review</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">Prepare the rights scope once. Bridge verifies the evidence before a title can become Licensing Ready.</p>
        </header>

        <section className="space-y-4">
          <h2 className="font-display text-xl">01 · Title</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">Title<input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
            <label className="text-sm">Content type<select value={contentType} onChange={(e) => setContentType(e.target.value as typeof contentType)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"><option value="FEATURE">Feature film</option><option value="SERIES">Series</option><option value="SHORT">Short</option><option value="DOCUMENTARY">Documentary</option><option value="OTHER">Other</option></select></label>
            <label className="text-sm">Original language<select value={originalLanguage} onChange={(e) => setOriginalLanguage(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3">{LANGUAGES.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="text-sm">Country<select value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"><option>India</option><option>United Arab Emirates</option><option>United States</option><option>United Kingdom</option><option>Other</option></select></label>
            <label className="text-sm">Release year<input required type="number" min="1895" max="2100" value={year} onChange={(e) => setYear(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
            <label className="text-sm">Runtime (minutes)<input required type="number" min="1" max="600" value={runtime} onChange={(e) => setRuntime(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" /></label>
            <label className="text-sm sm:col-span-2">Synopsis<textarea required maxLength={4000} rows={4} value={synopsis} onChange={(e) => setSynopsis(e.target.value)} className="mt-1 w-full rounded-lg border border-line-strong bg-elevated px-3 py-2" /></label>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-xl">02 · Rights scope</h2>
          <div className="space-y-3">
            <div><p className="text-sm font-medium">Rights languages</p><div className="mt-2 flex flex-wrap gap-2">{LANGUAGES.map((x) => <label key={x} className="rounded-full border border-line px-3 py-2 text-sm"><input className="mr-2" type="checkbox" checked={rightsLanguages.includes(x)} onChange={() => toggle(x, rightsLanguages, setRightsLanguages)} />{x}</label>)}</div></div>
            <div><p className="text-sm font-medium">Territories</p><div className="mt-2 flex flex-wrap gap-2">{TERRITORIES.map((x) => <label key={x} className="rounded-full border border-line px-3 py-2 text-sm"><input className="mr-2" type="checkbox" checked={territories.includes(x)} onChange={() => toggle(x, territories, setTerritories)} />{x}</label>)}</div></div>
            <div><p className="text-sm font-medium">Exploitation</p><div className="mt-2 flex flex-wrap gap-2">{EXPLOITATION.map((x) => <label key={x} className="rounded-full border border-line px-3 py-2 text-sm"><input className="mr-2" type="checkbox" checked={exploitation.includes(x)} onChange={() => toggle(x, exploitation, setExploitation)} />{x}</label>)}</div></div>
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
          <p className="text-xs leading-relaxed text-muted">Authorization evidence remains private and must be attached in the Title Workspace before Rights Review can approve this submission.</p>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-xl">04 · Buyer access</h2>
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
          <p className="mt-3 text-xs leading-relaxed text-muted">Submitting creates one canonical Bridge title in DRAFT. It does not make the title Licensing Ready or publish it to buyers or Loop.</p>
        </section>

        {error ? <p role="alert" className="text-sm text-accent">{error}</p> : null}
        <Button type="submit" disabled={busy || !confirmed} className="w-full rounded-full">{busy ? "Creating submission…" : "Submit for Bridge review"}</Button>
        <p className="text-center text-xs text-muted">Crayons Bridge is operated by StreamVista OPC Pvt Ltd.</p>
      </form>
    </main>
  );
}
