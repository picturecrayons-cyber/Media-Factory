import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reconcileProductionAssets } from "@/lib/bridge/asset-reconciliation";

type Totals = {
  batches: number;
  legacyAssetsLinked: number;
  existingAssetsVerified: number;
  assetVersionsRegistered: number;
  missingInOci: number;
  failed: number;
  mappingBlockedRows: number;
  mappingMismatchRows: number;
  queueHasMore: boolean;
  assetsHaveMore: boolean;
  unmatchedLegacyRows: number;
  errors: string[];
};

const initialTotals: Totals = {
  batches: 0,
  legacyAssetsLinked: 0,
  existingAssetsVerified: 0,
  assetVersionsRegistered: 0,
  missingInOci: 0,
  failed: 0,
  mappingBlockedRows: 0,
  mappingMismatchRows: 0,
  queueHasMore: true,
  assetsHaveMore: true,
  unmatchedLegacyRows: 0,
  errors: [],
};

export function ProductionAssetReconciliationPanel() {
  const queryClient = useQueryClient();
  const [queueAfterId, setQueueAfterId] = useState("0");
  const [assetAfterId, setAssetAfterId] = useState("");
  const [totals, setTotals] = useState<Totals>(initialTotals);
  const [autoRun, setAutoRun] = useState(false);

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      reconcileProductionAssets({
        data: { limit: 1, queueAfterId, assetAfterId },
      }),
    onSuccess: (result) => {
      setQueueAfterId(String(result.nextQueueAfterId));
      setAssetAfterId(result.nextAssetAfterId);
      setTotals((current) => ({
        batches: current.batches + 1,
        legacyAssetsLinked: current.legacyAssetsLinked + result.legacyAssetsLinked,
        existingAssetsVerified: current.existingAssetsVerified + result.existingAssetsVerified,
        assetVersionsRegistered: current.assetVersionsRegistered + result.assetVersionsRegistered,
        missingInOci: current.missingInOci + result.missingInOci,
        failed: current.failed + result.failed,
        mappingBlockedRows: result.mappingBlockedRows,
        mappingMismatchRows: result.mappingMismatchRows,
        queueHasMore: result.queueHasMore,
        assetsHaveMore: result.assetsHaveMore,
        unmatchedLegacyRows: result.unmatchedLegacyRows,
        errors: [...current.errors, ...result.errors].slice(-4),
      }));
      void queryClient.invalidateQueries({ queryKey: ["bridge-titles"] });
      void queryClient.invalidateQueries({ queryKey: ["bridge-audit"] });

      if (result.failed > 0) {
        setAutoRun(false);
        toast.error(`Reconciliation paused after ${result.failed} item(s) failed. Review the error details before retrying.`);
        return;
      }

      if (!result.queueHasMore && !result.assetsHaveMore) {
        setAutoRun(false);
        toast.success("Production asset reconciliation pass complete");
      }
    },
    onError: (error) => {
      setAutoRun(false);
      toast.error(error instanceof Error ? error.message : "Asset reconciliation failed");
    },
  });

  useEffect(() => {
    if (autoRun && !isPending) mutate();
  }, [autoRun, isPending, queueAfterId, assetAfterId, mutate]);

  const hasMore = totals.queueHasMore || totals.assetsHaveMore;
  const hasRun = totals.batches > 0;

  function restart() {
    setAutoRun(false);
    setQueueAfterId("0");
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
          Check existing OCI migration targets and unverified title assets. A storage version is
          registered only after OCI size/ETag checks and an immutable copy check.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        <div className="rounded-xl border border-line bg-elevated/40 p-3">
          <p className="text-xs text-muted">Legacy assets linked</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{totals.legacyAssetsLinked}</p>
        </div>
        <div className="rounded-xl border border-line bg-elevated/40 p-3">
          <p className="text-xs text-muted">Existing assets verified</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{totals.existingAssetsVerified}</p>
        </div>
        <div className="rounded-xl border border-line bg-elevated/40 p-3">
          <p className="text-xs text-muted">Asset versions registered</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{totals.assetVersionsRegistered}</p>
        </div>
        <div className="rounded-xl border border-line bg-elevated/40 p-3">
          <p className="text-xs text-muted">Not found in OCI</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{totals.missingInOci}</p>
        </div>
        <div className="rounded-xl border border-line bg-elevated/40 p-3">
          <p className="text-xs text-muted">Held for verified mapping</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{totals.mappingBlockedRows}</p>
        </div>
        <div className="rounded-xl border border-line bg-elevated/40 p-3">
          <p className="text-xs text-muted">Title mapping conflicts</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{totals.mappingMismatchRows}</p>
        </div>
        <div className="rounded-xl border border-line bg-elevated/40 p-3">
          <p className="text-xs text-muted">Errors</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-fg">{totals.failed}</p>
        </div>
      </div>

      {totals.mappingBlockedRows > 0 || totals.mappingMismatchRows > 0 ? (
        <p className="text-xs text-amber-400" role="status">
          {totals.mappingBlockedRows} legacy asset rows are held until their exact legacy film-to-Bridge title mapping is verified.
          {totals.mappingMismatchRows > 0
            ? ` ${totals.mappingMismatchRows} rows currently point to a different suggested Bridge title and require manual reconciliation.`
            : ""}
          No held row will be linked automatically.
        </p>
      ) : null}
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
          disabled={isPending || autoRun || (!hasMore && hasRun)}
          onClick={() => setAutoRun(true)}
          className="rounded-full px-5 text-xs font-semibold"
        >
          {isPending || autoRun
            ? "Reconciliation running…"
            : hasRun && hasMore
              ? "Continue reconciliation"
              : hasRun
                ? "Reconciliation pass complete"
                : "Start reconciliation"}
        </Button>
        {autoRun ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setAutoRun(false)}
            className="rounded-full border-line text-xs"
          >
            Pause
          </Button>
        ) : null}
        {hasRun ? (
          <Button
            type="button"
            variant="outline"
            disabled={isPending || autoRun}
            onClick={restart}
            className="rounded-full border-line text-xs"
          >
            Restart scan
          </Button>
        ) : null}
        <span className="text-xs text-muted">
          {hasRun
            ? `${totals.batches} objects checked · ${hasMore ? "eligible records remain" : "current eligible records scanned"}`
            : "Runs in one-object requests. Keep this page open until the pass finishes."}
        </span>
      </div>

      <p className="text-xs text-muted">
        SHA-256 verification and technical QC remain separate gates; registered versions are marked
        PROCESSING with checksum pending until DIT verification is completed. Legacy assets are
        eligible only after the matching films_film link is reviewer-verified. This action does not
        change QC, legal, rights, publication, payments, or title lifecycle status.
      </p>
    </section>
  );
}
