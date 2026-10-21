import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getQcPrerequisites, proceedToQc } from "@/lib/bridge/qc-workflow";
import type { BridgeActor } from "@/lib/bridge/session";

export function ProceedToQcModal({
  titleId,
  titleName,
  actor: _actor,
  onClose,
  onSuccess,
}: {
  titleId: string;
  titleName: string;
  actor: BridgeActor;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const prereqQ = useQuery({
    queryKey: ["qc-prerequisites", titleId],
    queryFn: () => getQcPrerequisites({ data: { titleId } }),
  });

  const proceedMutation = useMutation({
    mutationFn: () => proceedToQc({ data: { titleId, note } }),
    onSuccess: (_data) => {
      void Promise.all([
        qc.invalidateQueries({ queryKey: ["bridge-title", titleId] }),
        qc.invalidateQueries({ queryKey: ["title-workflow", titleId] }),
        qc.invalidateQueries({ queryKey: ["bridge-titles"] }),
        qc.invalidateQueries({ queryKey: ["admin-workstations"] }),
      ]);
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to proceed to QC.");
    },
  });

  const prereqs = prereqQ.data;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="proceed-qc-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">
              Quality Control Gate
            </p>
            <h2 id="proceed-qc-title" className="mt-1 font-display text-xl font-semibold text-fg">
              Proceed to QC · {titleName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-muted hover:bg-elevated hover:text-fg"
          >
            ✕
          </button>
        </div>

        {prereqQ.isPending ? (
          <div className="py-8 text-center text-sm text-muted">
            Evaluating metadata, master file, and artwork prerequisites…
          </div>
        ) : prereqQ.isError ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            Failed to evaluate prerequisites: {prereqQ.error.message}
          </div>
        ) : prereqs ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-line bg-elevated/40 p-4 text-sm">
              <p className="font-medium text-fg">Prerequisites Verification</p>
              <div className="mt-2 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span>Metadata completeness (Name, Synopsis, Language, Type):</span>
                  <span className={prereqs.metadata.hasName && prereqs.metadata.hasSynopsis ? "text-green-400" : "text-amber-400"}>
                    {prereqs.metadata.hasName && prereqs.metadata.hasSynopsis ? "✓ Complete" : "⚠️ Missing fields"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Verified Master Video (S3 asset):</span>
                  <span className={prereqs.assets.hasMaster ? "text-green-400" : "text-red-400 font-medium"}>
                    {prereqs.assets.hasMaster ? "✓ Verified" : "✗ Missing"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Verified Vertical Poster Artwork:</span>
                  <span className={prereqs.assets.hasPoster ? "text-green-400" : "text-red-400 font-medium"}>
                    {prereqs.assets.hasPoster ? "✓ Verified" : "✗ Missing"}
                  </span>
                </div>
              </div>
            </div>

            {prereqs.blockers.length > 0 ? (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-xs text-red-300">
                <p className="font-semibold text-red-200">Submission Blocked ({prereqs.blockers.length} issues):</p>
                <ul className="mt-1.5 list-disc pl-4 space-y-1">
                  {prereqs.blockers.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-xs text-green-300">
                ✓ All quality prerequisites passed. This title is ready for technical QC review.
              </div>
            )}

            <label className="block text-xs font-medium text-muted">
              Submission note / instructions for technical reviewer (optional):
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Verified 4K master ProRes with 5.1 surround sound."
                rows={2}
                className="mt-1 w-full rounded-lg border border-line bg-elevated p-2 text-sm text-fg placeholder:text-muted/60"
              />
            </label>

            {actionError ? (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-400">
                {actionError}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-line px-4 py-2 text-xs font-semibold text-muted hover:text-fg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!prereqs.canProceed || proceedMutation.isPending}
                onClick={() => proceedMutation.mutate()}
                className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                {proceedMutation.isPending ? "Submitting to QC…" : "Confirm & Proceed to QC"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
