import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  listPendingStoryConcepts,
  updateStoryConceptCuration,
} from "@/lib/bridge/story-concept-api";
import type { CurationStatus } from "@/lib/bridge/story-concept";
import {
  getStoryConceptNetworkReadiness,
  grantStoryConceptNetworkAccess,
  listStoryConceptNetworkOrganizations,
  revokeStoryConceptNetworkAccess,
  reviewStoryConceptReadiness,
} from "@/lib/bridge/story-concept-network-api";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved for network introduction",
  REJECTED: "Rejected",
  INTRODUCED_TO_BUYERS: "Legacy introduction status",
};

export function StoryConceptDesk() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-story-concepts"],
    queryFn: () => listPendingStoryConcepts(),
  });

  const update = useMutation({
    mutationFn: (input: {
      id: string;
      status: Exclude<CurationStatus, "INTRODUCED_TO_BUYERS">;
      adminNotes?: string;
    }) => updateStoryConceptCuration({ data: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-story-concepts"] });
    },
  });

  if (query.isLoading) {
    return <p className="text-sm text-muted">Loading story concepts…</p>;
  }

  if (query.isError) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-sm">
        Unable to load story concepts. Confirm migration is applied and you have staff access.
      </div>
    );
  }

  const concepts = query.data?.concepts ?? [];

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display text-2xl font-semibold">Story / Concept curation</h3>
        <p className="mt-1 text-sm text-muted">
          Review submissions before any Buyer or Investor introduction. Nothing auto-publishes to Loop.
        </p>
      </div>

      {!concepts.length ? (
        <div className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted">
          No concepts in queue.
        </div>
      ) : (
        <div className="space-y-3">
          {concepts.map((c) => (
            <article
              key={c.id}
              className="rounded-2xl border border-line bg-surface p-4 sm:p-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{(c as { titleName?: string }).titleName ?? "Untitled"}</p>
                  <p className="mt-1 text-xs text-muted">
                    {STATUS_LABEL[c.curation_status] ?? c.curation_status}
                    {c.created_at ? ` · ${new Date(c.created_at).toLocaleDateString()}` : ""}
                  </p>
                  {c.logline ? (
                    <p className="mt-3 text-sm leading-relaxed text-fg/90">{c.logline}</p>
                  ) : null}
                  {c.genre?.length ? (
                    <p className="mt-2 text-xs text-muted">{c.genre.join(" · ")}</p>
                  ) : null}
                </div>
                <Link
                  to="/title/$id"
                  params={{ id: c.title_id }}
                  className="shrink-0 rounded-full border border-line px-3.5 py-1.5 text-xs text-muted hover:border-line-strong hover:text-fg"
                >
                  Open title
                </Link>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {c.curation_status === "PENDING" && (
                  <Button
                    size="sm"
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate({ id: c.id, status: "UNDER_REVIEW" })
                    }
                  >
                    Start review
                  </Button>
                )}
                {(c.curation_status === "PENDING" ||
                  c.curation_status === "UNDER_REVIEW") && (
                  <>
                    <Button
                      size="sm"
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({ id: c.id, status: "APPROVED" })
                      }
                    >
                      Approve for introduction review
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({ id: c.id, status: "REJECTED" })
                      }
                    >
                      Reject
                    </Button>
                  </>
                )}
              </div>

              {c.curation_status === "APPROVED" && (
                <p className="mt-3 rounded-lg border border-line bg-elevated/40 px-3 py-2 text-xs leading-5 text-muted">
                  Curation approval is recorded. Buyer / Investor invitations, access grants and interest capture are not active yet; this status does not mean an introduction has occurred.
                </p>
              )}
              {c.curation_status === "INTRODUCED_TO_BUYERS" && (
                <p className="mt-3 rounded-lg border border-line bg-elevated/40 px-3 py-2 text-xs leading-5 text-muted">
                  This is a legacy introduction status. Verify actual Buyer / Investor access records before treating the concept as introduced.
                </p>
              )}
              {c.curation_status === "APPROVED" ? (
                <StoryConceptNetworkControls conceptSubmissionId={c.id} />
              ) : null}

              {update.isError ? (
                <p className="mt-3 text-xs text-accent">{String(update.error)}</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}


function StoryConceptNetworkControls({ conceptSubmissionId }: { conceptSubmissionId: string }) {
  const qc = useQueryClient();
  const [accountType, setAccountType] = useState<"buyer" | "investor">("buyer");
  const [organizationId, setOrganizationId] = useState("");
  const orgsQ = useQuery({
    queryKey: ["story-concept-network-organizations"],
    queryFn: () => listStoryConceptNetworkOrganizations(),
    retry: false,
  });
  const readinessQ = useQuery({
    queryKey: ["story-concept-network-readiness", conceptSubmissionId],
    queryFn: () => getStoryConceptNetworkReadiness({ data: { conceptSubmissionId } }),
    retry: false,
  });
  const available = (orgsQ.data?.organizations ?? []).filter((org) => org.account_type === accountType);
  const grant = useMutation({
    mutationFn: () => grantStoryConceptNetworkAccess({
      data: { conceptSubmissionId, organizationId, accountType },
    }),
    onSuccess: () => {
      setOrganizationId("");
      void qc.invalidateQueries({ queryKey: ["story-concept-network-readiness", conceptSubmissionId] });
    },
  });
  const revoke = useMutation({
    mutationFn: (mandateId: string) => revokeStoryConceptNetworkAccess({
      data: { mandateId, reason: "Revoked by Super Admin during concept network review." },
    }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["story-concept-network-readiness", conceptSubmissionId] }),
  });
  const readiness = useMutation({
    mutationFn: () => reviewStoryConceptReadiness({
      data: { conceptSubmissionId, decision: "APPROVED", reviewNotes: "Positive interest verified from introduced Buyer / Investor organization." },
    }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["story-concept-network-readiness", conceptSubmissionId] }),
  });

  if (orgsQ.isError || readinessQ.isError) {
    return (
      <div className="mt-4 rounded-lg border border-line bg-elevated/40 p-3 text-xs text-muted">
        Network controls require Super Admin access and the network migration. Curation approval alone does not grant network access.
      </div>
    );
  }

  const mandates = readinessQ.data?.mandates ?? [];
  const interest = readinessQ.data?.interest ?? [];
  const gate = readinessQ.data?.readiness;
  const hasCurrentPositiveInterest = interest.some((event) =>
    ["INTERESTED", "REQUESTED_MATERIALS"].includes(event.interest_level) &&
    mandates.some((mandate) =>
      mandate.grantee_organization_id === event.organization_id &&
      mandate.grantee_account_type === event.account_type &&
      mandate.grant_status === "ACTIVE"
    )
  );

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-line bg-elevated/30 p-4">
      <div>
        <p className="text-sm font-semibold">Buyer / Investor network</p>
        <p className="mt-1 text-xs text-muted">Grant access only to verified, active organizations. Each grant is revocable and audited.</p>
      </div>
      {orgsQ.isPending || readinessQ.isPending ? (
        <p className="text-xs text-muted">Loading network controls…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Network account type"
              value={accountType}
              onChange={(event) => { setAccountType(event.target.value as "buyer" | "investor"); setOrganizationId(""); }}
              className="rounded-md border border-line bg-surface px-3 py-2 text-xs"
            >
              <option value="buyer">Buyer</option>
              <option value="investor">Investor</option>
            </select>
            <select
              aria-label="Verified network organization"
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
              className="min-w-48 rounded-md border border-line bg-surface px-3 py-2 text-xs"
            >
              <option value="">Select organization</option>
              {available.map((org) => (
                <option key={org.organization_id} value={org.organization_id}>
                  {org.organization_name} ({org.verified_member_count} verified)
                </option>
              ))}
            </select>
            <Button size="sm" disabled={!organizationId || grant.isPending} onClick={() => grant.mutate()}>
              {grant.isPending ? "Granting…" : "Grant introduction"}
            </Button>
          </div>
          {!available.length ? <p className="text-xs text-muted">No verified active {accountType} organizations are eligible.</p> : null}
          {grant.isError ? <p role="alert" className="text-xs text-accent">{String(grant.error)}</p> : null}
          <div className="space-y-1">
            <p className="text-xs font-medium">Access grants ({mandates.length})</p>
            {mandates.length ? mandates.map((mandate) => (
              <p key={mandate.id} className="text-xs text-muted">
                {mandate.organization_name} · {mandate.grantee_account_type} · {mandate.grant_status}
                {mandate.expires_at ? ` · expires ${new Date(mandate.expires_at).toLocaleDateString()}` : ""}
                {mandate.grant_status === "ACTIVE" ? (
                  <button type="button" disabled={revoke.isPending} onClick={() => revoke.mutate(mandate.id)} className="ml-2 underline">
                    Revoke
                  </button>
                ) : null}
              </p>
            )) : <p className="text-xs text-muted">No organization introductions recorded.</p>}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium">Interest history ({interest.length})</p>
            {interest.length ? interest.slice(0, 6).map((event, index) => (
              <p key={`${event.actor_user_id}-${event.created_at}-${index}`} className="text-xs text-muted">
                {event.organization_name} · {event.account_type} · {event.interest_level} · {new Date(event.created_at).toLocaleDateString()}
              </p>
            )) : <p className="text-xs text-muted">No Buyer / Investor response recorded yet.</p>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <p className="text-xs text-muted">
              Readiness: {gate?.readiness_status ?? "Not reviewed"}
              {gate ? ` · ${gate.qualifying_interest_count} positive responses (${gate.buyer_interest_count} Buyer / ${gate.investor_interest_count} Investor)` : ""}
            </p>
            <Button
              size="sm"
              disabled={readiness.isPending || !hasCurrentPositiveInterest}
              onClick={() => readiness.mutate()}
            >
              {readiness.isPending ? "Reviewing…" : "Approve Production readiness"}
            </Button>
          </div>
          {readiness.isError ? <p role="alert" className="text-xs text-accent">{String(readiness.error)}</p> : null}
          {revoke.isError ? <p role="alert" className="text-xs text-accent">{String(revoke.error)}</p> : null}
          <p className="text-xs leading-5 text-muted">
            Readiness approval is not Production handoff. The Production project migration and linked Finished Film creation remain a separate release gate.
          </p>
        </>
      )}
    </div>
  );
}
