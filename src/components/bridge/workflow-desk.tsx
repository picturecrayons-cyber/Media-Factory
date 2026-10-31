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
import {
  authorizeLoopPublication,
  getLoopPublication,
  revokeLoopPublication,
  suspendLoopPublication,
} from "@/lib/bridge/loop-publication";
import { hasPermission, canOperateOnTitle } from "@/lib/bridge/rbac";
import { publicationIsActive } from "@/lib/bridge/workflow-policy";
import { buildTitleWorkflowProgress } from "@/lib/bridge/title-workflow-readiness";
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
  const canFinance = canOperateOnTitle(actor, title, "title.read_own", "finance.read");
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
  const territories = "WORLDWIDE";
  const [languages, setLanguages] = useState(title.language);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [exclusive, setExclusive] = useState(false);
  const [agreement, setAgreement] = useState("");
  const [ownership, setOwnership] = useState("");
  const [ownerShare, setOwnerShare] = useState("");
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
  const now = Date.now();
  const valid = grants.find(
    (g) =>
      g.status === "VALID" &&
      new Date(g.window_start).getTime() <= now &&
      new Date(g.window_end).getTime() > now,
  );
  const pub = publication.data?.publication;
  const signals = {
    metadataComplete: Boolean(workflow.data?.readiness.metadataComplete),
    verifiedMaster: Boolean(workflow.data?.readiness.verifiedMaster),
    verifiedArtwork: Boolean(workflow.data?.readiness.verifiedArtwork),
    privateScreener: Boolean(workflow.data?.readiness.privateScreener),
    qcPassed: Boolean(workflow.data?.readiness.qcPassed),
    rightsGrantValid: Boolean(workflow.data?.readiness.rightsGrantValid),
    rightsEvidenceReady: Boolean(workflow.data?.readiness.rightsEvidenceReady),
    legalApproved: Boolean(workflow.data?.readiness.legalApproved),
    legalEvidenceReady: Boolean(workflow.data?.readiness.legalEvidenceReady),
    destinationPackageReady: Boolean(workflow.data?.readiness.destinationPackageReady),
    loopPublicationActive: Boolean(
      pub && publicationIsActive(pub.authorizationStatus, pub.windowStart, pub.windowEnd),
    ),
  };
  const progress = buildTitleWorkflowProgress(signals);
  const stageIndex = stages.indexOf(stage);
  const stageGates = progress.gates.filter((gate) => gate.stage === stage);
  const stageComplete = stageGates.length > 0 && stageGates.every((gate) => gate.complete);
  const nextStage = stages[stageIndex + 1];
  const nextGate = progress.nextGate;
  let nextActionTitle = nextGate?.title ?? "All publication gates are complete";
  let nextActionOwner = nextGate?.owner ?? "Bridge Operations";
  let nextActionHint = "Complete the checks assigned to the named role; approvals remain separate.";
  if (nextGate?.id === "qcPassed" && title.status === "PREPARING" && signals.verifiedMaster && signals.verifiedArtwork) {
    nextActionTitle = "Submit for QC";
    nextActionOwner = "Title owner / Studio";
    nextActionHint = "The current master and artwork match verified assets. Submission will recheck them on the server.";
  } else if (nextGate?.id === "qcPassed" && title.status === "QC_REVIEW") {
    nextActionTitle = "QC reviewer must inspect the current master and artwork";
    nextActionOwner = "QC Reviewer";
    nextActionHint = "The title remains blocked until a reviewer records approval or returns findings.";
  } else if (nextGate?.id === "rightsGrantValid") {
    nextActionTitle = "Record the Loop TVOD business proposal and its term";
    nextActionOwner = "Rights Owner / Authorized Distributor";
    nextActionHint = "Use only terms supported by the actual signed deal; an independent legal reviewer must approve.";
  } else if (nextGate?.id === "rightsEvidenceReady") {
    nextActionTitle = "Record the executed agreement and ownership evidence references";
    nextActionOwner = "Rights Owner / Authorized Distributor";
    nextActionHint = "These fields store references; they do not prove the underlying document is genuine.";
  } else if (nextGate?.id === "legalApproved" || nextGate?.id === "legalEvidenceReady") {
    nextActionTitle = "Complete independent legal review";
    nextActionOwner = "Legal Reviewer (not the draft creator)";
    nextActionHint = "Legal approval must be recorded against the selected license draft with review findings.";
  } else if (nextGate?.id === "destinationPackageReady") {
    nextActionTitle = "Create the destination package";
    nextActionOwner = "Bridge Distribution Operations";
    nextActionHint = "Package preparation does not publish the title to consumers.";
  } else if (nextGate?.id === "loopPublicationActive") {
    nextActionTitle = "Authorize Crayons Loop publication for the approved window";
    nextActionOwner = "Bridge Publishing / Distribution Admin";
    nextActionHint = "Publication requires an approved, unexpired license and a prepared destination package.";
  }
  const button = (label: string, run: () => Promise<unknown>) => (
    <button
      type="button"
      className="rounded-lg border border-line px-4 py-2 text-sm disabled:opacity-50"
      disabled={action.isPending}
      onClick={() => action.mutate(run)}
    >
      {label}
    </button>
  );
  const input = (
    label: string,
    value: string,
    set: (v: string) => void,
    type = "text",
    options: {
      min?: number;
      max?: number;
      step?: number;
      minLength?: number;
      maxLength?: number;
      placeholder?: string;
      help?: string;
    } = {},
  ) => (
    <label className="grid gap-1 text-sm">
      {label}
      <input
        type={type}
        value={value}
        min={options.min}
        max={options.max}
        step={options.step}
        minLength={options.minLength}
        maxLength={options.maxLength}
        placeholder={options.placeholder}
        onChange={(e) => set(e.target.value)}
        className="rounded-lg border border-line bg-elevated p-2"
        required
      />
      {options.help ? <span className="text-xs text-muted">{options.help}</span> : null}
    </label>
  );
  if (actor.accountType === "buyer" && !actor.internalRole) return null;
  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Title operations</h2>
          <p className="mt-1 text-sm text-muted">Step {stageIndex + 1} of {stages.length} · {stage}</p>
        </div>
        <span className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold">
          {progress.completed}/{progress.total} gates · {progress.percent}%
        </span>
      </div>

      <section className="rounded-xl border border-line p-4" aria-label="Publication readiness progress">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold">Publication readiness</span>
          <span>{progress.completed} of {progress.total} required checks complete</span>
        </div>
        <div
          role="progressbar"
          aria-label="Publication readiness"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
          className="mt-3 h-2 overflow-hidden rounded-full bg-elevated"
        >
          <div className="h-full bg-fg transition-all" style={{ width: progress.percent + "%" }} />
        </div>
        <div className="mt-4">
          <p className="text-sm font-semibold">Next action: {nextActionTitle}</p>
          <p className="mt-1 text-xs text-muted">Responsible: {nextActionOwner}</p>
          <p className="mt-2 text-sm text-muted">{nextActionHint}</p>
        </div>
        {stageGates.length ? (
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{stage} checklist</p>
            <ul className="mt-2 space-y-2">
              {stageGates.map((gate) => (
                <li key={gate.id} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                  <span className={gate.complete ? "text-fg" : "text-muted"}>
                    {gate.complete ? "Done" : "Pending"} · {gate.title}
                  </span>
                  <span className="text-xs text-muted">{gate.owner}</span>
                </li>
              ))}
            </ul>
            {stageComplete && nextStage ? (
              <button
                type="button"
                className="mt-4 rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-bg"
                disabled={action.isPending}
                onClick={() => setStage(nextStage)}
              >
                Continue to {nextStage}
              </button>
            ) : null}
          </div>
        ) : stage === "Revenue" ? (
          <p className="mt-4 border-t border-line pt-3 text-sm text-muted">
            Revenue is a post-publication reconciliation step. This page reads captured receipts and records settlement evidence; it does not move money.
          </p>
        ) : null}
        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-sm font-semibold">View full checklist ({progress.completed}/{progress.total})</summary>
          <ul className="mt-3 space-y-3">
            {(["Prepare", "Business", "Distribution"] as const).map((group) => (
              <li key={group}>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{group}</p>
                <ul className="mt-2 space-y-2">
                  {progress.gates.filter((gate) => gate.stage === group).map((gate) => (
                    <li key={gate.id} className="grid gap-1 text-sm sm:grid-cols-[1fr_auto]">
                      <span>{gate.complete ? "Done" : "Pending"} · {gate.title}</span>
                      <span className="text-xs text-muted">{gate.owner}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Operational workflow">
        {stages.map((s, i) => {
          const gates = progress.gates.filter((gate) => gate.stage === s);
          const complete = gates.length > 0 && gates.every((gate) => gate.complete);
          return (
            <button
              type="button"
              key={s}
              aria-pressed={stage === s}
              className={"rounded-full border border-line px-4 py-2 text-sm " + (stage === s ? "bg-fg text-bg" : "")}
              onClick={() => setStage(s)}
            >
              {i + 1}. {s}{complete ? " · Done" : ""}
            </button>
          );
        })}
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
              <p>
                Lifecycle: {title.status}. QC: {workflow.data?.qc?.status ?? "Not reviewed"}. Upload
                verified master and artwork below before submitting.
              </p>
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
              {title.status === "QC_REVIEW" && hasPermission(actor, "title.qc_review") ? (
                <>
                  {input(
                    "Technical review findings (include playback/codec checks)",
                    note,
                    setNote,
                  )}
                  {button("Approve QC", () =>
                    reviewTitleWorkflow({
                      data: { titleId: title.id, stage: "QC", decision: "APPROVE", note },
                    }),
                  )}
                  {button("Return for correction", () =>
                    reviewTitleWorkflow({
                      data: { titleId: title.id, stage: "QC", decision: "REJECT", note },
                    }),
                  )}
                </>
              ) : null}
              {workflow.data?.qc?.reviewer_findings.map((f, i) => (
                <p key={i} className="text-sm">
                  {f.note}
                </p>
              ))}
            </div>
          ) : null}
          {stage === "Business" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-line p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Business terms · Loop TVOD</p>
                <h3 className="mt-1 text-base font-semibold">Distribution license proposal</h3>
                <p className="mt-2 text-sm text-muted">
                  The rights owner, studio, or authorized distributor that holds the signed deal should enter these terms.
                  Bridge Admin may help record them, but must not invent missing terms. A different Legal Reviewer must approve the draft.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div><p className="text-xs text-muted">Distribution partner / destination</p><p className="mt-1 text-sm font-semibold">Crayons Loop</p></div>
                  <div><p className="text-xs text-muted">Rights type</p><p className="mt-1 text-sm font-semibold">Distribution / licensing rights</p></div>
                  <div><p className="text-xs text-muted">Business model</p><p className="mt-1 text-sm font-semibold">TVOD · Transactional Video on Demand</p></div>
                  <div><p className="text-xs text-muted">Territory</p><p className="mt-1 text-sm font-semibold">Worldwide only in this form</p></div>
                  <div><p className="text-xs text-muted">Commercial terms</p><p className="mt-1 text-sm font-semibold">Percentage revenue split</p></div>
                  <div><p className="text-xs text-muted">Fixed fee option</p><p className="mt-1 text-sm font-semibold">Not supported in this Loop form yet</p></div>
                </div>
                <p className="mt-3 text-xs text-muted">
                  The current Loop connector accepts worldwide TVOD rights and a percentage split totalling 100%. Do not enter a fixed fee as a percentage.
                </p>
              </div>
              {canOperateOnTitle(actor, title, "title.update_own", "title.license") ? (
                <form
                  className="grid gap-3 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    action.mutate(() =>
                      submitLoopLicense({
                        data: {
                          titleId: title.id,
                          territories: territories
                            .split(",")
                            .map((v) => v.trim())
                            .filter(Boolean),
                          languages: languages
                            .split(",")
                            .map((v) => v.trim())
                            .filter(Boolean),
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
                  <div className="grid gap-1 text-sm">
                    Territory (supported)
                    <p className="rounded-lg border border-line bg-elevated p-2">WORLDWIDE</p>
                    <span className="text-xs text-muted">Other territory selections are not supported by the current Loop TVOD endpoint.</span>
                  </div>
                  {input("Languages (comma-separated)", languages, setLanguages, "text", {
                    maxLength: 400,
                    help: "Use the language names agreed in the rights contract.",
                  })}
                  {input("Window start", start, setStart, "datetime-local")}
                  {input("Window end", end, setEnd, "datetime-local")}
                  {input("Executed agreement reference", agreement, setAgreement, "text", {
                    minLength: 8, maxLength: 500, placeholder: "Reference from the signed agreement",
                    help: "Reference text only. It does not validate or upload the underlying document.",
                  })}
                  {input("Rights ownership evidence reference", ownership, setOwnership, "text", {
                    minLength: 8, maxLength: 500, placeholder: "Reference to ownership / onward-rights evidence",
                    help: "Reference text only. Enter an actual evidence identifier; do not use a placeholder.",
                  })}
                  {input("Rights owner share (%)", ownerShare, setOwnerShare, "number", {
                    min: 0, max: 100, step: 1,
                    help: "Percentage of gross captured INR before fees, tax and refunds. Distributor share is calculated as the remainder.",
                  })}
                  <p className="sm:col-span-2 rounded-lg border border-line p-3 text-sm">
                    {ownerShare.trim() !== "" && Number.isInteger(Number(ownerShare)) && Number(ownerShare) >= 0 && Number(ownerShare) <= 100
                      ? "Proposed split: Rights owner " + Number(ownerShare) + "% · Distributor " + (100 - Number(ownerShare)) + "%"
                      : "Enter a whole-number rights owner share from 0 to 100. Both shares must total 100%."}
                  </p>
                  <label className="text-sm">
                    <input
                      type="checkbox"
                      checked={exclusive}
                      onChange={(e) => setExclusive(e.target.checked)}
                    />{" "}
                    Grant exclusive distribution rights for this window
                    <span className="mt-1 block text-xs text-muted">
                      Unchecked means non-exclusive. Select exclusivity only if the executed agreement says so.
                    </span>
                  </label>
                  <button disabled={action.isPending} className="rounded-lg border border-line p-2">
                    Save license draft
                  </button>
                </form>
              ) : null}
              {hasPermission(actor, "title.rights_review") && title.status === "RIGHTS_REVIEW" ? (
                <div className="space-y-2 rounded-xl border border-line p-4">
                  <p className="text-sm font-semibold">Independent legal review</p>
                  <p className="text-xs text-muted">
                    The reviewer must be different from the person who created the license draft. Record specific findings before approving or rejecting.
                  </p>
                  {input("Legal review findings (minimum 8 characters)", note, setNote, "text", {
                    minLength: 8, maxLength: 2000,
                  })}
                </div>
              ) : grants.some((g) => g.status === "DRAFT") ? (
                <p className="text-sm text-muted">Draft saved. Waiting for an independent Legal Reviewer; the draft creator cannot approve their own proposal.</p>
              ) : null}
              {grants.map((g) => (
                <article key={g.id} className="space-y-2 rounded-lg border border-line p-3">
                  <p>
                    {g.status} · {g.exclusivity} · {g.territories.join(", ")} · {g.languages.join(", ")}
                  </p>
                  <p className="text-xs text-muted">
                    {g.media.join(", ")} · Draft creator: {g.created_by === actor.userId ? "You" : "Another authorized user"}
                  </p>
                  <p className="text-sm">
                    Revenue split: Rights owner {g.evidence[0]?.commercialTerms?.rightsOwnerSharePct ?? "—"}% ·
                    Distributor {g.evidence[0]?.commercialTerms?.distributorSharePct ?? "—"}%
                  </p>
                  <p className="text-xs">
                    {g.window_start} → {g.window_end}
                  </p>
                  <p>Agreement: {g.evidence[0]?.agreementReference ?? "Not recorded"}</p>
                  {g.status === "DRAFT" &&
                  title.status === "RIGHTS_REVIEW" &&
                  g.created_by !== actor.userId &&
                  hasPermission(actor, "title.rights_review") ? (
                    <div className="flex gap-2">
                      {button("Approve rights / license", () =>
                        reviewTitleWorkflow({
                          data: {
                            titleId: title.id,
                            stage: "LEGAL",
                            decision: "APPROVE",
                            note,
                            grantId: g.id,
                          },
                        }),
                      )}
                      {button("Reject", () =>
                        reviewTitleWorkflow({
                          data: {
                            titleId: title.id,
                            stage: "LEGAL",
                            decision: "REJECT",
                            note,
                            grantId: g.id,
                          },
                        }),
                      )}
                    </div>
                  ) : null}
                </article>
              ))}
              {!grants.length ? <p>No license draft recorded.</p> : null}
            </div>
          ) : null}
          {stage === "Distribution" ? (
            <div className="space-y-3">
              {publication.isError ? (
                <p role="alert">Publication unavailable: {publication.error.message}</p>
              ) : publication.isPending ? (
                <p>Loading publication…</p>
              ) : (
                <p>
                  Loop authorization: {pub?.authorizationStatus ?? "Not authorized"}.{" "}
                  {pub &&
                  publicationIsActive(pub.authorizationStatus, pub.windowStart, pub.windowEnd)
                    ? "Active window"
                    : "No active distribution window"}
                </p>
              )}
              <p>
                Publish copies the approved title metadata, artwork and media reference into the
                shared Loop catalog. Catalog publication alone does not prove consumer playback.
              </p>
              {valid && hasPermission(actor, "loop.publish")
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
                  )
                : null}
              {!valid ? <p>Blocked: approved, unexpired Loop license required.</p> : null}
              {pub && hasPermission(actor, "loop.revoke") ? (
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
              {pub ? (
                <a
                  className="text-accent underline"
                  href={`https://crayonsloop.in/title/${title.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Inspect consumer title
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
