import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  listPendingStoryConcepts,
  updateStoryConceptCuration,
} from "@/lib/bridge/story-concept-api";
import type { CurationStatus } from "@/lib/bridge/story-concept";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  INTRODUCED_TO_BUYERS: "Introduced to buyers",
};

function statusLabel(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ").toLowerCase() : "Not available";
}

export function StoryConceptDesk() {
  const qc = useQueryClient();
  const [internalNotes, setInternalNotes] = useState<Record<string, string>>({});
  const query = useQuery({
    queryKey: ["admin-story-concepts"],
    queryFn: () => listPendingStoryConcepts(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const update = useMutation({
    mutationFn: (input: {
      id: string;
      status?: CurationStatus;
      adminNotes?: string;
    }) => updateStoryConceptCuration({ data: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-story-concepts"] });
    },
  });

  if (query.isLoading) {
    return <p className="text-sm text-muted">Loading Original IP / Story submissions…</p>;
  }

  if (query.isError) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-sm">
        Original IP records could not be loaded. No empty or zero state is assumed.
      </div>
    );
  }

  const concepts = query.data?.concepts ?? [];

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display text-2xl font-semibold">Original IP & Story Development</h3>
        <p className="mt-1 text-sm text-muted">
          Live records from the existing Story / Concept system. Author identity is read from the linked Bridge Creator / Studio profile. These submissions are not finished films and do not enter film licensing or Loop publication.
        </p>
      </div>

      {!concepts.length ? (
        <div className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted">
          No active Original IP / Story submissions were returned.
        </div>
      ) : (
        <div className="space-y-3">
          {concepts.map((c) => {
            const noteValue = internalNotes[c.id] ?? c.admin_notes ?? "";
            const noteChanged = noteValue !== (c.admin_notes ?? "");
            const canReview = ["PENDING", "UNDER_REVIEW"].includes(c.curation_status);
            const rightsVerified = Boolean(
              c.rights_declaration_accepted_at &&
              c.rights_holder_name?.trim() &&
              c.rights_basis &&
              c.third_party_materials_included !== null &&
              c.third_party_materials_included !== undefined
            );
            return (
              <article key={c.id} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.titleName || "Untitled story submission"}</p>
                    <p className="mt-1 text-xs text-muted">
                      {STATUS_LABEL[c.curation_status] ?? c.curation_status}
                      {c.created_at ? ` · ${new Date(c.created_at).toLocaleDateString()}` : ""}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      Submission ID: <span className="font-mono">{c.id}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Linked Title ID: <span className="font-mono">{c.title_id}</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-line px-3 py-2 text-xs text-muted">
                    {c.ownerAccountType ? c.ownerAccountType.replaceAll("_", " ") : "Account type unavailable"}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-bg p-3">
                    <p className="text-xs uppercase tracking-wider text-muted">Author / Submitter</p>
                    <p className="mt-1 text-sm font-medium">{c.authorName || "Author profile not linked"}</p>
                    <p className="mt-1 text-xs text-muted">{c.authorOrganizationName || "No organization recorded"}</p>
                  </div>
                  <div className="rounded-lg bg-bg p-3">
                    <p className="text-xs uppercase tracking-wider text-muted">Review status</p>
                    <p className="mt-1 text-sm">Editorial: <strong>{statusLabel(c.editorial_status)}</strong></p>
                    <p className="mt-1 text-sm">Legal: <strong>{statusLabel(c.legal_status)}</strong></p>
                    <p className="mt-1 text-sm">Curation: <strong>{statusLabel(c.curation_status)}</strong></p>
                  </div>
                </div>

                {c.logline ? <p className="mt-3 text-sm leading-relaxed">{c.logline}</p> : null}
                {c.genre?.length ? <p className="mt-2 text-xs text-muted">Genres: {c.genre.join(" · ")}</p> : null}

                <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
                  <p>Rights holder: {c.rights_holder_name || "Not recorded"}</p>
                  <p>Rights basis: {c.rights_basis || "Not declared"}</p>
                  <p>Third-party materials: {c.third_party_materials_included === true ? "Declared" : c.third_party_materials_included === false ? "None declared" : "Not recorded"}</p>
                  <p>Rights declaration: {rightsVerified ? "Verified" : c.rights_declaration_accepted_at ? "Incomplete" : "Not verified"}</p>
                </div>

                {c.editorial_review_notes ? (
                  <p className="mt-3 rounded-lg border border-line p-3 text-xs text-muted">
                    Editorial review note: {c.editorial_review_notes}
                  </p>
                ) : null}
                {c.legal_review_notes ? (
                  <p className="mt-2 rounded-lg border border-line p-3 text-xs text-muted">
                    Legal review note: {c.legal_review_notes}
                  </p>
                ) : null}

                <label className="mt-4 block space-y-1 text-xs text-muted">
                  Internal Founder / Admin note
                  <textarea
                    value={noteValue}
                    onChange={(event) => setInternalNotes((current) => ({ ...current, [c.id]: event.target.value }))}
                    maxLength={2000}
                    rows={2}
                    placeholder="Optional internal note…"
                    className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-fg"
                  />
                </label>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={update.isPending || !noteChanged}
                    onClick={() => update.mutate({ id: c.id, adminNotes: noteValue })}
                  >
                    Save internal note
                  </Button>
                  {c.curation_status === "PENDING" ? (
                    <Button
                      size="sm"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ id: c.id, status: "UNDER_REVIEW" })}
                    >
                      Start review
                    </Button>
                  ) : null}
                  {canReview ? (
                    <>
                      <Button
                        size="sm"
                        disabled={update.isPending || !rightsVerified}
                        onClick={() => update.mutate({ id: c.id, status: "APPROVED", adminNotes: noteValue.trim() || undefined })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ id: c.id, status: "REJECTED", adminNotes: noteValue.trim() || undefined })}
                      >
                        Reject
                      </Button>
                    </>
                  ) : null}
                  {!rightsVerified && canReview ? (
                    <p className="self-center text-xs text-accent">
                      Approval locked: rights declaration is not verified.
                    </p>
                  ) : null}
                  {c.curation_status === "APPROVED" && !c.fee_certified_at ? (
                    <p className="self-center text-xs text-muted">
                      Buyer / investor evaluation remains locked until fee certification is verified.
                    </p>
                  ) : null}
                </div>

                {update.isError ? (
                  <p role="alert" className="mt-3 text-xs text-accent">{String(update.error)}</p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
