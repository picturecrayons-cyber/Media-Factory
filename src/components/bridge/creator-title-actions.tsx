import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { submitCreatorTitleToBridge } from "@/lib/bridge/submissions";
import { deleteTitle } from "@/lib/bridge/title-deletion";
import { canOperateOnTitle } from "@/lib/bridge/rbac";
import type { BridgeActor } from "@/lib/bridge/session";
import type { BridgeTitle } from "@/lib/bridge/types";

export function CreatorDraftDeleteButton({ title, actor }: { title: BridgeTitle; actor: BridgeActor }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = !actor.internalRole &&
    ["independent_creator", "studio"].includes(actor.accountType) &&
    canOperateOnTitle(actor, title, "title.update_own", null);
  const mutation = useMutation({
    mutationFn: () => deleteTitle({ data: { id: title.id, confirmation: "DELETE DRAFT" } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bridge-titles"] });
      setConfirm(false);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not archive draft"),
  });
  if (!allowed || title.status !== "DRAFT" || title.creatorSubmissionStatus === "SUBMITTED") return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {confirm ? (
        <>
          <span className="w-full text-xs text-muted">Only an unsubmitted draft with no uploaded asset rows can be archived. The record and audit history are retained; OCI objects are never deleted.</span>
          <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="rounded-lg border border-amber-600 px-3 py-2 text-xs font-semibold text-amber-700 disabled:opacity-50">
            {mutation.isPending ? "Archiving…" : "Confirm Delete"}
          </button>
          <button type="button" onClick={() => { setConfirm(false); setError(null); }} className="rounded-lg border border-line px-3 py-2 text-xs">Cancel</button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirm(true)} className="rounded-lg border border-amber-500/50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-500/10">
          Delete Draft
        </button>
      )}
      {error ? <span role="alert" className="w-full text-xs text-red-600">{error}</span> : null}
    </div>
  );
}

const TERRITORIES = ["IN", "GCC", "US", "CA", "GB", "AU", "Worldwide"];
const DESTINATIONS = ["Crayons Loop", "External OTT", "Broadcast / TV", "TVOD / EST", "FAST", "Festival / Educational", "Buyer delivery"];
const EXPLOITATION = ["SVOD", "TVOD", "AVOD", "FAST", "BROADCAST", "THEATRICAL", "AIRLINE", "EDUCATIONAL", "FESTIVAL"];

function defaultEndDate() {
  const end = new Date();
  end.setFullYear(end.getFullYear() + 5);
  return end.toISOString().slice(0, 10);
}

export function CreatorTitleActions({ title, actor }: { title: BridgeTitle; actor: BridgeActor }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showSubmit, setShowSubmit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [name, setName] = useState(title.name);
  const [synopsis, setSynopsis] = useState(title.synopsis);
  const [language, setLanguage] = useState(title.language || "");
  const [country, setCountry] = useState(title.countryOfOrigin || "");
  const [year, setYear] = useState(title.year ? String(title.year) : "");
  const [runtime, setRuntime] = useState(title.runtimeMinutes ? String(title.runtimeMinutes) : "");
  const [territories, setTerritories] = useState<string[]>(["IN"]);
  const [buyerChannels, setBuyerChannels] = useState<string[]>(["Crayons Loop"]);
  const [rightsLanguages, setRightsLanguages] = useState(title.language || "Malayalam");
  const [exploitation, setExploitation] = useState<string[]>(["SVOD"]);
  const [windowStart, setWindowStart] = useState(new Date().toISOString().slice(0, 10));
  const [windowEnd, setWindowEnd] = useState(defaultEndDate());
  const [exclusivity, setExclusivity] = useState<"EXCLUSIVE" | "NON_EXCLUSIVE">("NON_EXCLUSIVE");
  const [authorityType, setAuthorityType] = useState("RIGHTS_OWNER");
  const [evidenceType, setEvidenceType] = useState("RIGHTS_AGREEMENT");
  const [authorizationConfirmed, setAuthorizationConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = !actor.internalRole &&
    ["independent_creator", "studio"].includes(actor.accountType) &&
    canOperateOnTitle(actor, title, "title.update_own", null);
  const isUnsubmittedDraft = title.status === "DRAFT" && title.creatorSubmissionStatus !== "SUBMITTED";

  const submit = useMutation({
    mutationFn: () => submitCreatorTitleToBridge({
      data: {
        titleId: title.id,
        name,
        synopsis,
        language,
        countryOfOrigin: country,
        year: Number(year),
        runtimeMinutes: Number(runtime),
        territories,
        buyerChannels,
        rightsLanguages: rightsLanguages.split(",").map((v) => v.trim()).filter(Boolean),
        exploitation,
        windowStart: new Date(`${windowStart}T00:00:00.000Z`).toISOString(),
        windowEnd: new Date(`${windowEnd}T23:59:59.000Z`).toISOString(),
        exclusivity,
        authorityType: authorityType as "RIGHTS_OWNER" | "PRODUCER" | "AUTHORIZED_REPRESENTATIVE" | "DISTRIBUTOR_SALES_AGENT" | "LICENSEE_WITH_ONWARD_RIGHTS" | "OTHER",
        authorizationEvidenceType: evidenceType as "RIGHTS_AGREEMENT" | "CHAIN_OF_TITLE" | "AUTHORIZATION_LETTER" | "DISTRIBUTION_AGREEMENT" | "OTHER",
        authorizationConfirmed: true,
      },
    }),
    onSuccess: async () => {
      setError(null);
      setShowSubmit(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["bridge-title", title.id] }),
        qc.invalidateQueries({ queryKey: ["bridge-titles"] }),
        qc.invalidateQueries({ queryKey: ["title-workflow", title.id] }),
      ]);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not submit title to Bridge"),
  });

  const remove = useMutation({
    mutationFn: () => deleteTitle({ data: { id: title.id, confirmation: "DELETE DRAFT" } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bridge-titles"] });
      void navigate({ to: "/creator" });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not archive draft"),
  });

  function toggle(value: string, values: string[], setValues: (next: string[]) => void) {
    setValues(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  if (!canManage) return null;
  if (!isUnsubmittedDraft) {
    return title.creatorSubmissionStatus === "SUBMITTED"
      ? <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">Submitted to Bridge · QC and Rights review are pending</p>
      : null;
  }

  return (
    <section className="space-y-3 rounded-2xl border border-accent/30 bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">Creator actions</p>
          <h2 className="mt-1 font-display text-xl font-semibold">Submit this draft to Bridge</h2>
          <p className="mt-1 text-sm text-muted">Submission records your title and rights package for Bridge review. It does not approve QC, Legal, licensing or Loop publication.</p>
        </div>
        <button type="button" onClick={() => { setShowSubmit((v) => !v); setError(null); }} className="rounded-lg bg-fg px-4 py-2.5 text-sm font-semibold text-bg">
          {showSubmit ? "Close submission" : "Submit to Bridge"}
        </button>
      </div>

      {showSubmit ? (
        <form className="space-y-4 border-t border-line pt-4" onSubmit={(e: FormEvent) => { e.preventDefault(); setError(null); submit.mutate(); }}>
          <p className="text-xs text-muted">If a complete rights package is already saved on this draft, Bridge preserves that package. The rights fields below create the package only when none exists.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">Title name
              <input required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border border-line bg-elevated p-2" />
            </label>
            <label className="grid gap-1 text-sm">Original language
              <input required minLength={2} maxLength={40} value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-lg border border-line bg-elevated p-2" />
            </label>
            <label className="grid gap-1 text-sm">Country of origin
              <input required minLength={2} maxLength={80} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. India" className="rounded-lg border border-line bg-elevated p-2" />
            </label>
            <label className="grid gap-1 text-sm">Release year
              <input required type="number" min={1895} max={2100} value={year} onChange={(e) => setYear(e.target.value)} className="rounded-lg border border-line bg-elevated p-2" />
            </label>
            <label className="grid gap-1 text-sm">Runtime (minutes)
              <input required type="number" min={1} max={600} value={runtime} onChange={(e) => setRuntime(e.target.value)} className="rounded-lg border border-line bg-elevated p-2" />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">Synopsis
              <textarea required minLength={20} maxLength={4000} rows={3} value={synopsis} onChange={(e) => setSynopsis(e.target.value)} className="rounded-lg border border-line bg-elevated p-2" />
            </label>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Rights territories</legend>
            <div className="flex flex-wrap gap-3">{TERRITORIES.map((item) => (
              <label key={item} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={territories.includes(item)} onChange={() => toggle(item, territories, setTerritories)} />{item}</label>
            ))}</div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">Rights languages (comma separated)
              <input required value={rightsLanguages} onChange={(e) => setRightsLanguages(e.target.value)} placeholder="Malayalam, English" className="rounded-lg border border-line bg-elevated p-2" />
            </label>
            <label className="grid gap-1 text-sm">Exclusivity
              <select value={exclusivity} onChange={(e) => setExclusivity(e.target.value as typeof exclusivity)} className="rounded-lg border border-line bg-elevated p-2"><option value="NON_EXCLUSIVE">Non-exclusive</option><option value="EXCLUSIVE">Exclusive</option></select>
            </label>
            <label className="grid gap-1 text-sm">Rights start
              <input required type="date" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="rounded-lg border border-line bg-elevated p-2" />
            </label>
            <label className="grid gap-1 text-sm">Rights end
              <input required type="date" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="rounded-lg border border-line bg-elevated p-2" />
            </label>
            <label className="grid gap-1 text-sm">Authority
              <select value={authorityType} onChange={(e) => setAuthorityType(e.target.value)} className="rounded-lg border border-line bg-elevated p-2">
                <option value="RIGHTS_OWNER">Rights owner</option><option value="PRODUCER">Producer</option><option value="AUTHORIZED_REPRESENTATIVE">Authorized representative</option><option value="DISTRIBUTOR_SALES_AGENT">Distributor / sales agent</option><option value="LICENSEE_WITH_ONWARD_RIGHTS">Licensee with onward rights</option><option value="OTHER">Other</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">Authorization evidence type
              <select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value)} className="rounded-lg border border-line bg-elevated p-2">
                <option value="RIGHTS_AGREEMENT">Rights agreement</option><option value="CHAIN_OF_TITLE">Chain of title</option><option value="AUTHORIZATION_LETTER">Authorization letter</option><option value="DISTRIBUTION_AGREEMENT">Distribution agreement</option><option value="OTHER">Other</option>
              </select>
            </label>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Authorized distribution destinations</legend>
            <div className="flex flex-wrap gap-3">{DESTINATIONS.map((item) => (
              <label key={item} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={buyerChannels.includes(item)} onChange={() => toggle(item, buyerChannels, setBuyerChannels)} />{item}</label>
            ))}</div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Exploitation rights</legend>
            <div className="flex flex-wrap gap-3">{EXPLOITATION.map((item) => (
              <label key={item} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={exploitation.includes(item)} onChange={() => toggle(item, exploitation, setExploitation)} />{item}</label>
            ))}</div>
          </fieldset>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" required checked={authorizationConfirmed} onChange={(e) => setAuthorizationConfirmed(e.target.checked)} />
            <span>I confirm that I have the authority to submit these rights details and will provide supporting signed evidence for Legal verification.</span>
          </label>
          {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
          <button type="submit" disabled={submit.isPending || !authorizationConfirmed || territories.length === 0 || buyerChannels.length === 0 || exploitation.length === 0 || !rightsLanguages.trim() || !windowStart || !windowEnd} className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-bg disabled:opacity-50">
            {submit.isPending ? "Submitting…" : "Confirm & Submit to Bridge"}
          </button>
        </form>
      ) : null}

      <div className="border-t border-line pt-3">
        {showDeleteConfirm ? (
          <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-sm font-semibold">Archive this unsubmitted draft?</p>
            <p className="text-xs text-muted">The title record is retained for audit and recovery. No OCI file or linked evidence is physically deleted. Drafts with uploaded assets cannot be archived here.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => remove.mutate()} disabled={remove.isPending} className="rounded-lg border border-amber-600 px-4 py-2 text-sm font-semibold text-amber-700 disabled:opacity-50">{remove.isPending ? "Archiving…" : "Confirm Delete Draft"}</button>
              <button type="button" onClick={() => setShowDeleteConfirm(false)} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => { setShowDeleteConfirm(true); setError(null); }} className="rounded-lg border border-amber-500/50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-500/10">Delete Draft</button>
        )}
      </div>
      {error && !showSubmit ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
