import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { archiveTitle } from "@/lib/bridge/title-actions";
import { useNavigate } from "@tanstack/react-router";

export function ArchiveTitleModal({
  titleId,
  titleName,
  currentStatus,
  onClose,
}: {
  titleId: string;
  titleName: string;
  currentStatus: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirmInput, setConfirmInput] = useState("");
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const archiveMutation = useMutation({
    mutationFn: () =>
      archiveTitle({
        data: {
          titleId,
          confirmText: confirmInput.trim() as "ARCHIVE",
          reason: reason.trim() || undefined,
        },
      }),
    onSuccess: () => {
      void Promise.all([
        qc.invalidateQueries({ queryKey: ["bridge-titles"] }),
        qc.invalidateQueries({ queryKey: ["bridge-title", titleId] }),
        qc.invalidateQueries({ queryKey: ["admin-workstations"] }),
      ]);
      onClose();
      void navigate({ to: "/workspace" });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to archive title.");
    },
  });

  const isProtectedLive = ["LIVE_FOR_BUYERS", "LICENSED", "DELIVERED"].includes(currentStatus);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-title-heading"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-red-400">
              Administrative Safeguard
            </p>
            <h2 id="archive-title-heading" className="mt-1 font-display text-xl font-semibold text-fg">
              Archive Title · {titleName}
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

        {isProtectedLive ? (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-xs text-red-300">
            <p className="font-semibold text-red-200">Archival Prohibited on Protected Record</p>
            <p className="mt-1">
              This title is currently <span className="font-bold underline">{currentStatus}</span>. Titles with live buyer visibility, active distribution windows, or commercial dependencies cannot be deleted or archived.
            </p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-line px-4 py-2 text-xs font-semibold text-fg hover:bg-elevated"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-xs leading-relaxed text-muted">
              Archival performs a safe <span className="font-semibold text-fg">soft-archival</span>. Linked S3 assets, QC cases, rights grants, and audit events are strictly preserved.
            </p>

            <label className="block text-xs font-medium text-muted">
              Reason for archival:
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Duplicate draft superseded by canonical record"
                className="mt-1 w-full rounded-lg border border-line bg-elevated p-2 text-sm text-fg"
              />
            </label>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              <p>
                To confirm archival, type <span className="font-mono font-bold text-fg">ARCHIVE</span> below:
              </p>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="ARCHIVE"
                className="mt-2 w-full rounded-lg border border-amber-500/40 bg-surface p-2 font-mono text-sm uppercase text-fg"
              />
            </div>

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
                disabled={confirmInput.trim() !== "ARCHIVE" || archiveMutation.isPending}
                onClick={() => archiveMutation.mutate()}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-30"
              >
                {archiveMutation.isPending ? "Archiving…" : "Confirm Archival"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
