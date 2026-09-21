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

function TitlePage() {
  const { id } = Route.useParams();
  return (
    <RequireBridge>
      {(actor) => (
        <BridgeShell actor={actor} title="Title">
          <TitleBody id={id} actor={actor} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function TitleBody({ id, actor }: { id: string; actor: BridgeActor }) {
  const qc = useQueryClient();
  const titleQ = useQuery({ queryKey: ["bridge-title", id], queryFn: () => getTitle({ data: { id } }) });
  const assetsQ = useQuery({
    queryKey: ["bridge-assets", id],
    queryFn: () => listTitleAssets({ data: { titleId: id } }),
  });
  const title = titleQ.data?.title;
  const nxt = title ? nextStatus(title.status) : null;
  const perm = title && nxt ? permissionForTransition(title.status, nxt) : null;
  const canAdvance = Boolean(title && nxt && nxt !== "LICENSED" && perm && hasPermission(actor, perm));
  const canUpload =
    title &&
    hasPermission(actor, "asset.sign_upload") &&
    (title.ownerUserId === actor.userId || Boolean(actor.internalRole)) &&
    (title.status === "DRAFT" || title.status === "UPLOADING" || title.status === "PREPARING");

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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl">{title.name}</h2>
        {title.nameMl ? <p className="mt-1 text-muted">{title.nameMl}</p> : null}
        <p className="mt-2 text-sm text-muted">
          {title.language}
          {title.year ? ` · ${title.year}` : ""}
          {title.runtimeMinutes ? ` · ${title.runtimeMinutes} min` : ""}
          {title.licensingFeePaise > 0 ? ` · ₹${(title.licensingFeePaise / 100).toFixed(0)}` : ""}
        </p>
      </div>
      <StatusRail status={title.status} />
      {title.synopsis ? <p className="max-w-2xl text-sm leading-relaxed text-muted">{title.synopsis}</p> : null}
      {canAdvance ? (
        <Button type="button" disabled={advance.isPending} onClick={() => advance.mutate()}>
          Advance to {nxt?.replaceAll("_", " ")}
        </Button>
      ) : nxt === "LICENSED" ? (
        <p className="text-sm text-muted">Licensed is granted only after a captured Razorpay payment.</p>
      ) : null}
      {canUpload ? <UploadPanel titleId={title.id} /> : null}
      <section>
        <h3 className="font-display text-xl">Assets</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {(assetsQ.data?.assets ?? []).length ? (
            (assetsQ.data?.assets ?? []).map((a) => (
              <li key={a.id} className="rounded-sm border border-line px-3 py-2 font-mono text-xs">
                {a.kind} · {a.id}
              </li>
            ))
          ) : (
            <li className="text-muted">No private objects yet.</li>
          )}
        </ul>
      </section>
      <section>
        <h3 className="font-display text-xl">Events</h3>
        <ol className="mt-3 space-y-2 font-mono text-xs text-muted">
          {(titleQ.data?.events ?? []).map((e, i) => (
            <li key={`${e.createdAt}-${i}`}>
              {e.createdAt} · {e.from ?? "—"} → {e.to}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function UploadPanel({ titleId }: { titleId: string }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async (file: File) => {
      const kind: AssetKind = file.type.startsWith("image/") ? "poster" : "master";
      const signed = await requestAssetUpload({
        data: {
          titleId,
          kind,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
        },
      });
      const put = await fetch(signed.url, {
        method: signed.method,
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error("S3 upload failed");
    },
    onSuccess: () => {
      toast("Object stored");
      void qc.invalidateQueries({ queryKey: ["bridge-assets", titleId] });
      void qc.invalidateQueries({ queryKey: ["bridge-title", titleId] });
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Upload failed"),
  });
  return (
    <label className="block rounded-sm border border-dashed border-line-strong p-4 text-sm">
      Upload poster or master
      <input
        type="file"
        className="mt-2 block w-full text-sm"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) mut.mutate(file);
        }}
      />
    </label>
  );
}
