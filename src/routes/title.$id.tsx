import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusRail } from "@/components/bridge/status-rail";
import { Button } from "@/components/ui/button";
import { advanceTitle, getTitle, reverseTitle } from "@/lib/bridge/titles";
import { submitQcReview, saveTitleRights, authorizeDelivery, licenseTitleToLoop } from "@/lib/bridge/desks";
import { listTitleAssets, requestAssetUpload, requestAssetDownload } from "@/lib/bridge/assets";
import { nextStatus } from "@/lib/bridge/lifecycle";
import { hasPermission, permissionForTransition } from "@/lib/bridge/rbac";
import { TITLE_STATUSES, type AssetKind } from "@/lib/bridge/types";
import type { BridgeActor } from "@/lib/bridge/session";

export const Route = createFileRoute("/title/$id")({ component: TitlePage });

function TitlePage() {
  const { id } = Route.useParams();
  return (
    <RequireBridge>
      {(actor) => (
        <BridgeShell actor={actor} title="Title record">
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
  const canQc = title?.status === "QC_REVIEW" && hasPermission(actor, "title.qc_review");
  const canRights =
    (title?.status === "RIGHTS_REVIEW" || title?.status === "LICENSING_READY") &&
    hasPermission(actor, "title.rights_review");
  const canDeliver = title?.status === "LICENSED" && hasPermission(actor, "title.deliver");
  const canReverse = hasPermission(actor, "title.reverse");

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

  const blockers = titleQ.data?.blockers ?? [];
  const live = titleQ.data?.liveForBuyers;

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h2 className="font-display text-3xl">{title.name}</h2>
        {title.nameMl ? <p className="text-muted">{title.nameMl}</p> : null}
        <p className="text-sm text-muted">
          {title.language}
          {title.year ? ` · ${title.year}` : ""}
          {title.runtimeMinutes ? ` · ${title.runtimeMinutes} min` : ""}
          {title.licensingFeePaise > 0 ? ` · ₹${(title.licensingFeePaise / 100).toFixed(0)}` : ""}
        </p>
        {!live ? (
          <div className="rounded-sm border border-line-strong bg-surface px-4 py-3">
            <p className="font-medium">Not live for buyers</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </header>
      <StatusRail status={title.status} />
      {title.synopsis ? <p className="max-w-2xl text-sm leading-relaxed text-muted">{title.synopsis}</p> : null}

      <section>
        <h3 className="font-display text-xl">Overview</h3>
        {canAdvance ? (
          <Button className="mt-4" type="button" disabled={advance.isPending} onClick={() => advance.mutate()}>
            Advance to {nxt?.replaceAll("_", " ")}
          </Button>
        ) : nxt === "LICENSED" ? (
          <p className="mt-3 text-sm text-muted">Licensed is granted only after a captured Razorpay payment.</p>
        ) : null}
      </section>

      <section>
        <h3 className="font-display text-xl">Private assets</h3>
        <p className="mt-2 text-sm text-muted">
          Masters stay in this desk. They are never a public Loop URL.
        </p>
        {canUpload ? <UploadPanel titleId={title.id} /> : null}
        <ul className="mt-3 space-y-2 text-sm">
          {(assetsQ.data?.assets ?? []).length ? (
            (assetsQ.data?.assets ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line px-3 py-2">
                <span className="font-mono text-xs">
                  {a.kind} · {a.id.slice(0, 8)}
                </span>
                {hasPermission(actor, "asset.sign_download") ? (
                  <SignedOpen assetId={a.id} />
                ) : null}
              </li>
            ))
          ) : (
            <li className="text-muted">No private objects yet.</li>
          )}
        </ul>
      </section>

      <section>
        <h3 className="font-display text-xl">QC</h3>
        {canQc ? <QcForm titleId={title.id} /> : null}
        <ul className="mt-3 space-y-2 text-sm text-muted">
          {(titleQ.data?.qc ?? []).length ? (
            (titleQ.data?.qc ?? []).map((r) => (
              <li key={r.createdAt} className="rounded-sm border border-line px-3 py-2">
                {r.decision} · {r.notes || "no note"}
              </li>
            ))
          ) : (
            <li>No QC reviews yet.</li>
          )}
        </ul>
      </section>

      <section>
        <h3 className="font-display text-xl">Rights</h3>
        {canRights ? <RightsForm titleId={title.id} /> : null}
        {titleQ.data?.rights ? (
          <p className="mt-3 text-sm text-muted">
            {titleQ.data.rights.territories} · {titleQ.data.rights.rightsType} · {titleQ.data.rights.mediaType} · chain{" "}
            {titleQ.data.rights.chainOfTitleStatus}
            {titleQ.data.rights.approvedAt ? " · approved" : " · not approved"}
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted">No rights record yet.</p>
        )}
      </section>

      {canDeliver ? (
        <section>
          <h3 className="font-display text-xl">License to Loop</h3>
          <p className="mt-2 text-sm text-muted">
            CRAYONS LOOP is the public storefront. This desk licenses a captured title to Loop.
            The S3 object stays private. Ingest unset = blocked, not fake success.
          </p>
          <LoopLicenseForm titleId={title.id} />
          <p className="mt-6 text-sm text-muted">Buyer package (signed GET), not a public master:</p>
          <DeliveryForm titleId={title.id} />
        </section>
      ) : null}

      {canReverse ? (
        <section>
          <h3 className="font-display text-xl">Administrative reverse</h3>
          <p className="mt-2 text-sm text-muted">
            Exceptional only. Requires a written reason and an immutable audit row. Cannot mint LICENSED.
          </p>
          <ReverseForm titleId={title.id} />
        </section>
      ) : null}

      <section>
        <h3 className="font-display text-xl">Audit</h3>
        <ol className="mt-3 space-y-2 font-mono text-xs text-muted">
          {(titleQ.data?.events ?? []).map((e, i) => (
            <li key={`${e.createdAt}-${i}`}>
              {e.createdAt} · {e.from ?? "—"} → {e.to}
              {e.note ? ` · ${e.note}` : ""}
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
    <label className="mt-3 block rounded-sm border border-dashed border-line-strong p-4 text-sm">
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

function QcForm({ titleId }: { titleId: string }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  const [picture, setPicture] = useState(false);
  const [sound, setSound] = useState(false);
  const [text, setText] = useState(false);
  const mut = useMutation({
    mutationFn: (decision: "pass" | "fail" | "request_changes") =>
      submitQcReview({ data: { titleId, decision, notes, picture, sound, text } }),
    onSuccess: () => {
      toast("QC recorded");
      void qc.invalidateQueries({ queryKey: ["bridge-title", titleId] });
    },
    onError: (err) => toast(err instanceof Error ? err.message : "QC failed"),
  });
  return (
    <div className="mt-4 space-y-3 rounded-sm border border-line bg-surface p-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={picture} onChange={(e) => setPicture(e.target.checked)} />
        Picture
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
        Sound
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={text} onChange={(e) => setText(e.target.checked)} />
        Text / subs
      </label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder="Reason (required for fail / changes)"
        className="w-full rounded-sm border border-line-strong bg-elevated px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={mut.isPending} onClick={() => mut.mutate("pass")}>
          Pass
        </Button>
        <Button type="button" variant="outline" disabled={mut.isPending} onClick={() => mut.mutate("fail")}>
          Fail
        </Button>
        <Button type="button" variant="outline" disabled={mut.isPending} onClick={() => mut.mutate("request_changes")}>
          Request changes
        </Button>
      </div>
    </div>
  );
}

function RightsForm({ titleId }: { titleId: string }) {
  const qc = useQueryClient();
  const [territories, setTerritories] = useState("");
  const [rightsType, setRightsType] = useState("");
  const [mediaType, setMediaType] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [chain, setChain] = useState<"unverified" | "partial" | "verified">("unverified");
  const [exclusive, setExclusive] = useState(false);
  const mut = useMutation({
    mutationFn: (approve: boolean) =>
      saveTitleRights({
        data: {
          titleId,
          territories,
          rightsType,
          mediaType,
          exclusive,
          chainOfTitleStatus: chain,
          evidenceNote,
          approve,
        },
      }),
    onSuccess: () => {
      toast("Rights record saved");
      void qc.invalidateQueries({ queryKey: ["bridge-title", titleId] });
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Rights save failed"),
  });
  return (
    <form
      className="mt-4 grid gap-3 rounded-sm border border-line bg-surface p-4 sm:grid-cols-2"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        mut.mutate(false);
      }}
    >
      <label className="text-sm">
        Territories
        <input
          required
          value={territories}
          onChange={(e) => setTerritories(e.target.value)}
          className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3"
        />
      </label>
      <label className="text-sm">
        Rights type
        <input
          required
          value={rightsType}
          onChange={(e) => setRightsType(e.target.value)}
          className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3"
        />
      </label>
      <label className="text-sm">
        Media type
        <input
          required
          value={mediaType}
          onChange={(e) => setMediaType(e.target.value)}
          className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3"
        />
      </label>
      <label className="text-sm">
        Chain of title
        <select
          value={chain}
          onChange={(e) => setChain(e.target.value as "unverified" | "partial" | "verified")}
          className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3"
        >
          <option value="unverified">unverified</option>
          <option value="partial">partial</option>
          <option value="verified">verified</option>
        </select>
      </label>
      <label className="text-sm sm:col-span-2">
        Evidence
        <textarea
          required
          minLength={8}
          value={evidenceNote}
          onChange={(e) => setEvidenceNote(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-sm border border-line-strong bg-elevated px-3 py-2"
        />
      </label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} />
        Exclusive
      </label>
      <Button type="submit" variant="outline" disabled={mut.isPending}>
        Save record
      </Button>
      <Button type="button" disabled={mut.isPending} onClick={() => mut.mutate(true)}>
        Approve rights
      </Button>
    </form>
  );
}

function SignedOpen({ assetId }: { assetId: string }) {
  const mut = useMutation({
    mutationFn: () => requestAssetDownload({ data: { assetId } }),
    onSuccess: (signed) => {
      window.open(signed.url, "_blank", "noopener,noreferrer");
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Signed GET denied"),
  });
  return (
    <Button type="button" variant="outline" disabled={mut.isPending} onClick={() => mut.mutate()}>
      Signed GET
    </Button>
  );
}

function LoopLicenseForm({ titleId }: { titleId: string }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => licenseTitleToLoop({ data: { titleId } }),
    onSuccess: () => {
      toast("Loop ingest accepted");
      void qc.invalidateQueries({ queryKey: ["bridge-title", titleId] });
      void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Loop license blocked"),
  });
  return (
    <div className="mt-4">
      <Button type="button" disabled={mut.isPending} onClick={() => mut.mutate()}>
        License to Loop
      </Button>
    </div>
  );
}

function DeliveryForm({ titleId }: { titleId: string }) {
  const qc = useQueryClient();
  const [recipient, setRecipient] = useState("");
  const mut = useMutation({
    mutationFn: () => authorizeDelivery({ data: { titleId, recipientUserId: recipient } }),
    onSuccess: () => {
      toast("Delivery authorized");
      void qc.invalidateQueries({ queryKey: ["bridge-title", titleId] });
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Delivery denied"),
  });
  return (
    <form
      className="mt-4 flex flex-wrap gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate();
      }}
    >
      <input
        required
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        placeholder="Recipient user id"
        className="h-11 min-w-56 flex-1 rounded-sm border border-line-strong bg-elevated px-3"
      />
      <Button type="submit" disabled={mut.isPending}>
        Authorize delivery
      </Button>
    </form>
  );
}

function ReverseForm({ titleId }: { titleId: string }) {
  const qc = useQueryClient();
  const [to, setTo] = useState<(typeof TITLE_STATUSES)[number]>("DRAFT");
  const [reason, setReason] = useState("");
  const mut = useMutation({
    mutationFn: () => reverseTitle({ data: { id: titleId, to, reason } }),
    onSuccess: () => {
      toast("Reverse recorded");
      void qc.invalidateQueries({ queryKey: ["bridge-title", titleId] });
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Reverse denied"),
  });
  return (
    <form
      className="mt-4 grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate();
      }}
    >
      <label className="text-sm">
        Target status
        <select
          value={to}
          onChange={(e) => setTo(e.target.value as (typeof TITLE_STATUSES)[number])}
          className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3"
        >
          {TITLE_STATUSES.filter((s) => s !== "LICENSED").map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm sm:col-span-2">
        Reason
        <textarea
          required
          minLength={12}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-sm border border-line-strong bg-elevated px-3 py-2"
        />
      </label>
      <Button type="submit" variant="outline" disabled={mut.isPending}>
        Record reverse
      </Button>
    </form>
  );
}
