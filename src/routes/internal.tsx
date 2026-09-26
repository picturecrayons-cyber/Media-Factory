import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusChip } from "@/components/bridge/status-rail";
import { Button } from "@/components/ui/button";
import { inviteInternalRole } from "@/lib/bridge/profiles";
import { listAuditLogs, listTitles } from "@/lib/bridge/titles";
import { authorizeLoopPublication, listLoopPublicationReadiness, revokeLoopPublication } from "@/lib/bridge/loop-publication";
import { INTERNAL_ROLES } from "@/lib/bridge/types";
import { hasPermission } from "@/lib/bridge/rbac";

export const Route = createFileRoute("/internal")({ component: Internal });

function Internal() {
  return (
    <RequireBridge allow="internal">
      {(actor) => (
        <BridgeShell actor={actor} title="Bridge Command Center">
          <p className="mb-6 text-sm text-muted">
            {actor.internalRole?.replaceAll("_", " ")} · {actor.email}
          </p>
          <InternalBody
            canInvite={hasPermission(actor, "users.invite_internal")}
            canPublish={hasPermission(actor, "loop.publish")}
            canRevoke={hasPermission(actor, "loop.revoke")}
          />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function InternalBody({ canInvite, canPublish, canRevoke }: { canInvite: boolean; canPublish: boolean; canRevoke: boolean }) {
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const logsQ = useQuery({ queryKey: ["bridge-audit"], queryFn: () => listAuditLogs() });
  const titles = titlesQ.data?.titles ?? [];
  return (
    <div className="grid gap-10">
      <LoopPublicationDesk canPublish={canPublish} canRevoke={canRevoke} />
      {canInvite ? <InviteForm /> : null}
      <section>
        <h2 className="font-display text-2xl">Titles</h2>
        <ul className="mt-4 divide-y divide-line rounded-sm border border-line">
          {titles.length ? titles.map((t) => (
            <li key={t.id}>
              <Link to="/title/$id" params={{ id: t.id }} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-fg/5">
                <span>{t.name}</span><StatusChip status={t.status} />
              </Link>
            </li>
          )) : <li className="px-4 py-6 text-sm text-muted">No titles in the pipeline.</li>}
        </ul>
      </section>
      <section>
        <h2 className="font-display text-2xl">Audit</h2>
        <ul className="mt-4 space-y-2 font-mono text-xs text-muted">
          {(logsQ.data?.logs ?? []).map((l) => <li key={l.id} className="rounded-sm border border-line px-3 py-2">{l.createdAt} · {l.action} · {l.entityType} · {l.entityId}</li>)}
        </ul>
      </section>
    </div>
  );
}

function LoopPublicationDesk({ canPublish, canRevoke }: { canPublish: boolean; canRevoke: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["loop-publication-readiness"], queryFn: () => listLoopPublicationReadiness() });
  const [territories, setTerritories] = useState("IN");
  const [languages, setLanguages] = useState("Malayalam");
  const [model, setModel] = useState<"FREE" | "SVOD" | "TVOD">("SVOD");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const publish = useMutation({
    mutationFn: (bridgeTitleId: string) => authorizeLoopPublication({ data: {
      bridgeTitleId,
      territories: territories.split(",").map((v) => v.trim()).filter(Boolean),
      languages: languages.split(",").map((v) => v.trim()).filter(Boolean),
      exploitationModels: [model], accessTier: model,
      windowStart: windowStart ? new Date(windowStart).toISOString() : null,
      windowEnd: windowEnd ? new Date(windowEnd).toISOString() : null,
    } }),
    onSuccess: () => { toast("Authorized and published to Loop"); void qc.invalidateQueries({ queryKey: ["loop-publication-readiness"] }); void qc.invalidateQueries({ queryKey: ["bridge-audit"] }); },
    onError: (err) => toast(err instanceof Error ? err.message : "Publication failed"),
  });
  const revoke = useMutation({
    mutationFn: (bridgeTitleId: string) => revokeLoopPublication({ data: { bridgeTitleId } }),
    onSuccess: () => { toast("Loop publication revoked"); void qc.invalidateQueries({ queryKey: ["loop-publication-readiness"] }); void qc.invalidateQueries({ queryKey: ["bridge-audit"] }); },
    onError: (err) => toast(err instanceof Error ? err.message : "Revoke failed"),
  });
  const rows = q.data?.titles ?? [];
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Bridge → Loop</p><h2 className="font-display text-2xl">Publication & Playback Command Center</h2></div>
        <p className="text-xs text-muted">READY → AUTHORIZED → PUBLISHED → PLAYBACK VERIFYING → CERTIFIED</p>
      </div>
      {canPublish ? <div className="mt-4 grid gap-3 rounded-sm border border-line bg-surface p-4 md:grid-cols-5">
        <label className="text-xs">Territories<input value={territories} onChange={(e) => setTerritories(e.target.value)} className="mt-1 h-10 w-full rounded-sm border border-line-strong bg-elevated px-3" /></label>
        <label className="text-xs">Languages<input value={languages} onChange={(e) => setLanguages(e.target.value)} className="mt-1 h-10 w-full rounded-sm border border-line-strong bg-elevated px-3" /></label>
        <label className="text-xs">Exploitation<select value={model} onChange={(e) => setModel(e.target.value as "FREE" | "SVOD" | "TVOD")} className="mt-1 h-10 w-full rounded-sm border border-line-strong bg-elevated px-3"><option>SVOD</option><option>TVOD</option><option>FREE</option></select></label>
        <label className="text-xs">Window start<input type="datetime-local" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="mt-1 h-10 w-full rounded-sm border border-line-strong bg-elevated px-3" /></label>
        <label className="text-xs">Window end<input type="datetime-local" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="mt-1 h-10 w-full rounded-sm border border-line-strong bg-elevated px-3" /></label>
      </div> : null}
      <div className="mt-4 grid gap-3">
        {rows.map((t) => {
          const state = t.publication?.published && t.publication.authorizationStatus === "authorized" ? "PUBLISHED" : t.ready ? "READY" : "HOLD";
          return <article key={t.id} className="rounded-sm border border-line bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><h3 className="font-semibold">{t.name}</h3><p className="mt-1 text-xs text-muted">{t.bridgeStatus} · {t.language} · Master {t.hasMaster ? "PASS" : "MISSING"}</p></div>
              <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">{state}</span>
            </div>
            {t.blockers.length ? <p className="mt-3 text-sm">HOLD: {t.blockers.join(" · ")}</p> : <p className="mt-3 text-sm text-muted">Publication readiness PASS. Rights/lifecycle and master prerequisites are satisfied.</p>}
            <div className="mt-3 grid gap-1 text-xs text-muted md:grid-cols-4">
              <span>Loop metadata: {t.publication ? "CREATED" : "PENDING"}</span><span>Authorization: {t.publication?.authorizationStatus ?? "PENDING"}</span><span>Publication: {t.publication?.published ? "PUBLISHED" : "PENDING"}</span><span>Playback: {t.publication?.playbackPath ? "READY TO VERIFY" : "NOT VERIFIED"}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {canPublish ? <Button type="button" disabled={!t.ready || publish.isPending} onClick={() => publish.mutate(t.id)}>{t.publication?.published ? "Re-authorize / Update Loop" : "Authorize & Publish to Loop"}</Button> : null}
              {canRevoke && t.publication?.published ? <Button type="button" disabled={revoke.isPending} onClick={() => revoke.mutate(t.id)}>Revoke</Button> : null}
              <Button type="button" disabled>Run Playback Certification — pending runtime verifier</Button>
            </div>
          </article>;
        })}
        {!rows.length ? <p className="rounded-sm border border-line p-4 text-sm text-muted">No Bridge titles available.</p> : null}
      </div>
    </section>
  );
}

function InviteForm() {
  const qc = useQueryClient(); const [email, setEmail] = useState(""); const [role, setRole] = useState<(typeof INTERNAL_ROLES)[number]>("viewer");
  const mut = useMutation({ mutationFn: () => inviteInternalRole({ data: { email, role } }), onSuccess: () => { toast("Invite sent"); void qc.invalidateQueries({ queryKey: ["bridge-audit"] }); }, onError: (err) => toast(err instanceof Error ? err.message : "Invite failed") });
  function onSubmit(e: FormEvent) { e.preventDefault(); mut.mutate(); }
  return <form onSubmit={onSubmit} className="grid gap-3 rounded-sm border border-line bg-surface p-4 sm:grid-cols-3">
    <label className="text-sm sm:col-span-2">Invite email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3" /></label>
    <label className="text-sm">Role<select value={role} onChange={(e) => setRole(e.target.value as (typeof INTERNAL_ROLES)[number])} className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3">{INTERNAL_ROLES.map((r) => <option key={r} value={r}>{r.replaceAll("_", " ")}</option>)}</select></label>
    <Button type="submit" disabled={mut.isPending}>Send invite</Button>
  </form>;
}
