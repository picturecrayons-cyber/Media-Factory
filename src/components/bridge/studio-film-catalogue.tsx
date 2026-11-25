import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AssetPosterSlot } from "@/components/bridge/asset-preview-gallery";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/bridge/status-rail";
import { listTitleAssets } from "@/lib/bridge/assets";
import { getTitleWorkflow } from "@/lib/bridge/workflow";
import { requestSuperAdminReview } from "@/lib/bridge/submissions";
import type { BridgeTitle } from "@/lib/bridge/types";

function GateLine({ label, value }: { label: string; value: string }) {
  return <p className="text-xs text-muted"><span className="font-semibold text-fg">{label}:</span> {value}</p>;
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString();
}

export function StudioFilmCatalogue({ titles }: { titles: BridgeTitle[] }) {
  if (!titles.length) {
    return <p className="mt-2 rounded-lg border border-dashed border-line p-5 text-sm text-muted">No finished-film titles are currently returned for this Studio account.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {titles.map((title) => <StudioFilmCard key={title.id} title={title} />)}
    </div>
  );
}

function RequestSuperAdminReview({ title }: { title: BridgeTitle }) {
  const mutation = useMutation({
    mutationFn: () => requestSuperAdminReview({ data: { titleId: title.id } }),
  });
  if (title.name.startsWith("[TEST ONLY]")) {
    return <span className="text-[11px] text-muted">Test fixture — cannot be submitted</span>;
  }
  const result = mutation.data;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={mutation.isPending || Boolean(result)}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Submitting…" : result?.alreadySubmitted ? "Already submitted" : result?.submitted ? "Sent to Super Admin" : "Submit to Super Admin"}
      </Button>
      {mutation.error ? <p role="alert" className="w-full text-xs text-red-600">{mutation.error.message}</p> : null}
      {result?.submitted ? <p className="w-full text-xs text-muted">Review requested. QC, rights and Legal remain pending until independently approved.</p> : null}
      {result?.alreadySubmitted ? <p className="w-full text-xs text-muted">This title is already in the Super Admin intake queue.</p> : null}
    </div>
  );
}

function StudioFilmCard({ title }: { title: BridgeTitle }) {
  const assetsQ = useQuery({
    queryKey: ["bridge-assets", title.id, "studio-catalogue"],
    queryFn: () => listTitleAssets({ data: { titleId: title.id } }),
    staleTime: 30_000,
    retry: 1,
  });
  const workflowQ = useQuery({
    queryKey: ["title-workflow", title.id, "studio-catalogue"],
    queryFn: () => getTitleWorkflow({ data: { titleId: title.id } }),
    staleTime: 30_000,
    retry: 1,
  });
  const assets = assetsQ.data?.assets ?? [];
  const credits = title.credits ?? [];
  const crew = credits.filter((credit) => credit.role.toLowerCase() !== "cast").slice(0, 2);
  const cast = credits.filter((credit) => credit.role.toLowerCase() === "cast").slice(0, 3);
  const workflow = workflowQ.data;
  const latestGrant = workflow?.grants[0];
  const approvedGrant = workflow?.grants.find((grant) => grant.status === "VALID");
  const approvedTerms = approvedGrant?.evidence?.[0]?.commercialTerms;
  const hasTrailer = assets.some((asset) => asset.kind === "screener");
  const hasTechnicalPackage = assets.some((asset) => asset.kind === "technical");
  const hasSubtitle = assets.some((asset) => asset.kind === "subtitle");
  const qcStatus = workflow?.qc?.status ?? "PENDING";
  const legalStatus = workflow?.legal?.status ?? "PENDING";
  const rightsStatus = approvedGrant && legalStatus === "APPROVED" ? "APPROVED" : latestGrant?.status ?? "NOT SUBMITTED";
  const deliveryStatus = workflow?.buyerGates.delivery ? "READY" : "NOT CERTIFIED";

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 p-3">
        <AssetPosterSlot assets={assets} />
        <div className="min-w-0 py-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{title.contentType || "Film"}</span>
            <StatusChip status={title.status} />
          </div>
          <Link to="/title/$id" params={{ id: title.id }} className="mt-2 block font-display text-base font-semibold leading-snug hover:text-accent">
            {title.name}
          </Link>
          <p className="mt-1 text-xs text-muted">{[title.language, title.year, title.runtimeMinutes ? `${title.runtimeMinutes} min` : null].filter(Boolean).join(" · ")}</p>
          {assetsQ.isError ? <p className="mt-2 text-[11px] text-muted">Artwork and media status unavailable</p> : null}
          {assetsQ.isPending ? <p className="mt-2 text-[11px] text-muted">Checking available assets…</p> : null}
        </div>
      </div>
      <div className="border-t border-line px-4 py-3">
        {title.synopsis ? <p className="line-clamp-3 text-sm leading-relaxed text-muted">{title.synopsis}</p> : <p className="text-xs text-muted">Synopsis not provided.</p>}
        {crew.length || cast.length ? (
          <div className="mt-3 space-y-1 text-xs text-muted">
            {crew.map((credit) => <p key={`${credit.role}:${credit.name}`}><span className="font-semibold text-fg">{credit.role}:</span> {credit.name}</p>)}
            {cast.length ? <p><span className="font-semibold text-fg">Cast:</span> {cast.map((credit) => credit.name).join(", ")}</p> : null}
          </div>
        ) : <p className="mt-3 text-xs text-muted">Credits not provided.</p>}
        <div className="mt-3 grid gap-1.5 border-t border-line pt-3 sm:grid-cols-2">
          <GateLine label="QC" value={workflowQ.isError ? "STATUS UNAVAILABLE" : qcStatus} />
          <GateLine label="Rights" value={workflowQ.isError ? "STATUS UNAVAILABLE" : rightsStatus} />
          <GateLine label="Legal" value={workflowQ.isError ? "STATUS UNAVAILABLE" : legalStatus} />
          <GateLine label="Delivery" value={workflowQ.isError ? "STATUS UNAVAILABLE" : deliveryStatus} />
        </div>
        {workflowQ.isPending ? <p className="mt-2 text-xs text-muted">Loading approval and delivery gates…</p> : null}
        {approvedGrant && legalStatus === "APPROVED" ? (
          <div className="mt-3 space-y-1 rounded-lg bg-elevated/40 p-3">
            <p className="text-xs font-semibold text-fg">Approved rights terms</p>
            <GateLine label="Territories" value={approvedGrant.territories?.join(", ") || "Not specified"} />
            <GateLine label="Languages" value={approvedGrant.languages?.join(", ") || "Not specified"} />
            <GateLine label="Model" value={approvedGrant.exclusivity || "Not specified"} />
            <GateLine label="Window" value={`${dateLabel(approvedGrant.window_start)} – ${dateLabel(approvedGrant.window_end)}`} />
            {approvedTerms ? <GateLine label="Revenue split" value={`Rights owner ${approvedTerms.rightsOwnerSharePct}% · Distributor ${approvedTerms.distributorSharePct}%`} /> : null}
          </div>
        ) : <p className="mt-2 text-xs text-muted">No approved rights package available.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-md border border-line px-2 py-1 text-[11px] text-muted">{hasTrailer ? "Trailer / screener uploaded" : "No trailer / screener recorded"}</span>
          <span className="rounded-md border border-line px-2 py-1 text-[11px] text-muted">{hasTechnicalPackage ? "Technical package uploaded" : "No technical package recorded"}</span>
          <span className="rounded-md border border-line px-2 py-1 text-[11px] text-muted">{hasSubtitle ? "Subtitle asset uploaded" : "No subtitle asset recorded"}</span>
        </div>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          <GateLine label="Genre" value="Not captured in the current title record" />
          <GateLine label="Technical certification" value="Not independently certified from asset presence" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-elevated/40 px-4 py-3">
        <p className="text-[11px] text-muted">Private Studio record · Not a public listing</p>
        <div className="flex flex-wrap items-center gap-3">
          <RequestSuperAdminReview title={title} />
          <Link to="/title/$id" params={{ id: title.id }} className="text-xs font-semibold text-accent hover:underline">Manage title →</Link>
        </div>
      </div>
    </article>
  );
}
