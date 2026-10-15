import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { listTitles } from "@/lib/bridge/titles";
import {
  createTitleRight,
  listRightsCategories,
  listTitleRights,
  reviewRightsEvidence,
} from "@/lib/bridge/rights-admin";

export const Route = createFileRoute("/admin-rights")({ component: RightsDesk });

type RightsCategory = { code: string; family: string; label: string };
type RightsEvidence = { id: string; evidence_type: string; review_status: string; source_rightsholder: string | null; document_hash: string | null };
type TitleRight = {
  id: string; category_label: string; evidence_status: string; availability_status: string; exclusivity: string;
  start_date: string | null; end_date: string | null; buyer_visible_summary: string | null;
  territories: Array<{ territory_label: string }>;
  languages: Array<{ language_label: string; language_scope: string }>;
  evidence: RightsEvidence[];
};



function RightsDesk() {
  return (
    <RequireBridge allow="internal">
      {(actor) => {
        const canReview = ["legal_reviewer", "admin", "super_admin"].includes(actor.internalRole ?? "");
        return (
          <BridgeShell actor={actor} title="Rights & licensing desk">
            {canReview ? <RightsDeskBody /> : (
              <section className="rounded-2xl border border-line bg-surface p-6">
                <h2 className="font-semibold">Rights-review permission required</h2>
                <p className="mt-2 text-sm text-muted">This desk is limited to verified legal reviewers and administrators.</p>
              </section>
            )}
          </BridgeShell>
        );
      }}
    </RequireBridge>
  );
}

function RightsDeskBody() {
  const qc = useQueryClient();
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const categoriesQ = useQuery<{ categories: RightsCategory[] }>({ queryKey: ["bridge-rights-categories"], queryFn: async () => await listRightsCategories() as { categories: RightsCategory[] } });
  const [titleId, setTitleId] = useState("");
  const [categoryCode, setCategoryCode] = useState("");
  const [territoryCode, setTerritoryCode] = useState("US");
  const [territoryLabel, setTerritoryLabel] = useState("United States");
  const [languageCode, setLanguageCode] = useState("hi");
  const [languageLabel, setLanguageLabel] = useState("Hindi");
  const [languageScope, setLanguageScope] = useState<"ORIGINAL_AUDIO" | "DUBBED_AUDIO" | "SUBTITLES">("DUBBED_AUDIO");
  const [availabilityStatus, setAvailabilityStatus] = useState<"UNKNOWN" | "AVAILABLE" | "PARTIALLY_AVAILABLE" | "COMMITTED" | "RESTRICTED" | "EXPIRED">("UNKNOWN");
  const [exclusivity, setExclusivity] = useState<"UNSPECIFIED" | "EXCLUSIVE" | "NON_EXCLUSIVE">("UNSPECIFIED");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [buyerSummary, setBuyerSummary] = useState("");
  const [sourceRightsholder, setSourceRightsholder] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [documentHash, setDocumentHash] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const titles = titlesQ.data?.titles ?? [];
  const categories = categoriesQ.data?.categories ?? [];
  const selectedTitle = useMemo(() => titles.find((t) => t.id === titleId), [titles, titleId]);
  const rightsQ = useQuery({
    queryKey: ["bridge-title-rights", titleId],
    queryFn: async () => await listTitleRights({ data: { titleId } }) as { rights: TitleRight[] },
    enabled: titleId.length >= 8,
    retry: false,
  });

  const create = useMutation({
    mutationFn: () => createTitleRight({
      data: {
        titleId,
        categoryCode,
        territories: [{ code: territoryCode.trim().toUpperCase(), label: territoryLabel.trim(), scopeType: "COUNTRY" }],
        languages: [{ code: languageCode.trim().toLowerCase(), label: languageLabel.trim(), scope: languageScope }],
        availabilityStatus,
        exclusivity,
        monetisationModels: [],
        transmissionModes: [],
        startDate: startDate || null,
        endDate: endDate || null,
        buyerVisibleSummary: buyerSummary.trim() || undefined,
        internalNotes: internalNotes.trim() || undefined,
        evidence: [{
          type: "CONTRACT",
          storageReference: evidenceReference.trim() || undefined,
          documentHash: documentHash.trim() || undefined,
          sourceRightsholder: sourceRightsholder.trim() || undefined,
        }],
      },
    }),
    onSuccess: async () => {
      toast("Rights record saved as pending review");
      setBuyerSummary("");
      setEvidenceReference("");
      setDocumentHash("");
      setInternalNotes("");
      await qc.invalidateQueries({ queryKey: ["bridge-title-rights", titleId] });
    },
    onError: (error) => toast(error instanceof Error ? error.message : "Could not save rights record"),
  });

  const review = useMutation({
    mutationFn: (args: { evidenceId: string; status: "VERIFIED" | "REJECTED" | "DISPUTED" | "SUPERSEDED" }) =>
      reviewRightsEvidence({ data: { evidenceId: args.evidenceId, reviewStatus: args.status } }),
    onSuccess: async () => {
      toast("Evidence review saved");
      await qc.invalidateQueries({ queryKey: ["bridge-title-rights", titleId] });
    },
    onError: (error) => toast(error instanceof Error ? error.message : "Could not review evidence"),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!titleId || !categoryCode || !territoryCode.trim() || !territoryLabel.trim() || !languageCode.trim() || !languageLabel.trim()) {
      toast("Complete title, rights category, territory and language first");
      return;
    }
    create.mutate();
  }

  if (titlesQ.isPending || categoriesQ.isPending) return <p className="text-sm text-muted">Loading canonical titles and rights categories…</p>;
  if (titlesQ.isError || categoriesQ.isError) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-semibold">Rights desk is not ready</h2>
        <p role="alert" className="mt-2 text-sm text-muted">
          Could not load titles or the rights taxonomy. The taxonomy migration must be reviewed and applied to a non-production environment before this desk can be tested. No production schema changes are performed here.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => { void titlesQ.refetch(); void categoriesQ.refetch(); }}>Retry</Button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Internal · server-authorized</p>
        <h2 className="mt-2 font-display text-3xl font-semibold">Rights evidence & buyer scope</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
          Record title-specific rights by category, territory, language, term and evidence. A saved record is always pending review; a category or availability selection does not prove ownership and does not publish a title to buyers or Loop.
        </p>
      </section>

      <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">Canonical title
          <select required value={titleId} onChange={(e) => setTitleId(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3">
            <option value="">Select an existing Bridge title</option>
            {titles.map((title) => <option key={title.id} value={title.id}>{title.name} · {title.year ?? "Year unknown"} · {title.status}</option>)}
          </select>
        </label>
        {selectedTitle ? <p className="text-xs text-muted sm:col-span-2">Owner record: {selectedTitle.name}. Rights will attach to this canonical title ID; no duplicate title is created.</p> : null}
        <label className="text-sm sm:col-span-2">Rights category
          <select required value={categoryCode} onChange={(e) => setCategoryCode(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3">
            <option value="">Select category</option>
            {categories.map((category) => <option key={category.code} value={category.code}>{category.family} · {category.label}</option>)}
          </select>
        </label>
        <label className="text-sm">Territory code
          <input required maxLength={16} value={territoryCode} onChange={(e) => setTerritoryCode(e.target.value)} placeholder="US, CA, GB" className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" />
        </label>
        <label className="text-sm">Territory label
          <input required maxLength={80} value={territoryLabel} onChange={(e) => setTerritoryLabel(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" />
        </label>
        <label className="text-sm">Language code
          <input required maxLength={16} value={languageCode} onChange={(e) => setLanguageCode(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" />
        </label>
        <label className="text-sm">Language label
          <input required maxLength={80} value={languageLabel} onChange={(e) => setLanguageLabel(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" />
        </label>
        <label className="text-sm">Language rights
          <select value={languageScope} onChange={(e) => setLanguageScope(e.target.value as typeof languageScope)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3">
            <option value="ORIGINAL_AUDIO">Original audio</option><option value="DUBBED_AUDIO">Dubbed audio</option><option value="SUBTITLES">Subtitles</option>
          </select>
        </label>
        <label className="text-sm">Availability (does not verify rights)
          <select value={availabilityStatus} onChange={(e) => setAvailabilityStatus(e.target.value as typeof availabilityStatus)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3">
            {["UNKNOWN", "AVAILABLE", "PARTIALLY_AVAILABLE", "COMMITTED", "RESTRICTED", "EXPIRED"].map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <label className="text-sm">Exclusivity
          <select value={exclusivity} onChange={(e) => setExclusivity(e.target.value as typeof exclusivity)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3">
            {["UNSPECIFIED", "EXCLUSIVE", "NON_EXCLUSIVE"].map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <label className="text-sm">Rights start date
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" />
        </label>
        <label className="text-sm">Rights end date
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" />
        </label>
        <label className="text-sm sm:col-span-2">Buyer-visible summary (only after review and approved disclosure)
          <textarea maxLength={1000} value={buyerSummary} onChange={(e) => setBuyerSummary(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-line-strong bg-elevated px-3 py-2" />
        </label>
        <label className="text-sm">Evidence reference (private)
          <input maxLength={500} value={evidenceReference} onChange={(e) => setEvidenceReference(e.target.value)} placeholder="Private document reference" className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" />
        </label>
        <label className="text-sm">Document hash (optional)
          <input maxLength={160} value={documentHash} onChange={(e) => setDocumentHash(e.target.value)} placeholder="Integrity hash, if available" className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" />
        </label>
        <label className="text-sm">Source rights-holder
          <input maxLength={160} value={sourceRightsholder} onChange={(e) => setSourceRightsholder(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" />
        </label>
        <label className="text-sm">Internal notes
          <input maxLength={2000} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={create.isPending || !titles.length || !categories.length}>{create.isPending ? "Saving…" : "Save as pending review"}</Button>
          <span className="text-xs text-muted">This action records evidence only. It does not activate a deal, charge a buyer, or grant Loop publication.</span>
        </div>
      </form>

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h3 className="text-xl font-semibold">Title rights records</h3><p className="mt-1 text-sm text-muted">Choose a title above to inspect scopes and review evidence.</p></div>
          {rightsQ.data ? <span className="text-xs text-muted">{rightsQ.data.rights.length} record(s)</span> : null}
        </div>
        {rightsQ.isPending && titleId ? <p className="mt-4 text-sm text-muted">Loading rights records…</p> : null}
        {rightsQ.isError ? <p role="alert" className="mt-4 text-sm text-muted">Rights records are unavailable. Check that the reviewed taxonomy migration is applied in this environment.</p> : null}
        {rightsQ.data?.rights.length === 0 ? <p className="mt-4 text-sm text-muted">No rights records for this title yet.</p> : null}
        <div className="mt-4 space-y-4">
          {(rightsQ.data?.rights ?? []).map((right) => (
            <article key={right.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h4 className="font-semibold">{right.category_label}</h4><p className="mt-1 text-xs text-muted">{right.evidence_status} · {right.availability_status} · {right.exclusivity}</p></div>
                <span className="text-xs text-muted">{right.start_date ?? "Start unspecified"} → {right.end_date ?? "End unspecified"}</span>
              </div>
              <p className="mt-2 text-sm">{(right.territories ?? []).map((v) => v.territory_label).join(", ")} · {(right.languages ?? []).map((v) => `${v.language_label} (${v.language_scope.replaceAll("_", " ").toLowerCase()})`).join(", ")}</p>
              <p className="mt-2 text-sm text-muted">{right.buyer_visible_summary || "No buyer-visible summary."}</p>
              <div className="mt-3 space-y-2">
                {(right.evidence ?? []).map((evidence) => (
                  <div key={evidence.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-elevated p-3">
                    <div><p className="text-sm font-medium">{evidence.evidence_type} · {evidence.review_status}</p><p className="text-xs text-muted">{evidence.source_rightsholder || "Source not recorded"} · {evidence.document_hash ? "Hash recorded" : "No hash recorded"}</p></div>
                    {evidence.review_status === "PENDING_REVIEW" ? <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={review.isPending} onClick={() => review.mutate({ evidenceId: evidence.id, status: "VERIFIED" })}>Verify evidence</Button><Button type="button" size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ evidenceId: evidence.id, status: "REJECTED" })}>Reject</Button><Button type="button" size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ evidenceId: evidence.id, status: "DISPUTED" })}>Dispute</Button></div> : null}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
