import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getTitleWorkflow,
  getTitleRevenue,
  recordSettlementEvidence,
  submitLoopLicense,
  reviewTitleWorkflow,
} from "@/lib/bridge/workflow";
import { advanceTitle } from "@/lib/bridge/titles";
import { listTitleAssets, requestAssetDownload } from "@/lib/bridge/assets";
import {
  authorizeLoopPublication,
  getLoopPublication,
  listLoopPublicationReadiness,
  revokeLoopPublication,
  suspendLoopPublication,
} from "@/lib/bridge/loop-publication";
import { hasPermission, canOperateOnTitle } from "@/lib/bridge/rbac";
import { publicationIsActive } from "@/lib/bridge/workflow-policy";
import type { BridgeActor } from "@/lib/bridge/session";
import type { BridgeTitle } from "@/lib/bridge/types";

const stages = ["Prepare", "Business", "Distribution", "Revenue"] as const;
export function WorkflowDesk({ title, actor }: { title: BridgeTitle; actor: BridgeActor }) {
  const [stage, setStage] = useState<(typeof stages)[number]>("Prepare");
  const [settlementRef, setSettlementRef] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [statementRef, setStatementRef] = useState("");
  const [settlementAmount, setSettlementAmount] = useState("");
  const [note, setNote] = useState("");
  const [playbackVerified, setPlaybackVerified] = useState(false);
  const [playbackCompleted, setPlaybackCompleted] = useState(false);
  const [masterPlaybackUrl, setMasterPlaybackUrl] = useState("");
  const [codec, setCodec] = useState("");
  const [resolution, setResolution] = useState("");
  const [frameRate, setFrameRate] = useState("");
  const [audioVerified, setAudioVerified] = useState(false);
  const [audioDetails, setAudioDetails] = useState("");
  const [masterLanguage, setMasterLanguage] = useState(title.masterLanguage || title.language || "");
  const [subtitleStatus, setSubtitleStatus] = useState<"VERIFIED" | "NOT_APPLICABLE">("NOT_APPLICABLE");
  const [subtitleLanguages, setSubtitleLanguages] = useState("");
  const [posterVerified, setPosterVerified] = useState(false);
  const [correctionAffectedItem, setCorrectionAffectedItem] = useState("");
  const [correctionRequiredAction, setCorrectionRequiredAction] = useState("");
  const [error, setError] = useState("");
  const qc = useQueryClient();
  const workflow = useQuery({
    queryKey: ["title-workflow", title.id],
    queryFn: () => getTitleWorkflow({ data: { titleId: title.id } }),
    enabled: Boolean(actor.internalRole) || actor.accountType !== "buyer",
  });
  const publication = useQuery({
    queryKey: ["loop-pub", title.id],
    queryFn: () => getLoopPublication({ data: { bridgeTitleId: title.id } }),
    enabled: Boolean(actor.internalRole) || actor.accountType !== "buyer",
  });
  const readiness = useQuery({
    queryKey: ["loop-publication-readiness", title.id],
    queryFn: () => listLoopPublicationReadiness(),
    enabled: stage === "Distribution" && actor.emailVerified && actor.internalRole === "super_admin",
  });
  const readinessTitle = readiness.data?.titles.find((item) => item.id === title.id);
  const qcAssets = useQuery({
    queryKey: ["qc-assets", title.id],
    queryFn: () => listTitleAssets({ data: { titleId: title.id } }),
    enabled: title.status === "QC_REVIEW" && actor.emailVerified && actor.internalRole === "qc_reviewer",
  });
  const masterAsset = qcAssets.data?.assets.find((asset) =>
    asset.kind === "master" && asset.key === title.masterKey && asset.verified && Number(asset.byteSize) > 0
  );
  const masterPlayback = useMutation({
    mutationFn: () => {
      if (!masterAsset) throw new Error("No verified current master asset is available");
      return requestAssetDownload({ data: { assetId: masterAsset.id } });
    },
    onSuccess: (result) => {
      setMasterPlaybackUrl(result.url);
      setPlaybackCompleted(false);
      setPlaybackVerified(false);
      setError("");
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Master playback could not be opened"),
  });
  const canFinance = canOperateOnTitle(actor, title, "title.read_own", "finance.read");
  const canManageRights = actor.emailVerified && actor.internalRole === "super_admin";
  const canReviewRights = actor.emailVerified && actor.internalRole === "legal_reviewer";
  const canViewRights = canManageRights || canReviewRights;
  const visibleStages = canManageRights
    ? stages
    : canReviewRights
      ? stages.filter((s) => s === "Prepare" || s === "Business")
      : actor.accountType === "independent_creator" || actor.accountType === "studio"
        ? stages.filter((s) => s === "Prepare")
        : stages.filter((s) => s === "Prepare" || (s === "Revenue" && canFinance));
  const qcEvidenceReady = Boolean(
    playbackVerified && codec.trim() && resolution.trim() && frameRate.trim() &&
    audioVerified && audioDetails.trim() && masterLanguage.trim() &&
    (subtitleStatus === "NOT_APPLICABLE" || subtitleLanguages.trim()) && posterVerified
  );
  const creditExists = (role: string) => title.credits?.some((credit) => String(credit.role ?? "").toLowerCase() === role && credit.name.trim().length > 0) ?? false;
  const missingMetadata = [
    !title.name?.trim() && "Original title",
    !title.contentType?.trim() && "Content type",
    !title.language?.trim() && "Language",
    !title.year && "Year",
    !title.runtimeMinutes && "Runtime",
    !title.countryOfOrigin?.trim() && "Country",
    !title.releaseDate && "Release date",
    !creditExists("director") && "Director",
    !creditExists("producer") && "Producer",
    !creditExists("cast") && "Cast",
    !title.synopsis?.trim() && "Synopsis",
  ].filter(Boolean) as string[];
  const revenue = useQuery({
    queryKey: ["title-revenue", title.id],
    queryFn: () => getTitleRevenue({ data: { titleId: title.id } }),
    enabled: stage === "Revenue" && canFinance,
  });
  const action = useMutation({
    mutationFn: async (run: () => Promise<unknown>) => run(),
    onSuccess: async () => {
      setError("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["title-workflow", title.id] }),
        qc.invalidateQueries({ queryKey: ["bridge-title", title.id] }),
        qc.invalidateQueries({ queryKey: ["loop-pub", title.id] }),
        qc.invalidateQueries({ queryKey: ["bridge-titles"] }),
        qc.invalidateQueries({ queryKey: ["loop-publication-readiness"] }),
        qc.invalidateQueries({ queryKey: ["bridge-audit"] }),
        qc.invalidateQueries({ queryKey: ["title-revenue", title.id] }),
      ]);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Action failed"),
  });
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [exclusive, setExclusive] = useState(false);
  const [agreement, setAgreement] = useState("");
  const [ownership, setOwnership] = useState("");
  const [ownerShare, setOwnerShare] = useState("");
  const [selectedGrantByAgreement, setSelectedGrantByAgreement] = useState<Record<string, string>>({});
  function downloadStatement() {
    const safe = (v: string) =>
      '"' + (/^[=+@-]/.test(v) ? "'" : "") + v.replaceAll('"', '""') + '"';
    const lines = [
      ["Payment", "Purchased at", "Captured paise", "Currency", "Reconciliation"],
      ...(revenue.data?.receipts ?? []).map((r) => [
        r.paymentId,
        r.purchasedAt,
        r.amountPaise === null ? "" : String(r.amountPaise),
        r.currency ?? "",
        r.amountPaise === null
          ? "Amount evidence missing"
          : "Gross captured; fees/tax/refunds require reconciliation",
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob([lines.map((row) => row.map(safe).join(",")).join("\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `bridge-${title.id}-receipts.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  const grants = workflow.data?.grants ?? [];
  const grantsByAgreement = grants.reduce<Record<string, typeof grants>>((groups, grant) => {
    const reference = grant.evidence[0]?.agreementReference ?? "Not recorded";
    (groups[reference] ??= []).push(grant);
    return groups;
  }, {});
  const valid = grants.find((g) => g.status === "VALID" && new Date(g.window_end) > new Date());
  const pub = publication.data?.publication;
  const button = (label: string, run: () => Promise<unknown>, disabled = false) => (
    <button
      type="button"
      className="rounded-lg border border-line px-4 py-2 text-sm disabled:opacity-50"
      disabled={action.isPending || disabled}
      onClick={() => action.mutate(run)}
    >
      {label}
    </button>
  );
  const input = (label: string, value: string, set: (v: string) => void, type = "text") => (
    <label className="grid gap-1 text-sm">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => set(e.target.value)}
        className="rounded-lg border border-line bg-elevated p-2"
        required
      />
    </label>
  );
  if (actor.accountType === "buyer" && !actor.internalRole) return null;
  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-display text-xl">Title operations</h2>
      <nav className="flex flex-wrap gap-2" aria-label="Operational workflow">
        {visibleStages.map((s) => (
          <button
            type="button"
            key={s}
            aria-pressed={stage === s}
            className={`rounded-full border border-line px-4 py-2 text-sm ${stage === s ? "bg-fg text-bg" : ""}`}
            onClick={() => setStage(s)}
          >
            {s}
          </button>
        ))}
      </nav>
      {error ? (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      ) : null}
      {workflow.isPending ? (
        <p>Loading workflow…</p>
      ) : workflow.isError ? (
        <p role="alert">
          Workflow unavailable: {workflow.error.message} {button("Retry", () => workflow.refetch())}
        </p>
      ) : (
        <>
          {stage === "Prepare" ? (
            <div className="space-y-3">
              <p role="status" aria-live="polite">
                {title.status === "QC_REVIEW" && !hasPermission(actor, "title.qc_review")
                  ? "Submitted successfully. Your title is now in the Bridge QC queue. No further Studio action is needed unless QC requests changes."
                  : title.status === "PREPARING" || title.status === "UPLOADING" || title.status === "DRAFT"
                    ? "Step 1: upload the main film. Step 2: keep the posters. Step 3: submit for QC. QC is not reviewed yet."
                    : `Lifecycle: ${title.status}. QC: ${workflow.data?.qc?.status ?? "Not reviewed"}.`}
              </p>
              <div className="rounded-lg border border-line p-3 text-xs" role="status">
                <span className="font-semibold">Required metadata · </span>
                {missingMetadata.length ? <span className="text-amber-600">BLOCKED — {missingMetadata.join(", ")}</span> : <span className="text-emerald-600">PASS — all required fields recorded</span>}
              </div>
              {canOperateOnTitle(actor, title, "title.advance_upload", "title.ingest_internal") &&
              ["DRAFT", "UPLOADING", "PREPARING"].includes(title.status)
                ? button(
                    title.status === "DRAFT"
                      ? "Start ingest"
                      : title.status === "UPLOADING"
                        ? "Prepare package"
                        : "Submit for QC",
                    () =>
                      advanceTitle({
                        data: {
                          id: title.id,
                          to:
                            title.status === "DRAFT"
                              ? "UPLOADING"
                              : title.status === "UPLOADING"
                                ? "PREPARING"
                                : "QC_REVIEW",
                        },
                      }),
                  )
                : null}
              {title.status === "QC_REVIEW" && actor.emailVerified && actor.internalRole === "qc_reviewer" ? (
                <div className="space-y-3 rounded-xl border border-line p-3">
                  <h3 className="font-semibold">Technical QC evidence</h3>
                  <p className="text-xs text-muted">Record the reviewer’s actual checks against the current master and artwork. These are reviewer attestations, not automated media-analysis results.</p>
                  <div className="rounded-lg border border-line p-3">
                    <p className="text-sm font-medium">Required metadata</p>
                    {missingMetadata.length ? (
                      <p className="mt-1 text-xs text-amber-600">BLOCKED — missing: {missingMetadata.join(", ")}</p>
                    ) : (
                      <p className="mt-1 text-xs text-emerald-600">PASS — required metadata fields are present.</p>
                    )}
                  </div>
                  <div className="space-y-2 rounded-lg border border-line p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">Current sealed master</p>
                        <p className="text-xs text-muted">{masterAsset ? `${(Number(masterAsset.byteSize) / (1024 ** 3)).toFixed(2)} GiB · ${masterAsset.contentType || "content type unavailable"}` : "Matching verified master not found"}</p>
                      </div>
                      <button type="button" className="rounded-lg border border-line px-3 py-2 text-sm"
                        disabled={!masterAsset || masterPlayback.isPending}
                        onClick={() => masterPlayback.mutate()}>
                        {masterPlayback.isPending ? "Opening master…" : "Load master for playback"}
                      </button>
                    </div>
                    {masterPlaybackUrl ? (
                      <video
                        controls
                        preload="metadata"
                        src={masterPlaybackUrl}
                        className="max-h-[520px] w-full rounded-lg bg-black"
                        onPlay={() => { setPlaybackCompleted(false); setPlaybackVerified(false); }}
                        onEnded={() => setPlaybackCompleted(true)}
                        onError={() => { setPlaybackCompleted(false); setPlaybackVerified(false); setError("The master could not be played in this browser. QC approval remains blocked."); }}
                      />
                    ) : null}
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={playbackVerified} disabled={!playbackCompleted}
                        onChange={(e) => setPlaybackVerified(e.target.checked)} />
                      Full master playback completed and verified
                    </label>
                    {!masterAsset ? <p className="text-xs text-amber-600">BLOCKED — current sealed master asset is not available for playback.</p> : null}
                    {masterPlaybackUrl && !playbackCompleted ? <p className="text-xs text-muted">Complete playback to enable the reviewer attestation.</p> : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {input("Video codec", codec, setCodec)}
                    {input("Resolution", resolution, setResolution)}
                    {input("Frame rate", frameRate, setFrameRate)}
                    {input("Master language", masterLanguage, setMasterLanguage)}
                    {input("Audio track details / channel layout", audioDetails, setAudioDetails)}
                  </div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={audioVerified} onChange={(e) => setAudioVerified(e.target.checked)} /> Audio playback and track checked</label>
                  <label className="grid gap-1 text-sm">Subtitle check
                    <select value={subtitleStatus} onChange={(e) => setSubtitleStatus(e.target.value as "VERIFIED" | "NOT_APPLICABLE")} className="rounded-lg border border-line bg-elevated p-2">
                      <option value="VERIFIED">Subtitles verified</option>
                      <option value="NOT_APPLICABLE">Not applicable</option>
                    </select>
                  </label>
                  {subtitleStatus === "VERIFIED" ? input("Verified subtitle languages", subtitleLanguages, setSubtitleLanguages) : null}
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={posterVerified} onChange={(e) => setPosterVerified(e.target.checked)} /> Current poster / artwork visually checked</label>
                  {input("Reviewer findings and technical notes (minimum 8 characters)", note, setNote)}
                  <div className="flex flex-wrap gap-2">
                    {button("Approve QC", () =>
                      reviewTitleWorkflow({
                        data: {
                          titleId: title.id, stage: "QC", decision: "APPROVE", note,
                          qcEvidence: {
                            playbackVerified: true, codec, resolution, frameRate, audioVerified: true,
                            audioDetails, masterLanguage, subtitleStatus, subtitleLanguages, posterVerified: true,
                          },
                        },
                      }),
                      !qcEvidenceReady || note.trim().length < 8 || missingMetadata.length > 0,
                    )}
                    {input("Affected file / asset / metadata field", correctionAffectedItem, setCorrectionAffectedItem)}
                    {input("Required replacement or correction evidence", correctionRequiredAction, setCorrectionRequiredAction)}
                    {button("Return for correction", () =>
                      reviewTitleWorkflow({
                        data: {
                          titleId: title.id, stage: "QC", decision: "REJECT", note,
                          correction: { affectedItem: correctionAffectedItem, requiredAction: correctionRequiredAction },
                        },
                      }),
                      note.trim().length < 8 || correctionAffectedItem.trim().length < 2 || correctionRequiredAction.trim().length < 8,
                    )}
                  </div>
                  {!qcEvidenceReady ? <p className="text-xs text-amber-600">QC approval BLOCKED — complete every technical evidence field and reviewer check.</p> : null}
                </div>
              ) : null}
              {workflow.data?.qc ? (
                <p className="text-xs text-muted" role="status">
                  QC {workflow.data.qc.status} · Reviewer {workflow.data.qc.reviewed_by ?? "not recorded"} · {workflow.data.qc.reviewed_at ? new Date(workflow.data.qc.reviewed_at).toLocaleString() : "Decision timestamp not recorded"}
                </p>
              ) : null}
              {workflow.data?.qc?.reviewer_findings.map((f, i) => (
                <div key={i} className="space-y-1 rounded-lg border border-line p-3 text-sm">
                  <p>{f.note}</p>
                  {f.correction ? (
                    <p className="text-xs text-amber-600">Correction required · {f.correction.affectedItem}: {f.correction.requiredAction}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {stage === "Business" ? (
            <div className="space-y-4">
              {workflow.data?.legal ? (
                <p className="text-xs text-muted" role="status">
                  Legal {workflow.data.legal.status} · Reviewer {workflow.data.legal.reviewed_by ?? "not recorded"} · {workflow.data.legal.reviewed_at ? new Date(workflow.data.legal.reviewed_at).toLocaleString() : "Decision timestamp not recorded"}
                </p>
              ) : null}
              {canManageRights ? <details className="rounded-xl border border-line p-3">
                <summary className="cursor-pointer text-sm font-semibold">＋ Create TVOD license draft</summary>
                <p className="mt-2 text-xs text-muted">Worldwide · {title.language}. Legal evidence is required before review.</p>
                {canOperateOnTitle(actor, title, "title.update_own", "title.license") ? (
                  <form
                    className="mt-3 grid gap-3 sm:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      action.mutate(() =>
                        submitLoopLicense({
                          data: {
                            titleId: title.id,
                            territories: ["WORLDWIDE"],
                            languages: [title.language],
                            windowStart: new Date(start).toISOString(),
                            windowEnd: new Date(end).toISOString(),
                            exclusivity: exclusive ? "EXCLUSIVE" : "NON_EXCLUSIVE",
                            agreementReference: agreement,
                            ownershipReference: ownership,
                            rightsOwnerSharePct: Number(ownerShare),
                            distributorSharePct: 100 - Number(ownerShare),
                          },
                        }),
                      );
                    }}
                  >
                    {input("License starts", start, setStart, "datetime-local")}
                    {input("License ends", end, setEnd, "datetime-local")}
                    {input("Agreement reference", agreement, setAgreement)}
                    {input("Ownership evidence reference", ownership, setOwnership)}
                    {input("Rights owner share (%)", ownerShare, setOwnerShare, "number")}
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={exclusive}
                        onChange={(e) => setExclusive(e.target.checked)}
                      />
                      Exclusive license
                    </label>
                    <button
                      disabled={action.isPending || !start || !end || agreement.trim().length < 8 || ownership.trim().length < 8 || ownerShare === ""}
                      className="rounded-lg border border-line px-4 py-2 text-sm sm:col-span-2"
                    >
                      {action.isPending ? "Saving…" : "Save draft"}
                    </button>
                  </form>
                ) : null}
              </details> : null}
              {canReviewRights ? (
                <>
                  <p className="text-xs text-muted">Open and inspect both signed documents in the authorized evidence store before approving. A typed document reference alone is not proof of ownership or distribution authority.</p>
                  {input("Independent Legal review note", note, setNote)}
                  {input("Verified signed distribution / OTT agreement reference", agreement, setAgreement)}
                  {input("Verified signed chain-of-title / authority reference", ownership, setOwnership)}
                </>
              ) : null}
              {canViewRights ? Object.entries(grantsByAgreement).map(([reference, agreementGrants]) => {
                const selectedId = selectedGrantByAgreement[reference] ?? agreementGrants[0]?.id ?? "";
                const selectedGrant = agreementGrants.find((grant) => grant.id === selectedId) ?? agreementGrants[0];
                return (
                  <section key={reference} className="space-y-3 rounded-xl border border-line p-3">
                    <div>
                      <h3 className="font-medium">Agreement: {reference}</h3>
                      <p className="text-xs text-muted">
                        {agreementGrants.length} license records · Select one record to review
                      </p>
                    </div>
                    <label className="grid gap-1 text-sm">
                      Choose license record
                      <select
                        value={selectedGrant?.id ?? ""}
                        onChange={(event) =>
                          setSelectedGrantByAgreement((current) => ({
                            ...current,
                            [reference]: event.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-line bg-elevated p-3"
                      >
                        {agreementGrants.map((grant, index) => (
                          <option key={grant.id} value={grant.id}>
                            {index + 1}. {grant.status} · {grant.exclusivity} · {grant.languages.join(", ")} · {new Date(grant.window_start).toLocaleDateString()}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedGrant ? (
                      <article className="space-y-3 rounded-lg bg-elevated p-3">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-semibold">{selectedGrant.status}</span>
                          <span>· {selectedGrant.exclusivity}</span>
                          <span>· {selectedGrant.territories.join(", ")}</span>
                          <span>· {selectedGrant.languages.join(", ")}</span>
                        </div>
                        <p className="text-xs text-muted">
                          {selectedGrant.window_start} → {selectedGrant.window_end}
                        </p>
                        <p className="break-all text-xs text-muted">Grant record: {selectedGrant.id}</p>
                        <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-sm font-semibold">Rights review checklist</h4>
                            <span className="text-xs text-muted">Evidence-based · no automatic approval</span>
                          </div>
                          {(() => {
                            const evidence = selectedGrant.evidence?.[0];
                            const terms = evidence?.commercialTerms;
                            const ownerShare = terms?.rightsOwnerSharePct;
                            const distributorShare = terms?.distributorSharePct;
                            const validSplit =
                              typeof ownerShare === "number" &&
                              typeof distributorShare === "number" &&
                              Number.isInteger(ownerShare) &&
                              Number.isInteger(distributorShare) &&
                              ownerShare >= 0 &&
                              distributorShare >= 0 &&
                              ownerShare + distributorShare === 100;
                            const validWindow =
                              Boolean(selectedGrant.window_start) &&
                              Boolean(selectedGrant.window_end) &&
                              Number.isFinite(new Date(selectedGrant.window_start).getTime()) &&
                              Number.isFinite(new Date(selectedGrant.window_end).getTime()) &&
                              new Date(selectedGrant.window_end) > new Date(selectedGrant.window_start) &&
                              new Date(selectedGrant.window_end) > new Date();
                            const checks = [
                              ["Ownership evidence reference recorded", Boolean(evidence?.ownershipReference?.trim())],
                              ["Agreement reference recorded", Boolean(evidence?.agreementReference?.trim())],
                              ["NON-EXCLUSIVE terms recorded", selectedGrant.exclusivity === "NON_EXCLUSIVE"],
                              ["Revenue-share split recorded and totals 100%", validSplit],
                              ["Territory, language and validity window recorded", selectedGrant.territories.length > 0 && selectedGrant.languages.length > 0 && validWindow],
                              ["Independent Legal approval recorded", selectedGrant.status === "VALID"],
                            ] as const;
                            return (
                              <>
                                <ul className="grid gap-2 sm:grid-cols-2">
                                  {checks.map(([label, passed]) => (
                                    <li key={label} className="flex items-start gap-2 text-xs">
                                      <span aria-label={passed ? "Passed" : "Pending"} className={passed ? "text-emerald-600" : "text-amber-600"}>
                                        {passed ? "✓" : "○"}
                                      </span>
                                      <span>{label} · {passed ? "Recorded" : "Pending / not recorded"}</span>
                                    </li>
                                  ))}
                                </ul>
                                <div className="grid gap-1 border-t border-line pt-2 text-xs text-muted sm:grid-cols-2">
                                  <p>Ownership ref: {evidence?.ownershipReference || "Not recorded"}</p>
                                  <p>Agreement ref: {evidence?.agreementReference || "Not recorded"}</p>
                                  <p>Rights owner share: {typeof ownerShare === "number" && Number.isInteger(ownerShare) ? `${ownerShare}%` : "Not recorded"}</p>
                                  <p>Distributor share: {typeof distributorShare === "number" && Number.isInteger(distributorShare) ? `${distributorShare}%` : "Not recorded"}</p>
                                </div>
                                <p className="text-xs font-medium" role="status">
                                  {checks.every(([, passed]) => passed)
                                    ? "All required fields are recorded. Documentary verification and Legal approval remain separate gates."
                                    : "PENDING — do not mark READY until every required item is verified and an independent Legal Reviewer approves."}
                                </p>
                              </>
                            );
                          })()}
                        </div>
                        {selectedGrant.status === "DRAFT" &&
                        title.status === "RIGHTS_REVIEW" &&
                        canReviewRights && selectedGrant.created_by !== actor.userId ? (
                          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                            {button(
                              "Approve rights / license",
                              () =>
                                reviewTitleWorkflow({
                                  data: {
                                    titleId: title.id,
                                    stage: "LEGAL",
                                    decision: "APPROVE",
                                    note,
                                    grantId: selectedGrant.id,
                                    agreementReference: agreement.trim(),
                                    ownershipReference: ownership.trim(),
                                  },
                                }),
                              note.trim().length < 8 || agreement.trim().length === 0 || ownership.trim().length === 0,
                            )}
                            {button(
                              "Reject",
                              () =>
                                reviewTitleWorkflow({
                                  data: {
                                    titleId: title.id,
                                    stage: "LEGAL",
                                    decision: "REJECT",
                                    note,
                                    grantId: selectedGrant.id,
                                  },
                                }),
                              note.trim().length < 8,
                            )}
                          </div>
                        ) : null}
                      </article>
                    ) : null}
                  </section>
                );
              }) : null}
              {!grants.length && canManageRights ? (
                <p role="status" className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">
                  No license draft has been saved. Enter the actual agreement and ownership evidence references, validity dates and revenue share above, then save. Saving creates a draft only; it does not approve Legal rights or publish the title.
                </p>
              ) : null}
            </div>
          ) : null}
          {stage === "Distribution" ? (
            <div className="space-y-3">
              {publication.isError ? (
                <p role="alert">Publication unavailable: {publication.error.message}</p>
              ) : publication.isPending ? (
                <p>Loading publication…</p>
              ) : (
                <div className="space-y-1 text-sm">
                  <p>Bridge authorization: {pub?.authorizationStatus ?? "NOT AUTHORIZED"}.</p>
                  <p>Loop catalogue: {pub?.listed && pub?.published ? "PUBLISHED" : "NOT PUBLISHED"}.</p>
                  <p className="text-xs text-muted">Consumer playback is a separate entitlement and delivery verification gate.</p>
                  <p className="text-xs text-muted">
                    {pub && publicationIsActive(pub.authorizationStatus, pub.windowStart, pub.windowEnd)
                      ? "Distribution window active"
                      : "No active distribution window"}
                  </p>
                </div>
              )}
              <p>
                Bridge authorization publishes the approved catalogue entry to Loop only after all six release gates pass. Catalogue visibility is not proof of consumer playback.
              </p>
              {readiness.isError ? <p role="alert">Release readiness unavailable: {readiness.error.message}</p> : null}
              {readiness.isPending ? <p className="text-xs text-muted">Checking all release gates…</p> : null}
              {readinessTitle ? (
                <div className="rounded-xl border border-line p-3">
                  <p className="text-sm font-semibold">Bridge → LOOP preflight · {readinessTitle.ready ? "PASS" : "BLOCKED"}</p>
                  {readinessTitle.blockers.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-600">
                      {readinessTitle.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                    </ul>
                  ) : <p className="mt-1 text-xs text-emerald-600">QC, Legal, OTT, Packaging, Curation and Delivery are ready.</p>}
                </div>
              ) : null}
              {canManageRights && valid && hasPermission(actor, "loop.publish")
                ? button("Publish approved license to Loop", () =>
                    authorizeLoopPublication({
                      data: {
                        bridgeTitleId: title.id,
                        destination: "CRAYONS_LOOP",
                        territories: valid.territories,
                        languages: valid.languages,
                        exploitationModels: ["TVOD"],
                        accessTier: "TVOD",
                        windowStart: valid.window_start,
                        windowEnd: valid.window_end,
                        commercialTerms: valid.evidence[0]?.commercialTerms,
                      },
                    }),
                    readiness.isPending || readiness.isError || !readinessTitle?.ready,
                  )
                : null}
              {!valid ? <p>Blocked: approved, unexpired Loop license required.</p> : null}
              {pub && canManageRights && hasPermission(actor, "loop.revoke") ? (
                <div className="flex gap-2">
                  {button("Suspend", () =>
                    suspendLoopPublication({
                      data: { bridgeTitleId: title.id, reason: note || "Operator suspension" },
                    }),
                  )}
                  {button("Revoke", () =>
                    revokeLoopPublication({ data: { bridgeTitleId: title.id } }),
                  )}
                </div>
              ) : null}
              {pub?.listed && pub?.published ? (
                <a
                  className="text-accent underline"
                  href={`https://crayonsloop.in/title/${title.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Inspect published Loop title
                </a>
              ) : null}
            </div>
          ) : null}
          {stage === "Revenue" ? (
            <div className="space-y-3">
              {!canFinance ? (
                <p>Revenue access requires title ownership or finance permission.</p>
              ) : revenue.isPending ? (
                <p>Loading canonical receipts…</p>
              ) : revenue.isError ? (
                <p role="alert">Revenue unavailable: {revenue.error.message}</p>
              ) : (
                <>
                  <p>
                    Captured rental receipts: {revenue.data?.receipts.length ?? 0}. Settlement
                    requires reconciliation of refunds, fees, tax and agreed terms; no payout is
                    implied.
                  </p>
                  <button
                    type="button"
                    className="rounded-lg border border-line p-2"
                    onClick={downloadStatement}
                  >
                    Export receipt statement CSV
                  </button>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] text-left text-sm">
                      <thead>
                        <tr>
                          <th>Payment</th>
                          <th>Date</th>
                          <th>Captured amount</th>
                          <th>Gross producer share · reconciliation pending</th>
                        </tr>
                      </thead>
                      <tbody>
                        {revenue.data?.receipts.map((r) => (
                          <tr key={r.paymentId}>
                            <td>{r.paymentId}</td>
                            <td>{r.purchasedAt}</td>
                            <td>
                              {r.amountPaise === null
                                ? "Amount evidence unavailable"
                                : `₹${(r.amountPaise / 100).toFixed(2)}`}
                            </td>
                            <td>
                              {r.grossProducerSharePaise === null
                                ? "Amount/agreement evidence missing"
                                : `₹${(r.grossProducerSharePaise / 100).toFixed(2)}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {hasPermission(actor, "finance.record_settlement") ? (
                    <form
                      className="grid gap-3 sm:grid-cols-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        action.mutate(() =>
                          recordSettlementEvidence({
                            data: {
                              titleId: title.id,
                              reference: settlementRef,
                              invoiceReference: invoiceRef,
                              statementReference: statementRef,
                              amountPaise: Math.round(Number(settlementAmount) * 100),
                            },
                          }),
                        );
                      }}
                    >
                      <p className="sm:col-span-2">
                        Record externally executed settlement evidence. These references remain
                        unverified; recording them does not send money or certify a payout.
                      </p>
                      {input("External transfer reference", settlementRef, setSettlementRef)}
                      {input("Invoice reference", invoiceRef, setInvoiceRef)}
                      {input("Reconciled statement reference", statementRef, setStatementRef)}
                      {input(
                        "External settlement amount INR",
                        settlementAmount,
                        setSettlementAmount,
                        "number",
                      )}
                      <button
                        className="rounded-lg border border-line p-2"
                        disabled={action.isPending}
                      >
                        Record evidence
                      </button>
                    </form>
                  ) : null}
                  {revenue.data?.settlementEvidence.map((s) => (
                    <article className="rounded-lg border border-line p-3 text-sm" key={s.id}>
                      <p>External evidence · Unverified · {s.recordedAt}</p>
                      <p>
                        Transfer: {s.details.reference} · ₹
                        {(s.details.amountPaise / 100).toFixed(2)}
                      </p>
                      <p>Invoice: {s.details.invoiceReference}</p>
                      <p>Statement: {s.details.statementReference}</p>
                    </article>
                  ))}
                  {!revenue.data?.receipts.length ? (
                    <p>
                      No matching captured receipts. This is not proof of payment-system failure.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
