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
import { getCommandSnapshot, invitePartner, listAllSubmissions, listDirectory, probeIntegrations } from "@/lib/bridge/command";
import { INTERNAL_ROLES } from "@/lib/bridge/types";
import { hasPermission } from "@/lib/bridge/rbac";
import { cn } from "@/lib/cn";
import type { TitleStatus } from "@/lib/bridge/types";

export const Route = createFileRoute("/internal")({ component: Internal });

const DESKS = [
  "command",
  "people",
  "partners",
  "titles",
  "submissions",
  "qc",
  "legal",
  "marketplace",
  "finance",
  "distribution",
  "integrations",
  "audit",
  "settings",
] as const;
type Desk = (typeof DESKS)[number];

function Internal() {
  return (
    <RequireBridge allow="internal">
      {(actor) => (
        <BridgeShell actor={actor} kicker="Command center" title="Operations desk">
          <p className="mb-6 text-sm text-muted">
            {actor.internalRole?.replaceAll("_", " ")} · {actor.email}. Private masters live here.
            Loop receives a license only after capture.
          </p>
          <InternalBody
            canInvite={hasPermission(actor, "users.invite_internal")}
            canPartner={hasPermission(actor, "partner.invite")}
            canFinance={hasPermission(actor, "finance.read")}
            canAudit={hasPermission(actor, "audit.read")}
            canDirectory={hasPermission(actor, "directory.read")}
            canIntegrations={hasPermission(actor, "integrations.read")}
          />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function InternalBody({
  canInvite,
  canPartner,
  canFinance,
  canAudit,
  canDirectory,
  canIntegrations,
}: {
  canInvite: boolean;
  canPartner: boolean;
  canFinance: boolean;
  canAudit: boolean;
  canDirectory: boolean;
  canIntegrations: boolean;
}) {
  const [desk, setDesk] = useState<Desk>("command");
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const snapQ = useQuery({ queryKey: ["bridge-command"], queryFn: () => getCommandSnapshot() });
  const titles = titlesQ.data?.titles ?? [];
  const qcQueue = titles.filter((t) => t.status === "QC_REVIEW");
  const rightsQueue = titles.filter((t) => t.status === "RIGHTS_REVIEW");
  const deliveryQueue = titles.filter((t) => t.status === "LICENSED");
  const market = titles.filter((t) => t.status === "LICENSING_READY" || t.status === "LIVE_FOR_BUYERS");

  return (
    <div>
      <nav className="flex flex-wrap gap-1 border-b border-line pb-3 text-sm">
        {DESKS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDesk(d)}
            className={cn(
              "rounded-sm px-3 py-1.5 capitalize",
              desk === d ? "bg-surface text-fg" : "text-muted hover:text-fg",
            )}
          >
            {d}
          </button>
        ))}
      </nav>
      <div className="mt-6">
        {desk === "command" ? <CommandOverview snap={snapQ.data} loading={snapQ.isPending} /> : null}
        {desk === "people" ? canDirectory ? <PeopleDesk /> : <Denied /> : null}
        {desk === "partners" ? canDirectory ? <PartnersDesk canInvite={canPartner} /> : <Denied /> : null}
        {desk === "titles" ? <TitleQueue titles={titles} empty="No titles in the pipeline." /> : null}
        {desk === "submissions" ? <SubmissionsDesk /> : null}
        {desk === "qc" ? <TitleQueue titles={qcQueue} empty="No titles in QC review." /> : null}
        {desk === "legal" ? <TitleQueue titles={rightsQueue} empty="No titles in legal / rights review." /> : null}
        {desk === "marketplace" ? (
          <TitleQueue titles={market} empty="No rights-cleared inventory listed." />
        ) : null}
        {desk === "finance" ? canFinance ? <FinanceDesk /> : <Denied /> : null}
        {desk === "distribution" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              LOOP ingest after capture. YouTube and Prime: not configured — delivery packages only, no fake publish.
            </p>
            <TitleQueue titles={deliveryQueue} empty="No licensed titles waiting on Loop." />
          </div>
        ) : null}
        {desk === "integrations" ? canIntegrations ? <IntegrationsDesk /> : <Denied /> : null}
        {desk === "audit" ? canAudit ? <AuditDesk /> : <Denied /> : null}
        {desk === "settings" ? canInvite ? <InviteForm /> : <Denied /> : null}
      </div>
    </div>
  );
}

function Denied() {
  return <p className="text-sm text-muted">Unauthorized.</p>;
}

function CommandOverview({
  snap,
  loading,
}: {
  snap: Awaited<ReturnType<typeof getCommandSnapshot>> | undefined;
  loading: boolean;
}) {
  if (loading) return <p className="text-sm text-muted">Loading command center…</p>;
  if (!snap) return <p className="text-sm text-muted">Command snapshot unavailable.</p>;
  const cards = [
    ["People", snap.people],
    ["Organizations", snap.orgs],
    ["Partners", snap.partners],
    ["Titles", snap.titles],
    ["Submissions", snap.submissions],
    ["Assets", snap.assets],
    ["QC queue", snap.qc],
    ["Legal queue", snap.legal],
    ["Open deals", snap.deals],
    ["Licensed", snap.licensed],
    ["Captured payments", snap.captured],
  ] as const;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(([label, value]) => (
        <Count key={label} label={label} value={value} />
      ))}
    </ul>
  );
}

function PeopleDesk() {
  const q = useQuery({ queryKey: ["bridge-directory"], queryFn: () => listDirectory() });
  if (q.isPending) return <p className="text-sm text-muted">Loading directory…</p>;
  const people = q.data?.people ?? [];
  const orgs = q.data?.organizations ?? [];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h2 className="mb-2 font-display text-xl">Users</h2>
        {!people.length ? (
          <p className="text-sm text-muted">No users yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-sm border border-line text-sm">
            {people.map((p) => (
              <li key={p.email} className="px-3 py-2">
                {p.displayName} · {p.email} · {p.accountType.replaceAll("_", " ")}
                {p.internalRole ? ` · ${p.internalRole}` : ""} · {p.emailVerified ? "verified" : "unverified"}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h2 className="mb-2 font-display text-xl">Organizations</h2>
        {!orgs.length ? (
          <p className="text-sm text-muted">No organizations yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-sm border border-line text-sm">
            {orgs.map((o) => (
              <li key={o.id} className="px-3 py-2">
                {o.name} · {o.kind}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PartnersDesk({ canInvite }: { canInvite: boolean }) {
  const qc = useQueryClient();
  const dirQ = useQuery({ queryKey: ["bridge-directory"], queryFn: () => listDirectory() });
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState<"studio" | "buyer" | "distributor" | "platform" | "brand" | "other">("studio");
  const mut = useMutation({
    mutationFn: () => invitePartner({ data: { email, kind } }),
    onSuccess: (res) => {
      toast(res.sent ? "Invitation emailed. WhatsApp not configured." : "Invite failed");
      void qc.invalidateQueries({ queryKey: ["bridge-directory"] });
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Invite failed"),
  });
  const partners = dirQ.data?.partners ?? [];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]">
      {canInvite ? (
        <form
          className="grid gap-2 rounded-sm border border-line bg-surface p-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <p className="font-medium">Invite partner</p>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 rounded-sm border border-line-strong bg-elevated px-2" placeholder="email" />
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="h-9 rounded-sm border border-line-strong bg-elevated px-2">
            <option value="studio">studio</option>
            <option value="buyer">buyer</option>
            <option value="distributor">distributor</option>
            <option value="platform">platform</option>
            <option value="brand">brand</option>
            <option value="other">other</option>
          </select>
          <Button type="submit" disabled={mut.isPending}>Email invite</Button>
          <p className="text-xs text-muted">WhatsApp: not configured. Invite is pending until verification — not ACTIVE.</p>
        </form>
      ) : (
        <p className="text-sm text-muted">No invite permission.</p>
      )}
      {!partners.length ? (
        <p className="text-sm text-muted">No partners yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-sm border border-line text-sm">
          {partners.map((p) => (
            <li key={p.id} className="px-3 py-2">
              {p.invited_email} · {p.kind} · {p.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SubmissionsDesk() {
  const q = useQuery({ queryKey: ["bridge-submissions-admin"], queryFn: () => listAllSubmissions() });
  const rows = q.data?.submissions ?? [];
  if (q.isPending) return <p className="text-sm text-muted">Loading submissions…</p>;
  if (!rows.length) return <p className="text-sm text-muted">No submissions yet.</p>;
  return (
    <ul className="divide-y divide-line rounded-sm border border-line text-sm">
      {rows.map((s) => (
        <li key={s.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
          <span>{s.titleName}</span>
          <span className="text-muted">{s.status} · screener {s.screenerStatus}</span>
        </li>
      ))}
    </ul>
  );
}

function IntegrationsDesk() {
  const q = useQuery({ queryKey: ["bridge-integrations"], queryFn: () => probeIntegrations() });
  if (q.isPending) return <p className="text-sm text-muted">Probing integrations…</p>;
  const rows = q.data;
  if (!rows) return <p className="text-sm text-muted">Integrations unavailable.</p>;
  return (
    <ul className="grid gap-2 text-sm sm:grid-cols-2">
      {Object.entries(rows).map(([k, v]) => (
        <li key={k} className="rounded-sm border border-line px-3 py-2">
          <span className="text-muted">{k}: </span>
          {String(v).replaceAll("_", " ")}
        </li>
      ))}
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
