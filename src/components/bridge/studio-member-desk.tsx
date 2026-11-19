import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptStudioOwnershipTransfer,
  cancelStudioOwnershipTransfer,
  listStudioMembers,
  listStudioOwnershipTransfers,
  requestStudioOwnershipTransfer,
  updateStudioMember,
  type StudioMember,
} from "@/lib/bridge/studio-members";

export function StudioMemberDesk() {
  const client = useQueryClient();
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const membersQuery = useQuery({ queryKey: ["bridge-studio-members"], queryFn: () => listStudioMembers(), retry: 1 });
  const transfersQuery = useQuery({ queryKey: ["bridge-studio-ownership-transfers"], queryFn: () => listStudioOwnershipTransfers(), enabled: membersQuery.data?.managerRole === "owner" || membersQuery.data?.managerRole === "admin", retry: 1 });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["bridge-studio-members"] }),
      client.invalidateQueries({ queryKey: ["bridge-studio-ownership-transfers"] }),
    ]);
  };
  const update = useMutation({
    mutationFn: (data: { memberUserId: string; membershipRole: "admin" | "producer" | "dit" | "member"; status: "active" | "suspended" | "removed" }) => updateStudioMember({ data }),
    onSuccess: refresh,
  });
  const request = useMutation({
    mutationFn: (data: { proposedOwnerUserId: string; reason: string }) => requestStudioOwnershipTransfer({ data }),
    onSuccess: async () => { setTarget(""); setReason(""); await refresh(); },
  });
  const accept = useMutation({ mutationFn: (transferId: string) => acceptStudioOwnershipTransfer({ data: { transferId } }), onSuccess: refresh });
  const cancel = useMutation({ mutationFn: (transferId: string) => cancelStudioOwnershipTransfer({ data: { transferId } }), onSuccess: refresh });

  if (membersQuery.isPending) return <p className="text-sm text-muted">Loading verified Studio members…</p>;
  if (membersQuery.isError || !membersQuery.data) return <p role="alert" className="text-sm text-muted">Studio membership data is unavailable for this account.</p>;
  const { members, currentUserId, managerRole } = membersQuery.data;
  const canManage = managerRole === "owner" || managerRole === "admin";
  const activeAdmins = members.filter((m) => m.membershipRole === "admin" && m.status === "active" && m.userId !== currentUserId);

  function controls(member: StudioMember) {
    const locked = !canManage || member.membershipRole === "owner" || member.userId === currentUserId || member.status === "removed" || update.isPending;
    return <div className="flex flex-wrap gap-2">
      <select aria-label={`Role for ${member.displayName}`} className="rounded-sm border border-line bg-bg px-2 py-1 text-xs" value={member.membershipRole} disabled={locked || (managerRole !== "owner" && member.membershipRole === "admin")} onChange={(e) => update.mutate({ memberUserId: member.userId, membershipRole: e.target.value as "admin" | "producer" | "dit" | "member", status: member.status as "active" | "suspended" | "removed" })}>
        {managerRole === "owner" ? <option value="admin">Admin</option> : null}
        <option value="producer">Producer</option><option value="dit">DIT</option><option value="member">Member</option>
      </select>
      <select aria-label={`Status for ${member.displayName}`} className="rounded-sm border border-line bg-bg px-2 py-1 text-xs" value={member.status} disabled={locked} onChange={(e) => update.mutate({ memberUserId: member.userId, membershipRole: member.membershipRole as "admin" | "producer" | "dit" | "member", status: e.target.value as "active" | "suspended" | "removed" })}>
        <option value="active">Active</option><option value="suspended">Suspended</option><option value="removed">Removed</option>
      </select>
    </div>;
  }

  return <div className="space-y-5">
    <div className="overflow-x-auto rounded-sm border border-line">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead><tr className="border-b border-line text-xs text-muted"><th className="px-3 py-2">Member</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Role / status</th><th className="px-3 py-2">Manage</th></tr></thead>
        <tbody>{members.map((m) => <tr key={m.userId} className="border-b border-line/70"><td className="px-3 py-3">{m.displayName || m.userId}</td><td className="px-3 py-3">{m.email}</td><td className="px-3 py-3">{m.membershipRole} · {m.status}</td><td className="px-3 py-3">{canManage ? controls(m) : <span className="text-xs text-muted">View only</span>}</td></tr>)}</tbody>
      </table>
    </div>
    {update.isError ? <p role="alert" className="text-sm text-red-600">{update.error.message}</p> : null}
    {managerRole === "owner" ? <form className="grid gap-2 rounded-sm border border-line p-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); request.mutate({ proposedOwnerUserId: target, reason }); }}>
      <label className="grid gap-1 text-xs">Proposed new owner<select required value={target} onChange={(e) => setTarget(e.target.value)} className="h-10 rounded-sm border border-line bg-bg px-2 text-sm"><option value="">Select active admin</option>{activeAdmins.map((m) => <option key={m.userId} value={m.userId}>{m.displayName} · {m.email}</option>)}</select></label>
      <label className="grid gap-1 text-xs">Reason<input required minLength={8} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} className="h-10 rounded-sm border border-line bg-bg px-2 text-sm" /></label>
      <button type="submit" disabled={!target || request.isPending} className="h-10 self-end rounded-sm bg-accent px-4 text-sm font-semibold text-bg disabled:opacity-50">Request transfer</button>
    </form> : null}
    {request.isError ? <p role="alert" className="text-sm text-red-600">{request.error.message}</p> : null}
    <section className="space-y-2 rounded-sm border border-line p-4">
      <h4 className="text-sm font-semibold">Pending ownership transfers</h4>
      {transfersQuery.isError ? <p role="alert" className="text-sm text-muted">Ownership transfer status is unavailable.</p> : null}
      {canManage && !transfersQuery.isError && (transfersQuery.data?.transfers ?? []).length === 0 ? <p className="text-sm text-muted">No pending ownership transfer.</p> : null}
      {(transfersQuery.data?.transfers ?? []).map((t) => <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-sm">
        <span>{t.currentOwnerName} → {t.proposedOwnerName} · {t.reason}</span>
        <span className="flex gap-3">{t.proposedOwnerUserId === currentUserId && managerRole === "admin" ? <button type="button" disabled={accept.isPending} onClick={() => accept.mutate(t.id)} className="font-semibold underline">Accept</button> : null}{t.currentOwnerUserId === currentUserId && managerRole === "owner" ? <button type="button" disabled={cancel.isPending} onClick={() => cancel.mutate(t.id)} className="underline">Cancel</button> : null}</span>
      </div>)}
      {accept.isError || cancel.isError ? <p role="alert" className="text-sm text-red-600">{accept.error?.message ?? cancel.error?.message}</p> : null}
    </section>
    <p className="text-xs text-muted">Owner/admin only. Self-lockout is blocked. Ownership changes require the current owner to propose and the nominated admin to accept. Invitation creation is held until verified-email acceptance is implemented and tested.</p>
  </div>;
}
