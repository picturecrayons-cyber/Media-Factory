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
import { INTERNAL_ROLES } from "@/lib/bridge/types";
import { hasPermission } from "@/lib/bridge/rbac";

export const Route = createFileRoute("/internal")({ component: Internal });

function Internal() {
  return (
    <RequireBridge allow="internal">
      {(actor) => (
        <BridgeShell actor={actor} title="Internal desk">
          <p className="mb-6 text-sm text-muted">
            {actor.internalRole?.replaceAll("_", " ")} · {actor.email}
          </p>
          <InternalBody canInvite={hasPermission(actor, "users.invite_internal")} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function InternalBody({ canInvite }: { canInvite: boolean }) {
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const logsQ = useQuery({ queryKey: ["bridge-audit"], queryFn: () => listAuditLogs() });
  const titles = titlesQ.data?.titles ?? [];
  return (
    <div className="grid gap-10">
      {canInvite ? <InviteForm /> : null}
      <section>
        <h2 className="font-display text-2xl">Titles</h2>
        <ul className="mt-4 divide-y divide-line rounded-sm border border-line">
          {titles.length ? (
            titles.map((t) => (
              <li key={t.id}>
                <Link
                  to="/title/$id"
                  params={{ id: t.id }}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-fg/5"
                >
                  <span>{t.name}</span>
                  <StatusChip status={t.status} />
                </Link>
              </li>
            ))
          ) : (
            <li className="px-4 py-6 text-sm text-muted">No titles in the pipeline.</li>
          )}
        </ul>
      </section>
      <section>
        <h2 className="font-display text-2xl">Audit</h2>
        <ul className="mt-4 space-y-2 font-mono text-xs text-muted">
          {(logsQ.data?.logs ?? []).map((l) => (
            <li key={l.id} className="rounded-sm border border-line px-3 py-2">
              {l.createdAt} · {l.action} · {l.entityType} · {l.entityId}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function InviteForm() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof INTERNAL_ROLES)[number]>("viewer");
  const mut = useMutation({
    mutationFn: () => inviteInternalRole({ data: { email, role } }),
    onSuccess: () => {
      toast("Invite sent");
      void qc.invalidateQueries({ queryKey: ["bridge-audit"] });
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Invite failed"),
  });
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mut.mutate();
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-sm border border-line bg-surface p-4 sm:grid-cols-3">
      <label className="text-sm sm:col-span-2">
        Invite email
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3"
        />
      </label>
      <label className="text-sm">
        Role
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as (typeof INTERNAL_ROLES)[number])}
          className="mt-1 h-11 w-full rounded-sm border border-line-strong bg-elevated px-3"
        >
          {INTERNAL_ROLES.map((r) => (
            <option key={r} value={r}>
              {r.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={mut.isPending}>
        Send invite
      </Button>
    </form>
  );
}
