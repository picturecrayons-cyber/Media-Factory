import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reconcileProductionAssets } from "@/lib/bridge/asset-reconciliation";

type Totals = {
  batches: number;
  legacyAssetsLinked: number;
  existingAssetsVerified: number;
  missingInOci: number;
  failed: number;
  queueHasMore: boolean;
  assetsHaveMore: boolean;
  unmatchedLegacyRows: number;
  errors: string[];
};

const initialTotals: Totals = {
  batches: 0,
  legacyAssetsLinked: 0,
  existingAssetsVerified: 0,
  missingInOci: 0,
  failed: 0,
  queueHasMore: true,
  assetsHaveMore: true,
  unmatchedLegacyRows: 0,
  errors: [],
};

export function ProductionAssetReconciliationPanel() {
  const queryClient = useQueryClient();
  const [queueAfterId, setQueueAfterId] = useState(0);
  const [assetAfterId, setAssetAfterId] = useState("");
  const [totals, setTotals] = useState<Totals>(initialTotals);

  const mutation = useMutation({
    mutationFn: () =>
      reconcileProductionAssets({
        data: { limit: 5, queueAfterId, assetAfterId },
      }),
    onSuccess: (result) => {
      setQueueAfterId(result.nextQueueAfterId);
      setAssetAfterId(result.nextAssetAfterId);
      setTotals((current) => ({
        batches: current.batches + 1,
        legacyAssetsLinked: current.legacyAssetsLinked + result.legacyAssetsLinked,
        existingAssetsVerified: current.existingAssetsVerified + result.existingAssetsVerified,
        missingInOci: current.missingInOci + result.missingInOci,
        failed: current.failed + result.failed,
        queueHasMore: result.queueHasMore,
        assetsHaveMore: result.assetsHaveMore,
        unmatchedLegacyRows: result.unmatchedLegacyRows,
        errors: [...current.errors, ...result.errors].slice(-4),
      }));
      void queryClient.invalidateQueries({ queryKey: ["bridge-titles"] });
      void queryClient.invalidateQueries({ queryKey: ["bridge-audit"] });
      toast.success(
        `Batch complete: ${result.legacyAssetsLinked + result.existingAssetsVerified} assets verified and linked`,
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Asset reconciliation failed");
    },
  });

  const hasMore = totals.queueHasMore || totals.assetsHaveMore;
  const hasRun = totals.batches > 0;

  function restart() {
    setQueueAfterId(0);
    setAssetAfterId("");
    setTotals(initialTotals);
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 space-y-4">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Super Admin · Production storage
        </p>
        <h2 className="font-display text-2xl font-semibold text-fg">
          Production Asset Reconciliation
        </h2>
        <p className="text-sm text-muted">
          Check existing OCI migration targets and unverified title assets. A file is linked only
          after OCI size and ETag verification and an immutable copy check.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-elevated/40 p-3">
          <p className="text-xs text-muted">Legacy assets linked</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{totals.legacyAssetsLinked}</p>
        </div>
        <div className="rounded-xl border border-line bg-elevated/40 p-3">
          <p className="text-xs text-muted">Existing assets verified</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{totals.existingAssetsVerified}</p>
        </div>
        <div className="rounded-xl border border-line bg-elevated/40 p-3">
          <p className="text-xs text-muted">Not found in OCI</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{totals.missingInOci}</p>
        </div>
        <div className="rounded-xl border border-line bg-elevated/40 p-3">
          <p className="text-xs text-muted">Errors</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{totals.failed}</p>
        </div>
      </div>

      {totals.unmatchedLegacyRows > 0 ? (
        <p className="text-xs text-amber-400">
          {totals.unmatchedLegacyRows} legacy migration records have no matching Bridge title ID.
          They are excluded from automatic linking.
        </p>
      ) : null}

      {totals.errors.length > 0 ? (
        <ul className="space-y-1 text-xs text-red-400" role="alert">
          {totals.errors.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={mutation.isPending || (!hasMore && hasRun)}
          onClick={() => mutation.mutate()}
          className="rounded-full px-5 text-xs font-semibold"
        >
          {mutation.isPending
            ? "Verifying OCI assets…"
            : hasRun && hasMore
              ? "Continue reconciliation"
              : hasRun
                ? "Reconciliation batch complete"
                : "Start reconciliation"}
        </Button>
        {hasRun ? (
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={restart}
            className="rounded-full border-line text-xs"
          >
            Restart scan
          </Button>
        ) : null}
        <span className="text-xs text-muted">
          {hasRun
            ? `${totals.batches} batches completed · ${hasMore ? "more records remain" : "current eligible records scanned"}`
            : "Runs in small batches to avoid long production requests"}
        </span>
      </div>

      <p className="text-xs text-muted">
        AWS-only source references without a verified OCI target remain pending. This action does
        not change QC, legal, rights, publication, payments, or title lifecycle status.
      </p>
    </section>
  );
}
