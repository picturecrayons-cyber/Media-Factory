import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { decideLegacyLinkReview, listLegacyLinkReviews } from "@/lib/bridge/legacy-link-review";

const LEGACY_SOURCE_TABLES = [
  "films_film",
  "films_filmdraft",
  "films_filmbuyermapping",
  "films_status",
  "films_viewhistory",
] as const;

type LegacySourceTable = (typeof LEGACY_SOURCE_TABLES)[number];

type DecisionInput =
  | {
      sourceTable: LegacySourceTable;
      legacyId: string;
      decision: "verify";
      bridgeTitleId: string;
      evidenceNote: string;
    }
  | {
      sourceTable: LegacySourceTable;
      legacyId: string;
      decision: "reject";
      evidenceNote: string;
    };

function isLegacySourceTable(value: string): value is LegacySourceTable {
  return (LEGACY_SOURCE_TABLES as readonly string[]).includes(value);
}

function rowKey(sourceTable: LegacySourceTable, legacyId: string) {
  return `${sourceTable}:${legacyId}`;
}

export function LegacyLinkReviewPanel() {
  const queryClient = useQueryClient();
  const [selectedTitles, setSelectedTitles] = useState<Record<string, string>>({});
  const [evidenceNotes, setEvidenceNotes] = useState<Record<string, string>>({});

  const reviewQuery = useQuery({
    queryKey: ["legacy-link-reviews"],
    queryFn: () => listLegacyLinkReviews(),
  });

  const decisionMutation = useMutation({
    mutationFn: (input: DecisionInput) =>
      decideLegacyLinkReview({ data: input }),
    onSuccess: (result) => {
      toast.success(
        result.decision === "verify"
          ? "Legacy mapping verified. Asset reconciliation may now consider this mapping."
          : "Legacy mapping rejected. Its suggested target remains inactive.",
      );
      void queryClient.invalidateQueries({ queryKey: ["legacy-link-reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["bridge-audit"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Legacy mapping review failed");
    },
  });

  if (reviewQuery.isPending) {
    return <p className="text-sm text-muted">Loading unresolved legacy mappings…</p>;
  }
  if (reviewQuery.isError) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-display text-xl font-semibold">Legacy Mapping Review</h2>
        <p role="alert" className="mt-2 text-sm text-muted">
          The review queue is unavailable. No mapping was changed.
        </p>
        <Button type="button" variant="outline" onClick={() => void reviewQuery.refetch()}>
          Retry
        </Button>
      </section>
    );
  }

  const result = reviewQuery.data;
  const rows = result.rows;
  const pendingCount = result.counts.reduce((sum, item) => sum + Number(item.count), 0);

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Super Admin · Legacy identity control
        </p>
        <h2 className="font-display text-2xl font-semibold text-fg">Legacy Mapping Review</h2>
        <p className="max-w-3xl text-sm text-muted">
          Review imported source IDs and their suggested Bridge title. A suggestion is not an
          approval. Verify only when the source evidence establishes the exact title identity.
          Every decision requires a written evidence note and is recorded in the audit ledger.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-elevated/40 p-3">
          <p className="text-xs text-muted">Pending unresolved mappings</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">{pendingCount}</p>
        </div>
        <div className="rounded-xl border border-line bg-elevated/40 p-3">
          <p className="text-xs text-muted">Rows shown</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">{rows.length}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {result.counts.map((item) => (
          <span key={item.source_table} className="rounded-full border border-line px-3 py-1 text-xs text-muted">
            {item.source_table.replaceAll("_", " ")} · {item.count}
          </span>
        ))}
      </div>

      {pendingCount === 0 ? (
        <p className="rounded-xl border border-line p-4 text-sm text-muted">
          No unresolved legacy mapping records remain in the current review queue.
        </p>
      ) : null}

      <div className="space-y-3">
        {rows.map((row) => {
          if (!isLegacySourceTable(row.sourceTable)) return null;
          const sourceTable = row.sourceTable;
          const key = rowKey(sourceTable, row.legacyId);
          const selectedTitleId = selectedTitles[key] ?? "";
          const note = evidenceNotes[key] ?? "";
          const hasEvidence = note.trim().length >= 20;
          const canVerify = Boolean(selectedTitleId) && hasEvidence && !decisionMutation.isPending;
          const canReject = hasEvidence && !decisionMutation.isPending;

          return (
            <article key={key} className="space-y-3 rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">{row.sourceTable}</p>
                  <h3 className="mt-1 font-semibold text-fg">Legacy ID: {row.legacyId}</h3>
                </div>
                <span className="rounded-full border border-amber-500/30 px-2.5 py-1 text-[11px] font-semibold text-amber-400">
                  UNRESOLVED · NOT APPROVED
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg bg-elevated/40 p-3">
                  <p className="text-xs text-muted">Imported candidate suggestion</p>
                  {row.candidateBridgeTitleId ? (
                    <>
                      <p className="mt-1 font-semibold text-fg">{row.candidateTitleName ?? "Unknown title"}</p>
                      <p className="mt-1 break-all font-mono text-[11px] text-muted">{row.candidateBridgeTitleId}</p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-muted">No suggested Bridge title</p>
                  )}
                  {row.candidateOrderId ? (
                    <p className="mt-1 break-all text-[11px] text-muted">Suggested order: {row.candidateOrderId}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-medium text-muted" htmlFor={`legacy-title-${key}`}>
                    Confirmed Bridge title
                  </label>
                  <select
                    id={`legacy-title-${key}`}
                    value={selectedTitleId}
                    onChange={(event) =>
                      setSelectedTitles((current) => ({ ...current, [key]: event.target.value }))
                    }
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg"
                  >
                    <option value="">Select only after checking source evidence</option>
                    {result.targets.map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.name} · {target.status} · {target.id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-muted" htmlFor={`legacy-evidence-${key}`}>
                  Evidence note (minimum 20 characters)
                </label>
                <textarea
                  id={`legacy-evidence-${key}`}
                  value={note}
                  onChange={(event) =>
                    setEvidenceNotes((current) => ({ ...current, [key]: event.target.value }))
                  }
                  rows={2}
                  maxLength={2000}
                  placeholder="Record the source document, legacy export, creator confirmation, or other evidence used to establish this exact identity."
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={!canVerify}
                  onClick={() =>
                    decisionMutation.mutate({
                      sourceTable,
                      legacyId: row.legacyId,
                      decision: "verify",
                      bridgeTitleId: selectedTitleId,
                      evidenceNote: note.trim(),
                    })
                  }
                >
                  Verify selected mapping
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canReject}
                  onClick={() =>
                    decisionMutation.mutate({
                      sourceTable,
                      legacyId: row.legacyId,
                      decision: "reject",
                      evidenceNote: note.trim(),
                    })
                  }
                >
                  Reject suggestion
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      <p className="text-xs text-muted">
        Verification changes only the legacy source-to-title reference. It does not approve QC,
        legal clearance, rights, asset integrity, playback, payment, or Loop publication.
      </p>
    </section>
  );
}
