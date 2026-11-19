import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { confirmAssetUpload, listUnverifiedMasterAssets } from "@/lib/bridge/assets";

function describeError(error: unknown) {
  return error instanceof Error ? error.message : "The existing master could not be verified.";
}

/**
 * A compact Super Admin repair desk for old master records whose OCI object
 * was uploaded by another operator but never confirmed and linked to its title.
 */
export function MasterAssetReconciliation({ titleId }: { titleId: string }) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState("");

  const candidates = useQuery({
    queryKey: ["bridge-unverified-master-assets", titleId],
    queryFn: () => listUnverifiedMasterAssets({ data: { titleId } }),
    retry: false,
  });

  const verify = useMutation({
    mutationFn: (assetId: string) => confirmAssetUpload({ data: { assetId } }),
    onSuccess: async (result) => {
      setNotice(
        `Master verified (${(result.byteSize / (1024 * 1024)).toFixed(1)} MB) and linked to this Bridge title. QC and legal review remain separate.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bridge-unverified-master-assets", titleId] }),
        queryClient.invalidateQueries({ queryKey: ["bridge-title", titleId] }),
        queryClient.invalidateQueries({ queryKey: ["bridge-assets", titleId] }),
        queryClient.invalidateQueries({ queryKey: ["bridge-production-assets", titleId] }),
        queryClient.invalidateQueries({ queryKey: ["title-workflow", titleId] }),
      ]);
    },
  });

  if (candidates.isPending) return null;
  if (candidates.isError) {
    return (
      <section className="rounded-xl border border-amber-500/40 bg-surface p-4">
        <h2 className="font-semibold">Existing master reconciliation</h2>
        <p role="alert" className="mt-2 text-sm text-muted">
          Could not load pending master records. {describeError(candidates.error)}
        </p>
      </section>
    );
  }

  const rows = candidates.data?.candidates ?? [];
  if (!rows.length) return null;

  return (
    <section className="space-y-3 rounded-xl border border-amber-500/40 bg-surface p-4 sm:p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Super Admin · existing OCI objects</p>
        <h2 className="mt-1 font-display text-lg font-semibold">Unverified main-film masters ({rows.length})</h2>
        <p className="mt-1 text-sm text-muted">
          These files already have Bridge asset records under this title owner's OCI path, but have not completed storage verification.
          Select the confirmed full-length master. Bridge will check OCI, verify its ETag and create the immutable verified copy before linking it.
        </p>
      </div>

      <div className="divide-y divide-line rounded-lg border border-line">
        {rows.map((candidate) => (
          <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="break-all text-sm font-medium">{candidate.fileName}</p>
              <p className="mt-1 text-xs text-muted">
                {candidate.contentType || "Content type not recorded"} · {new Date(candidate.createdAt).toLocaleString()}
                {candidate.uploadedByAnotherOperator ? " · Uploaded by another operator" : " · Uploaded by this Super Admin"}
              </p>
            </div>
            <button
              type="button"
              disabled={verify.isPending}
              onClick={() => {
                setNotice("");
                verify.mutate(candidate.id);
              }}
              className="inline-flex min-h-9 items-center justify-center rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {verify.isPending && verify.variables === candidate.id ? "Verifying OCI…" : "Verify & link master"}
            </button>
          </div>
        ))}
      </div>

      {verify.isError ? (
        <p role="alert" className="rounded-lg border border-red-500/30 p-3 text-sm text-red-600">
          Verification failed. The file was not linked as the master. {describeError(verify.error)}
        </p>
      ) : null}
      {notice ? <p role="status" className="rounded-lg border border-line p-3 text-sm">{notice}</p> : null}
      <p className="text-xs text-muted">
        This operation does not change title ownership, move the original object, submit QC, approve rights or publish to Loop.
      </p>
    </section>
  );
}
