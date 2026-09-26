import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusRail } from "@/components/bridge/status-rail";
import { Button } from "@/components/ui/button";
import { advanceTitle, getTitle } from "@/lib/bridge/titles";
import { listTitleAssets, requestAssetUpload } from "@/lib/bridge/assets";
import { nextStatus } from "@/lib/bridge/lifecycle";
import { hasPermission, permissionForTransition } from "@/lib/bridge/rbac";
import type { AssetKind } from "@/lib/bridge/types";
import type { BridgeActor } from "@/lib/bridge/session";

export const Route = createFileRoute("/title/$id")({ component: TitlePage });

const workspace = ["Overview", "Files", "Metadata", "QC", "Rights", "Licensing", "Delivery", "Team", "Billing"] as const;

function TitlePage() {
  const { id } = Route.useParams();
  return (
    <RequireBridge>
      {(actor) => (
        <BridgeShell actor={actor} title="Title workspace">
          <TitleBody id={id} actor={actor} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function TitleBody({ id, actor }: { id: string; actor: BridgeActor }) {
  const qc = useQueryClient();
  const titleQ = useQuery({ queryKey: ["bridge-title", id], queryFn: () => getTitle({ data: { id } }) });
  const assetsQ = useQuery({ queryKey: ["bridge-assets", id], queryFn: () => listTitleAssets({ data: { titleId: id } }) });
  const title = titleQ.data?.title;
  const nxt = title ? nextStatus(title.status) : null;
  const perm = title && nxt ? permissionForTransition(title.status, nxt) : null;
  const canAdvance = Boolean(title && nxt && nxt !== "LICENSED" && perm && hasPermission(actor, perm));
  const canUpload = Boolean(title && hasPermission(actor, "asset.sign_upload") && (title.ownerUserId === actor.userId || actor.internalRole) && ["DRAFT", "UPLOADING", "PREPARING"].includes(title.status));

  const advance = useMutation({
    mutationFn: () => {
      if (!title || !nxt) throw new Error("No forward step");
      return advanceTitle({ data: { id: title.id, to: nxt } });
    },
    onSuccess: () => {
      toast("Lifecycle advanced");
      void qc.invalidateQueries({ queryKey: ["bridge-title", id] });
      void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Advance failed"),
  });

  if (titleQ.isPending) return <p className="text-sm text-muted">Loading title…</p>;
  if (!title) return <p className="text-sm text-muted">Title not found.</p>;
  const assets = assetsQ.data?.assets ?? [];

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border bg-card p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Crayons Bridge title record</p>
        <div className="mt-2 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-display text-3xl md:text-4xl">{title.name}</h2>
            {title.nameMl ? <p className="mt-1 text-muted">{title.nameMl}</p> : null}
            <p className="mt-3 text-sm text-muted">{title.language}{title.year ? ` · ${title.year}` : ""}{title.runtimeMinutes ? ` · ${title.runtimeMinutes} min` : ""}</p>
          </div>
          <div className="rounded-2xl border border-border px-4 py-3 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted">Commercial record</p>
            <p className="mt-1 font-semibold">{title.licensingFeePaise > 0 ? `₹${(title.licensingFeePaise / 100).toFixed(0)} licensing fee` : "No verified fee recorded"}</p>
          </div>
        </div>
        <div className="mt-6"><StatusRail status={title.status} /></div>
      </section>

      <nav aria-label="Title workspace" className="flex gap-2 overflow-x-auto pb-2">
        {workspace.map((item, index) => <span key={item} className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold ${index === 0 ? "border-foreground bg-foreground text-background" : "border-border bg-card"}`}>{item}</span>)}
      </nav>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <WorkspaceCard title="Files" value={`${assets.length} private object${assets.length === 1 ? "" : "s"}`} detail="Masters and supporting assets remain private until an authorized delivery." />
        <WorkspaceCard title="QC" value={title.status === "QC_REVIEW" ? "In review" : "Lifecycle controlled"} detail="No technical capability claim is shown without validated media evidence." />
        <WorkspaceCard title="Rights" value={title.status === "RIGHTS_REVIEW" ? "In review" : "Bridge controlled"} detail="Ownership, territory, language and window authority stays in Bridge." />
        <WorkspaceCard title="Delivery" value={title.status === "DELIVERED" ? "Delivered" : "Not delivered"} detail="Buyer or LOOP delivery requires explicit authorization and lifecycle eligibility." />
      </section>

      {title.synopsis ? <section className="rounded-2xl border border-border bg-card p-5"><h3 className="font-display text-xl">Overview</h3><p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">{title.synopsis}</p></section> : null}

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div><h3 className="font-display text-xl">Lifecycle control</h3><p className="mt-1 text-sm text-muted">Upload → QC → Rights → Licensing → Delivery. Server permissions decide who can advance the record.</p></div>
          {canAdvance ? <Button type="button" disabled={advance.isPending} onClick={() => advance.mutate()}>Advance to {nxt?.replaceAll("_", " ")}</Button> : nxt === "LICENSED" ? <p className="text-sm text-muted">Licensed is granted only after a captured Razorpay payment.</p> : null}
        </div>
      </section>

      {canUpload ? <UploadPanel titleId={title.id} /> : null}

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-display text-xl">Files</h3>
        <ul className="mt-3 space-y-2 text-sm">{assets.length ? assets.map((a) => <li key={a.id} className="rounded-xl border border-border px-3 py-3 font-mono text-xs">{a.kind} · {a.id}</li>) : <li className="text-muted">No private objects yet.</li>}</ul>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-display text-xl">Updates</h3>
        <ol className="mt-3 space-y-2 font-mono text-xs text-muted">{(titleQ.data?.events ?? []).map((e, i) => <li key={`${e.createdAt}-${i}`}>{e.createdAt} · {e.from ?? "—"} → {e.to}</li>)}</ol>
      </section>
    </div>
  );
}

function WorkspaceCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return <article className="rounded-2xl border border-border bg-card p-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{title}</p><p className="mt-2 font-display text-xl">{value}</p><p className="mt-2 text-xs leading-relaxed text-muted">{detail}</p></article>;
}

function UploadPanel({ titleId }: { titleId: string }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async (file: File) => {
      const kind: AssetKind = file.type.startsWith("image/") ? "poster" : "master";
      const signed = await requestAssetUpload({ data: { titleId, kind, filename: file.name, contentType: file.type || "application/octet-stream" } });
      const put = await fetch(signed.url, { method: signed.method, headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
      if (!put.ok) throw new Error("S3 upload failed");
    },
    onSuccess: () => { toast("Object stored"); void qc.invalidateQueries({ queryKey: ["bridge-assets", titleId] }); void qc.invalidateQueries({ queryKey: ["bridge-title", titleId] }); },
    onError: (err) => toast(err instanceof Error ? err.message : "Upload failed"),
  });
  return <label className="block rounded-2xl border border-dashed border-border bg-card p-5 text-sm"><span className="font-semibold">Upload private asset</span><span className="mt-1 block text-xs text-muted">Poster images and master video are signed directly to private S3 storage.</span><input type="file" className="mt-3 block w-full text-sm" onChange={(e) => { const file = e.target.files?.[0]; if (file) mut.mutate(file); }} /></label>;
}
