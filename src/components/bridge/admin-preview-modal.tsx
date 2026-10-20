import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { getAdminTitlePreview, type AdminPreviewChecklist } from "@/lib/bridge/admin-preview";

export function AdminPreviewModal({
  titleId,
  isOpen,
  onClose,
  onProceedToQc,
}: {
  titleId: string;
  isOpen: boolean;
  onClose: () => void;
  onProceedToQc?: () => void;
}) {
  if (!isOpen) return null;

  const previewQ = useQuery({
    queryKey: ["admin-title-preview", titleId],
    queryFn: () => getAdminTitlePreview({ data: { titleId } }),
    enabled: isOpen,
  });

  const preview = previewQ.data;
  const checklist = preview?.checklist;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-preview-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm overflow-y-auto"
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl border border-line bg-surface p-6 sm:p-8 shadow-2xl">
        {/* Header Notice Banner */}
        <div className="mb-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
          <div className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wider text-amber-400">
            <span>🔒 Internal Admin Preview</span>
            <span className="rounded bg-amber-400/20 px-2 py-0.5 text-xs text-amber-300">
              Not Buyer Visible
            </span>
          </div>
          <p className="mt-1 text-xs text-amber-200/90 leading-relaxed">
            This preview inspects internal metadata, verified master video, and review readiness without altering
            buyer-facing availability, publishing to Crayons Loop, or modifying title state.
          </p>
        </div>

        {previewQ.isPending ? (
          <div className="py-16 text-center text-sm text-muted">Loading internal admin preview…</div>
        ) : previewQ.isError ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300">
            <p className="font-semibold">Unable to load admin preview</p>
            <p className="mt-1 text-xs">{previewQ.error instanceof Error ? previewQ.error.message : "Error"}</p>
            <Button size="sm" variant="outline" className="mt-4" onClick={() => void previewQ.refetch()}>
              Retry
            </Button>
          </div>
        ) : preview && checklist ? (
          <div className="space-y-6">
            {/* Title Header */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between border-b border-line pb-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
                  Title ID · {preview.title.id}
                </p>
                <h2 id="admin-preview-title" className="font-display text-2xl font-bold sm:text-3xl mt-1">
                  {preview.title.name}
                </h2>
                <p className="text-sm text-muted mt-1">
                  {preview.title.language} · {checklist.metadata.fields.contentType}
                  {preview.title.year ? ` · ${preview.title.year}` : ""}
                  {preview.title.runtimeMinutes ? ` · ${preview.title.runtimeMinutes} min` : ""}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className="rounded-full border border-line bg-elevated px-3 py-1 text-xs font-semibold">
                  Status: {preview.title.status}
                </span>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                    preview.buyerVisible
                      ? "bg-green-500/20 text-green-300 border border-green-500/30"
                      : "bg-muted/20 text-muted border border-line"
                  }`}
                >
                  {preview.buyerVisible ? "🟢 Buyer Visible" : "🔒 Internal Only"}
                </span>
              </div>
            </div>

            {/* Media & Metadata Grid */}
            <div className="grid gap-6 md:grid-cols-[200px_1fr]">
              {/* Poster Column */}
              <div className="space-y-3">
                <div className="aspect-[2/3] overflow-hidden rounded-xl border border-line bg-elevated flex items-center justify-center">
                  {preview.previewMedia.posterUrl ? (
                    <img
                      src={preview.previewMedia.posterUrl}
                      alt={preview.title.name}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="p-4 text-center text-xs text-muted">No verified poster</span>
                  )}
                </div>
                <div className="text-xs text-muted">
                  <p className="font-semibold text-fg">Verified Assets: {checklist.assets.present.length}</p>
                  <p className="text-[11px] truncate">
                    Master: {checklist.assets.present.includes("master") ? "✅ Uploaded" : "❌ Missing"}
                  </p>
                  <p className="text-[11px] truncate">
                    Artwork: {checklist.assets.present.includes("poster_vertical") || checklist.assets.present.includes("poster") ? "✅ Uploaded" : "❌ Missing"}
                  </p>
                </div>
              </div>

              {/* Details & Video Column */}
              <div className="space-y-4">
                {/* Video Player Preview */}
                {preview.previewMedia.videoPreviewUrl ? (
                  <div className="overflow-hidden rounded-xl border border-line bg-black">
                    <video
                      controls
                      playsInline
                      src={preview.previewMedia.videoPreviewUrl}
                      className="max-h-[260px] w-full"
                    >
                      <track kind="captions" />
                      Video preview is not supported in this browser.
                    </video>
                    <p className="bg-elevated px-3 py-1.5 text-[11px] text-muted">
                      Admin stream preview (presigned temporary token)
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">
                    No verified video stream available for preview.
                  </div>
                )}

                {/* Synopsis */}
                {checklist.metadata.fields.synopsis ? (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Synopsis</h3>
                    <p className="mt-1 text-sm leading-relaxed text-fg/90">
                      {checklist.metadata.fields.synopsis}
                    </p>
                  </div>
                ) : null}

                {/* Credits */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted">Director:</span>{" "}
                    <span className="font-medium text-fg">{checklist.metadata.fields.director ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted">Producer:</span>{" "}
                    <span className="font-medium text-fg">{checklist.metadata.fields.producer ?? "—"}</span>
                  </div>
                  {checklist.metadata.fields.cast.length > 0 ? (
                    <div className="col-span-2">
                      <span className="text-muted">Cast:</span>{" "}
                      <span className="font-medium text-fg">{checklist.metadata.fields.cast.join(", ")}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Verification Checklist */}
            <div className="rounded-2xl border border-line bg-elevated/40 p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-accent">
                Readiness & Verification Checklist
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                {/* Metadata */}
                <div className="rounded-xl border border-line p-3 bg-surface">
                  <p className="font-semibold text-fg">Metadata</p>
                  {checklist.metadata.ok ? (
                    <p className="mt-1 text-green-400">✅ Complete</p>
                  ) : (
                    <p className="mt-1 text-amber-400">
                      ⚠️ Missing: {checklist.metadata.missing.join(", ")}
                    </p>
                  )}
                </div>

                {/* Assets */}
                <div className="rounded-xl border border-line p-3 bg-surface">
                  <p className="font-semibold text-fg">Assets</p>
                  {checklist.assets.ok ? (
                    <p className="mt-1 text-green-400">✅ Core assets verified</p>
                  ) : (
                    <p className="mt-1 text-amber-400">
                      ⚠️ Missing: {checklist.assets.missing.join(", ")}
                    </p>
                  )}
                </div>

                {/* Rights */}
                <div className="rounded-xl border border-line p-3 bg-surface">
                  <p className="font-semibold text-fg">Rights Status</p>
                  <p className={`mt-1 font-medium ${checklist.rights.ok ? "text-green-400" : "text-amber-400"}`}>
                    {checklist.rights.ok ? "✅ Grant Active" : "⚠️ " + checklist.rights.status}
                  </p>
                  <p className="text-[11px] text-muted">{checklist.rights.grantsCount} grant(s) recorded</p>
                </div>

                {/* QC Blockers */}
                <div className="rounded-xl border border-line p-3 bg-surface">
                  <p className="font-semibold text-fg">QC Status</p>
                  <p className={`mt-1 font-medium ${checklist.qc.ok ? "text-green-400" : "text-amber-400"}`}>
                    {checklist.qc.ok ? "✅ QC Passed" : "⚠️ " + checklist.qc.status}
                  </p>
                  {checklist.qc.blockers.length > 0 ? (
                    <p className="text-[11px] text-muted truncate">{checklist.qc.blockers[0]}</p>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <span className="text-xs text-muted">
                Actor Role: {preview.actorRole?.replaceAll("_", " ")} · Session Protected
              </span>
              <div className="flex gap-2">
                {preview.title.status === "PREPARING" && onProceedToQc ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      onClose();
                      onProceedToQc();
                    }}
                  >
                    Proceed to QC →
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" onClick={onClose}>
                  Close Preview
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
