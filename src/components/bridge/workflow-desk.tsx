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
  const [territories, setTerritories] = useState("WORLDWIDE");
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
  const valid = grants.find((g) => g.status === "VALID" && new Date(g.window_end) > new Date());
  const pub = publication.data?.publication;
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
        {stages.map((s) => (
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
              <p>
                License to Crayons Loop · TVOD. A draft requires an independent legal reviewer
                before publication.
              </p>
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
                  {input("Territories", territories, setTerritories)}
                  {input("Languages", languages, setLanguages)}
                  {input("Window start", start, setStart, "datetime-local")}
                  {input("Window end", end, setEnd, "datetime-local")}
                  {input("Executed agreement reference", agreement, setAgreement)}
                  {input("Ownership evidence reference", ownership, setOwnership)}
                  {input(
                    "Rights owner share % of gross captured INR (before fees/tax/refunds)",
                    ownerShare,
                    setOwnerShare,
                    "number",
                  )}
                  <label className="text-sm">
                    <input
                      type="checkbox"
                      checked={exclusive}
                      onChange={(e) => setExclusive(e.target.checked)}
                    />{" "}
                    Exclusive
                  </label>
                  <button disabled={action.isPending} className="rounded-lg border border-line p-2">
                    Save license draft
                  </button>
                </form>
              ) : null}
              {input("Legal review findings", note, setNote)}
              {grants.map((g) => (
                <article key={g.id} className="space-y-2 rounded-lg border border-line p-3">
                  <p>
                    {g.status} · {g.exclusivity} · {g.territories.join(", ")} ·{" "}
                    {g.languages.join(", ")}
                  </p>
                  <p className="text-xs">
                    {g.window_start} → {g.window_end}
                  </p>
                  <p>Agreement: {g.evidence[0]?.agreementReference ?? "Not recorded"}</p>
                  {g.status === "DRAFT" &&
                  title.status === "RIGHTS_REVIEW" &&
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
