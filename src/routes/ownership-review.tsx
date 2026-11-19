import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import type { BridgeActor } from "@/lib/bridge/session";
import {
  listOwnershipClaimsForReview,
  requestOwnershipClaimEvidenceDownload,
  triageOwnershipClaim,
  recordOwnershipLegalReview,
} from "@/lib/bridge/ownership-claims";

export const Route = createFileRoute("/ownership-review")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: OwnershipReview,
});

function OwnershipReview() {
  return (
    <RequireBridge allow="internal">
      {(actor) => (
        <BridgeShell actor={actor} title="Ownership evidence review">
          <OwnershipReviewBody actor={actor} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function OwnershipReviewBody({ actor }: { actor: BridgeActor }) {
  const qc = useQueryClient();
  const isSuperAdmin = actor.internalRole === "super_admin";
  const isLegalReviewer = actor.internalRole === "legal_reviewer";
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const queueQ = useQuery({
    queryKey: ["bridge-ownership-review-queue", actor.internalRole],
    queryFn: () => listOwnershipClaimsForReview(),
    enabled: isSuperAdmin || isLegalReviewer,
    retry: 1,
  });

  const triageMutation = useMutation({
    mutationFn: (input: { claimId: string; decision: "NEEDS_INFORMATION" | "REFERRED_TO_LEGAL" | "CLOSED_INTAKE" }) =>
      triageOwnershipClaim({ data: { ...input, note: notes[input.claimId]?.trim() ?? "" } }),
    onSuccess: async (result) => {
      setNotice(result.titleOwnershipChanged ? "Unexpected title ownership response." : "Intake decision recorded. Title ownership and asset attribution were not changed.");
      setError(null);
      await qc.invalidateQueries({ queryKey: ["bridge-ownership-review-queue"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not save intake decision."),
  });

  const legalMutation = useMutation({
    mutationFn: (input: { claimId: string; decision: "SUPPORTED" | "NOT_SUPPORTED" | "NEEDS_MORE_EVIDENCE" }) =>
      recordOwnershipLegalReview({ data: { ...input, note: notes[input.claimId]?.trim() ?? "" } }),
    onSuccess: async () => {
      setNotice("Legal evidence decision recorded. No title owner, asset attribution, rights grant or publication was changed.");
      setError(null);
      await qc.invalidateQueries({ queryKey: ["bridge-ownership-review-queue"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not record Legal decision."),
  });

  async function openEvidence(claimId: string, evidenceId: string) {
    try {
      const signed = await requestOwnershipClaimEvidenceDownload({ data: { claimId, evidenceId } });
      window.open(signed.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evidence download is not available.");
    }
  }

  if (!isSuperAdmin && !isLegalReviewer) {
    return <p role="alert" className="rounded-xl border border-line bg-surface p-5 text-sm">This workspace is restricted to Super Admin intake and Legal Reviewer evidence review.</p>;
  }

  const claims = queueQ.data?.claims ?? [];
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-1 pb-16">
      <header className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Crayons Bridge · {isSuperAdmin ? "Super Admin intake" : "Legal Reviewer"}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">Producer ownership evidence</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
          Review the submitted evidence, record a reasoned decision and preserve the existing title and asset history.
          A positive evidence decision is not an ownership transfer or rights grant.
        </p>
      </header>

      {notice ? <p role="status" className="rounded-lg border border-line bg-surface p-3 text-sm">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-line bg-surface p-3 text-sm text-accent">{error}</p> : null}

      {queueQ.isPending ? <p className="text-sm text-muted">Loading review cases…</p> : null}
      {queueQ.isError ? (
        <section role="alert" className="rounded-xl border border-line bg-surface p-5">
          <p className="text-sm">Ownership review queue could not be loaded.</p>
          <button type="button" onClick={() => void queueQ.refetch()} className="mt-3 text-sm font-semibold text-accent underline">Retry</button>
        </section>
      ) : null}
      {!queueQ.isPending && !queueQ.isError && claims.length === 0 ? (
        <section className="rounded-xl border border-dashed border-line p-6">
          <h2 className="font-semibold">No claims are waiting in this review queue</h2>
          <p className="mt-2 text-sm text-muted">An empty queue is not a statement that titles are legally cleared.</p>
        </section>
      ) : null}

      <div className="space-y-4">
        {claims.map((claim) => (
          <article key={claim.id} className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-accent">{claim.status.replaceAll("_", " ")}</p>
                <h2 className="mt-1 font-display text-xl font-semibold">{claim.titleName}</h2>
                <p className="mt-1 text-sm text-muted">Claimant: {claim.claimantDisplayName || "Verified Creator account"} · Producer / entity: {claim.producerEntityName}</p>
              </div>
              <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">{claim.titleStatus}</span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-line p-3">
                <p className="text-xs text-muted">Claim basis</p>
                <p className="mt-1 text-sm font-medium">{claim.claimBasis.replaceAll("_", " ")}</p>
                <p className="mt-1 text-xs text-muted">Claimant relationship: {claim.claimantCapacity.replaceAll("_", " ")}</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-xs text-muted">Owner mapping</p>
                <p className="mt-1 text-sm font-medium">{claim.ownerMismatch ? "Claimant differs from the currently recorded title owner" : "Claimant matches the recorded owner"}</p>
                <p className="mt-1 text-xs text-muted">The existing owner field is read-only in this workflow.</p>
              </div>
            </div>

            <section className="mt-4">
              <h3 className="text-sm font-semibold">Evidence files</h3>
              {claim.evidence.length ? (
                <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                  {claim.evidence.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{item.fileName}</p>
                        <p className="text-xs text-muted">{item.category.replaceAll("_", " ")} · {item.status} · {item.contentType} · {(item.byteSize / (1024 * 1024)).toFixed(1)} MB</p>
                      </div>
                      <button type="button" disabled={item.status !== "VERIFIED"} onClick={() => void openEvidence(claim.id, item.id)} className="text-sm font-semibold text-accent underline disabled:opacity-40">
                        Open private evidence
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-muted">No evidence files are attached.</p>}
              <p className="mt-2 text-xs text-muted">Evidence links are short-lived. Do not copy documents into public buckets or attach them to the title's public asset listing.</p>
            </section>

            <label className="mt-4 grid gap-1.5 text-sm">
              <span className="font-medium">{isSuperAdmin ? "Intake note / reason" : "Legal assessment and reasoning"}</span>
              <textarea
                className="min-h-24 rounded-md border border-line bg-bg px-3 py-2"
                value={notes[claim.id] ?? ""}
                onChange={(event) => setNotes((prev) => ({ ...prev, [claim.id]: event.target.value }))}
                maxLength={2000}
                placeholder={isSuperAdmin ? "Explain missing evidence or why this should be referred to Legal…" : "Record the documents assessed, limitations, exclusions and reasoning…"}
              />
            </label>

            {isSuperAdmin && ["SUBMITTED", "NEEDS_INFORMATION"].includes(claim.status) ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={triageMutation.isPending || (notes[claim.id] ?? "").trim().length < 5} onClick={() => triageMutation.mutate({ claimId: claim.id, decision: "NEEDS_INFORMATION" })} className="rounded-full border border-line px-4 py-2 text-sm font-semibold disabled:opacity-40">Request more evidence</button>
                <button type="button" disabled={triageMutation.isPending || (notes[claim.id] ?? "").trim().length < 5} onClick={() => triageMutation.mutate({ claimId: claim.id, decision: "REFERRED_TO_LEGAL" })} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40">Refer to Legal</button>
                <button type="button" disabled={triageMutation.isPending || (notes[claim.id] ?? "").trim().length < 5} onClick={() => triageMutation.mutate({ claimId: claim.id, decision: "CLOSED_INTAKE" })} className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40">Close intake</button>
              </div>
            ) : null}

            {isLegalReviewer && claim.status === "REFERRED_TO_LEGAL" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={legalMutation.isPending || (notes[claim.id] ?? "").trim().length < 10} onClick={() => legalMutation.mutate({ claimId: claim.id, decision: "SUPPORTED" })} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40">Evidence supports claim</button>
                <button type="button" disabled={legalMutation.isPending || (notes[claim.id] ?? "").trim().length < 10} onClick={() => legalMutation.mutate({ claimId: claim.id, decision: "NOT_SUPPORTED" })} className="rounded-full border border-line px-4 py-2 text-sm font-semibold disabled:opacity-40">Evidence does not support claim</button>
                <button type="button" disabled={legalMutation.isPending || (notes[claim.id] ?? "").trim().length < 10} onClick={() => legalMutation.mutate({ claimId: claim.id, decision: "NEEDS_MORE_EVIDENCE" })} className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40">Request more evidence</button>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <p className="rounded-lg border border-line p-4 text-xs leading-relaxed text-muted">
        Separation of duties: Super Admin performs intake and routing; Legal Reviewer records the separate legal evidence assessment.
        Neither action changes bridge_titles.owner_user_id, bridge_assets.created_by, rights grants, title lifecycle, payment records,
        Loop publication or asset access permissions. Any later ownership transfer requires a separate approved and audited workflow.
      </p>
    </main>
  );
}
