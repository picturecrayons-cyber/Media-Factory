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
import { listFinancePayments } from "@/lib/bridge/desks";
import { INTERNAL_ROLES } from "@/lib/bridge/types";
import { hasPermission } from "@/lib/bridge/rbac";
import { cn } from "@/lib/cn";
import type { TitleStatus } from "@/lib/bridge/types";

export const Route = createFileRoute("/internal")({ component: Internal });

const DESKS = ["overview", "titles", "qc", "rights", "finance", "delivery", "audit", "settings"] as const;
type Desk = (typeof DESKS)[number];

function Internal() {
  return (
    <RequireBridge allow="internal">
      {(actor) => (
        <BridgeShell actor={actor} title="Operations desk">
          <p className="mb-6 text-sm text-muted">
            {actor.internalRole?.replaceAll("_", " ")} · {actor.email}
          </p>
          <InternalBody
            canInvite={hasPermission(actor, "users.invite_internal")}
            canFinance={hasPermission(actor, "finance.read")}
            canAudit={hasPermission(actor, "audit.read")}
          />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function InternalBody({
  canInvite,
  canFinance,
  canAudit,
}: {
  canInvite: boolean;
  canFinance: boolean;
  canAudit: boolean;
}) {
  const [desk, setDesk] = useState<Desk>("overview");
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const titles = titlesQ.data?.titles ?? [];
  const qcQueue = titles.filter((t) => t.status === "QC_REVIEW");
  const rightsQueue = titles.filter((t) => t.status === "RIGHTS_REVIEW");
  const deliveryQueue = titles.filter((t) => t.status === "LICENSED");

  return (
    <div>
      <nav className="flex flex-wrap gap-1 border-b border-line pb-3 text-sm">
        {DESKS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDesk(d)}
            className={cn(
              "rounded-sm px-3 py-2 capitalize",
              desk === d ? "bg-surface text-fg" : "text-muted hover:text-fg",
            )}
          >
            {d}
          </button>
        ))}
      </nav>
      <div className="mt-8">
        {desk === "overview" ? (
          <Overview titles={titles} qc={qcQueue.length} rights={rightsQueue.length} licensed={deliveryQueue.length} />
        ) : null}
        {desk === "titles" ? <TitleQueue titles={titles} empty="No titles in the pipeline." /> : null}
        {desk === "qc" ? <TitleQueue titles={qcQueue} empty="No titles in QC review." /> : null}
        {desk === "rights" ? <TitleQueue titles={rightsQueue} empty="No titles in rights review." /> : null}
        {desk === "finance" ? canFinance ? <FinanceDesk /> : <p className="text-sm text-muted">Unauthorized.</p> : null}
        {desk === "delivery" ? <TitleQueue titles={deliveryQueue} empty="No licensed titles waiting on delivery." /> : null}
        {desk === "audit" ? canAudit ? <AuditDesk /> : <p className="text-sm text-muted">Unauthorized.</p> : null}
        {desk === "settings" ? canInvite ? <InviteForm /> : <p className="text-sm text-muted">No settings for this role.</p> : null}
      </div>
    </div>
  );
}

function Overview({
  titles,
  qc,
  rights,
  licensed,
}: {
  titles: { status: TitleStatus }[];
  qc: number;
  rights: number;
  licensed: number;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Count label="Titles" value={titles.length} />
      <Count label="QC queue" value={qc} />
      <Count label="Rights queue" value={rights} />
      <Count label="Awaiting delivery" value={licensed} />
    </ul>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <li className="rounded-sm border border-line bg-surface px-4 py-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl tabular-nums">{value}</p>
    </li>
  );
}

function TitleQueue({
  titles,
  empty,
}: {
  titles: { id: string; name: string; status: TitleStatus }[];
  empty: string;
}) {
  if (!titles.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line rounded-sm border border-line">
      {titles.map((t) => (
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
      ))}
    </ul>
  );
}

function FinanceDesk() {
  const q = useQuery({ queryKey: ["bridge-finance"], queryFn: () => listFinancePayments() });
  const payments = q.data?.payments ?? [];
  if (q.isPending) return <p className="text-sm text-muted">Loading payments…</p>;
  if (!payments.length) return <p className="text-sm text-muted">No captured payments.</p>;
  return (
    <ul className="divide-y divide-line rounded-sm border border-line font-mono text-xs">
      {payments.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span>
            {p.status} · {p.id.slice(0, 8)} · title {p.titleId?.slice(0, 8) ?? "—"}
          </span>
          <span>₹{(p.amountPaise / 100).toFixed(0)}</span>
        </li>
      ))}
    </ul>
  );
}

function AuditDesk() {
  const logsQ = useQuery({ queryKey: ["bridge-audit"], queryFn: () => listAuditLogs() });
  const logs = logsQ.data?.logs ?? [];
  if (!logs.length) return <p className="text-sm text-muted">No audit events yet.</p>;
  return (
    <ul className="space-y-2 font-mono text-xs text-muted">
      {logs.map((l) => (
        <li key={l.id} className="rounded-sm border border-line px-3 py-2">
          {l.createdAt} · {l.action}
          {l.previousState ? ` · ${l.previousState}→${l.newState}` : ""}
          {l.reason ? ` · ${l.reason}` : ""} · {l.entityId}
        </li>
      ))}
    </ul>
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
