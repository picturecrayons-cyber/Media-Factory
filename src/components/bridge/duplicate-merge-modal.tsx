import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { previewDuplicateTitleMerge, mergeDuplicateTitle, rollbackDuplicateTitleMerge } from "@/lib/bridge/duplicate-title-merge";

export function DuplicateMergeModal({
  canonicalId: initialCanonicalId = "",
  retiringId: initialRetiringId = "",
  isOpen,
  onClose,
  onMerged,
}: {
  canonicalId?: string;
  retiringId?: string;
  isOpen: boolean;
  onClose: () => void;
  onMerged?: () => void;
}) {
  const qc = useQueryClient();
  const [canonicalId, setCanonicalId] = useState(initialCanonicalId);
  const [retiringId, setRetiringId] = useState(initialRetiringId);
  const [confirmed, setConfirmed] = useState(false);
  const [mergeResult, setMergeResult] = useState<{ ok: boolean; mergeId: string } | null>(null);
  const [rollbackId, setRollbackId] = useState("");
  const [rollbackSuccess, setRollbackSuccess] = useState<string | null>(null);

  const previewMut = useMutation({
    mutationFn: () => previewDuplicateTitleMerge({ data: { canonicalTitleId: canonicalId.trim(), retiringTitleId: retiringId.trim() } }),
    onError: () => setConfirmed(false),
  });

  const mergeMut = useMutation({
    mutationFn: () =>
      mergeDuplicateTitle({
        data: {
          canonicalTitleId: canonicalId.trim(),
          retiringTitleId: retiringId.trim(),
          expectedDecision: "SAFE",
        },
      }),
    onSuccess: (res) => {
      setMergeResult(res);
      void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
      void qc.invalidateQueries({ queryKey: ["admin-workstations"] });
      if (onMerged) onMerged();
    },
  });

  const rollbackMut = useMutation({
    mutationFn: (idToRollback: string) => rollbackDuplicateTitleMerge({ data: { mergeId: idToRollback.trim() } }),
    onSuccess: (res) => {
      setRollbackSuccess(res.restoredTitleId);
      void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
    },
  });

  if (!isOpen) return null;

  const previewData = previewMut.data;
  const canonical = previewData?.preview?.canonical;
  const retiring = previewData?.preview?.retiring;
  const decision = previewData?.decision;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm overflow-y-auto"
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl border border-line bg-surface p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <h2 id="merge-modal-title" className="font-display text-2xl font-bold">
              Duplicate Title Deduplication & Safe Merge
            </h2>
            <p className="mt-1 text-xs text-muted">
              Inspect candidates, verify reference integrity, and execute transactional merges with rollback protection.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onClose}>
            ✕
          </Button>
        </div>

        {/* Inputs */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-semibold">
            Proposed Canonical Title ID (Record to Keep)
            <input
              type="text"
              value={canonicalId}
              onChange={(e) => {
                setCanonicalId(e.target.value);
                setConfirmed(false);
              }}
              placeholder="e.g. cb8c141dc72d727a53a4f35d8851e100"
              className="mt-1 h-10 w-full rounded-xl border border-line bg-elevated px-3 font-mono text-xs"
            />
          </label>
          <label className="block text-xs font-semibold">
            Duplicate Candidate ID (Record to Retire & Alias)
            <input
              type="text"
              value={retiringId}
              onChange={(e) => {
                setRetiringId(e.target.value);
                setConfirmed(false);
              }}
              placeholder="e.g. 6eec48a7c576789ede558e66ba18b929 or legacy-film-7"
              className="mt-1 h-10 w-full rounded-xl border border-line bg-elevated px-3 font-mono text-xs"
            />
          </label>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!canonicalId.trim() || !retiringId.trim() || previewMut.isPending}
            onClick={() => previewMut.mutate()}
          >
            {previewMut.isPending ? "Evaluating Dry-Run…" : "Run Dry-Run Merge Evaluation →"}
          </Button>
          {canonicalId && retiringId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const temp = canonicalId;
                setCanonicalId(retiringId);
                setRetiringId(temp);
                setConfirmed(false);
              }}
            >
              ⇄ Swap Roles
            </Button>
          )}
        </div>

        {previewMut.isError ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">
            <p className="font-semibold">Dry-run evaluation failed:</p>
            <p className="mt-1">{previewMut.error instanceof Error ? previewMut.error.message : "Error"}</p>
          </div>
        ) : null}

        {/* Dry Run Preview Results */}
        {previewData && canonical && retiring ? (
          <div className="space-y-4 rounded-2xl border border-line bg-elevated/40 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Dry-Run Reconciliation Assessment</h3>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                  decision === "SAFE"
                    ? "bg-green-500/20 text-green-300 border border-green-500/30"
                    : decision === "HOLD"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-red-500/20 text-red-300 border border-red-500/30"
                }`}
              >
                Decision: {decision}
              </span>
            </div>

            {decision === "BLOCK" && previewData.reasons.includes("BUYER_VISIBILITY_CONFLICT") ? (
              <div className="rounded-xl border border-red-500/40 bg-red-500/15 p-4 text-xs text-red-200">
                <p className="font-bold uppercase tracking-wide text-red-400">
                  🛡️ Protected Record: Merge Blocked
                </p>
                <p className="mt-1">
                  Candidate record <span className="font-mono">{retiring.title?.id}</span> is currently{" "}
                  <strong>LIVE FOR BUYERS</strong>. Merging it into canonical record{" "}
                  <span className="font-mono">{canonical.title?.id}</span> (Status: {canonical.title?.status}) would
                  destroy buyer visibility or cause distribution conflicts. This record is protected and must remain
                  independent.
                </p>
              </div>
            ) : null}

            {previewData.reasons.length > 0 && !previewData.reasons.includes("BUYER_VISIBILITY_CONFLICT") ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <p className="font-semibold text-amber-400">Detected Blockers / Conflicts:</p>
                <ul className="mt-1 list-disc pl-4 space-y-0.5">
                  {previewData.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Side-by-side comparison */}
            <div className="grid gap-4 sm:grid-cols-2 text-xs">
              {/* Canonical Column */}
              <div className="rounded-xl border border-line bg-surface p-4 space-y-2">
                <p className="font-bold text-accent uppercase tracking-wider text-[10px]">
                  Canonical (Preserved)
                </p>
                <p className="font-semibold text-base">{canonical.title?.name}</p>
                <p className="text-muted">ID: <span className="font-mono">{canonical.title?.id}</span></p>
                <p>Status: <span className="font-semibold">{canonical.title?.status}</span></p>
                <p>Language: {canonical.title?.language} · Year: {canonical.title?.year ?? "—"}</p>
                <div className="border-t border-line pt-2 text-muted space-y-1">
                  <p>Base Assets: {canonical.assets?.length ?? 0}</p>
                  <p>Rights Grants: {canonical.rights?.length ?? 0}</p>
                  <p>Buyer Access: {canonical.buyers?.length ?? 0}</p>
                  <p>Loop Publications: {canonical.publications?.length ?? 0}</p>
                </div>
              </div>

              {/* Retiring Column */}
              <div className="rounded-xl border border-line bg-surface p-4 space-y-2">
                <p className="font-bold text-muted uppercase tracking-wider text-[10px]">
                  Retiring (Aliased & Soft-Archived)
                </p>
                <p className="font-semibold text-base">{retiring.title?.name}</p>
                <p className="text-muted">ID: <span className="font-mono">{retiring.title?.id}</span></p>
                <p>Status: <span className="font-semibold">{retiring.title?.status}</span></p>
                <p>Language: {retiring.title?.language} · Year: {retiring.title?.year ?? "—"}</p>
                <div className="border-t border-line pt-2 text-muted space-y-1">
                  <p>Base Assets: {retiring.assets?.length ?? 0}</p>
                  <p>Rights Grants: {retiring.rights?.length ?? 0}</p>
                  <p>Buyer Access: {retiring.buyers?.length ?? 0}</p>
                  <p>Loop Publications: {retiring.publications?.length ?? 0}</p>
                </div>
              </div>
            </div>

            {/* Merge execution trigger */}
            {decision === "SAFE" ? (
              <div className="border-t border-line pt-4 space-y-3">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="h-4 w-4 rounded border-line"
                  />
                  <span>
                    I confirm that I have reviewed the dry-run plan. All assets and relationships of{" "}
                    <span className="font-mono font-semibold">{retiringId}</span> will be safely repointed to{" "}
                    <span className="font-mono font-semibold">{canonicalId}</span>, and the retiring ID will be
                    preserved as an alias.
                  </span>
                </label>
                <Button
                  size="sm"
                  disabled={!confirmed || mergeMut.isPending}
                  onClick={() => mergeMut.mutate()}
                >
                  {mergeMut.isPending ? "Executing Merge…" : "Execute Safe Merge Transaction →"}
                </Button>
              </div>
            ) : null}

            {mergeMut.isError ? (
              <p className="text-xs text-red-400">
                Merge failed: {mergeMut.error instanceof Error ? mergeMut.error.message : "Error"}
              </p>
            ) : null}

            {mergeResult ? (
              <div className="rounded-xl border border-green-500/40 bg-green-500/15 p-4 text-xs text-green-200">
                <p className="font-bold text-green-300">✅ Merge Executed Successfully</p>
                <p className="mt-1">
                  Merge ID: <span className="font-mono">{mergeResult.mergeId}</span>
                </p>
                <p className="text-[11px] text-green-300/80 mt-1">
                  Retiring record was soft-archived and aliased. All linked assets and history remain preserved under
                  canonical title <span className="font-mono">{canonicalId}</span>.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Rollback Section */}
        <details className="rounded-2xl border border-line bg-surface p-4 text-xs">
          <summary className="cursor-pointer font-semibold text-muted hover:text-fg">
            Rollback a Previous Merge
          </summary>
          <div className="mt-3 space-y-2">
            <p className="text-muted leading-relaxed">
              If a merge needs to be reverted, enter the Merge ID from the audit record to restore original references
              and remove the alias.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={rollbackId}
                onChange={(e) => setRollbackId(e.target.value)}
                placeholder="Merge UUID"
                className="h-9 w-full max-w-sm rounded-lg border border-line bg-elevated px-3 font-mono text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!rollbackId.trim() || rollbackMut.isPending}
                onClick={() => rollbackMut.mutate(rollbackId)}
              >
                {rollbackMut.isPending ? "Rolling back…" : "Rollback Merge"}
              </Button>
            </div>
            {rollbackSuccess ? (
              <p className="text-green-400 mt-1">
                ✅ Merge rolled back. Restored title: <span className="font-mono">{rollbackSuccess}</span>
              </p>
            ) : null}
            {rollbackMut.isError ? (
              <p className="text-red-400 mt-1">
                Rollback failed: {rollbackMut.error instanceof Error ? rollbackMut.error.message : "Error"}
              </p>
            ) : null}
          </div>
        </details>
      </div>
    </div>
  );
}
