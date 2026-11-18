import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptStudioOwnershipTransfer,
  cancelStudioOwnershipTransfer,
  createStudioInvite,
  listStudioInvites,
  listStudioMembers,
  listStudioOwnershipTransfers,
  requestStudioOwnershipTransfer,
  revokeStudioInvite,
  updateStudioMember,
  type StudioMember,
} from "@/lib/bridge/studio-members";

export function StudioMemberDesk() {
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "producer" | "dit" | "member">("member");
  const [transferTarget, setTransferTarget] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const query = useQuery({
    queryKey: ["bridge-studio-members"],
    queryFn: () => listStudioMembers(),
    retry: 1,
  });
  const invitesQuery = useQuery({
    queryKey: ["bridge-studio-invites"],
    queryFn: () => listStudioInvites(),
    retry: 1,
  });
  const transfersQuery = useQuery({
    queryKey: ["bridge-studio-ownership-transfers"],
    queryFn: () => listStudioOwnershipTransfers(),
    retry: 1,
  });
  const inviteMutation = useMutation({
    mutationFn: (data: { email: string; membershipRole: "admin" | "producer" | "dit" | "member" }) => createStudioInvite({ data }),
    onSuccess: async (result) => {
      setInviteEmail("");
      setInviteUrl(result.inviteUrl);
      await queryClient.invalidateQueries({ queryKey: ["bridge-studio-invites"] });
    },
  });
  const revokeInviteMutation = useMutation({
    mutationFn: (inviteId: string) => revokeStudioInvite({ data: { inviteId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bridge-studio-invites"] });
    },
  });
  const transferMutation = useMutation({
    mutationFn: (data: { proposedOwnerUserId: string; reason: string }) => requestStudioOwnershipTransfer({ data }),
    onSuccess: async () => {
      setTransferTarget("");
      setTransferReason("");
      await queryClient.invalidateQueries({ queryKey: ["bridge-studio-ownership-transfers"] });
    },
  });
  const acceptTransferMutation = useMutation({
    mutationFn: (transferId: string) => acceptStudioOwnershipTransfer({ data: { transferId } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bridge-studio-ownership-transfers"] }),
        queryClient.invalidateQueries({ queryKey: ["bridge-studio-members"] }),
      ]);
    },
  });
  const cancelTransferMutation = useMutation({
    mutationFn: (transferId: string) => cancelStudioOwnershipTransfer({ data: { transferId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bridge-studio-ownership-transfers"] });
    },
  });
  const mutation = useMutation({
    mutationFn: (data: { memberUserId: string; membershipRole: "admin" | "producer" | "dit" | "member"; status: "active" | "suspended" | "removed" }) => updateStudioMember({ data }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bridge-studio-members"] });
    },
  });

  if (query.isPending) return <p className="text-sm text-muted">Loading verified Studio members…</p>;
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-muted">
        Studio membership is unavailable or this account lacks owner/admin permission. No member list was assumed.
      </p>
    );
  }

  if (!query.data) return <p className="text-sm text-muted">Studio member data is unavailable.</p>;
  const result = query.data;
  const members = result.members;
  if (!members.length) {
    return <p className="text-sm text-muted">No Studio memberships are recorded for this organization.</p>;
  }

  function controls(member: StudioMember) {
    const locked = member.membershipRole === "owner" ||
      member.userId === result.currentUserId ||
      member.status === "removed" ||
      mutation.isPending;
    return (
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor={`studio-role-${member.userId}`}>Role for {member.displayName}</label>
        <select
          id={`studio-role-${member.userId}`}
          className="rounded-sm border border-line bg-bg px-2 py-1 text-xs"
          value={member.membershipRole}
          disabled={locked || (result.managerRole !== "owner" && member.membershipRole === "admin")}
          onChange={(event) => mutation.mutate({
            memberUserId: member.userId,
            membershipRole: event.target.value as "admin" | "producer" | "dit" | "member",
            status: member.status as "active" | "suspended" | "removed",
          })}
        >
          {result.managerRole === "owner" ? <option value="admin">Admin</option> : null}
          <option value="producer">Producer</option>
          <option value="dit">DIT</option>
          <option value="member">Member</option>
          {member.membershipRole === "owner" ? <option value="owner">Owner</option> : null}
        </select>
        <label className="sr-only" htmlFor={`studio-status-${member.userId}`}>Status for {member.displayName}</label>
        <select
          id={`studio-status-${member.userId}`}
          className="rounded-sm border border-line bg-bg px-2 py-1 text-xs"
          value={member.status}
          disabled={locked}
          onChange={(event) => mutation.mutate({
            memberUserId: member.userId,
            membershipRole: member.membershipRole as "admin" | "producer" | "dit" | "member",
            status: event.target.value as "active" | "suspended" | "removed",
          })}
        >
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="removed">Removed</option>
        </select>
        {locked ? <span className="self-center text-[11px] text-muted">{member.membershipRole === "owner" ? "Owner protected" : member.userId === result.currentUserId ? "Your access protected" : member.status === "removed" ? "Removed" : "Updating…"}</span> : null}
      </div>
    );
  }

  const activeAdmins = members.filter((member) =>
    member.membershipRole === "admin" && member.status === "active" && member.userId !== result.currentUserId
  );

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-xl border border-line p-4">
        <div>
          <h3 className="text-sm font-semibold">Invite a Studio member</h3>
          <p className="mt-1 text-xs text-muted">Invitations are email-bound, expire after seven days, and require a verified Studio account. Admin access can only be granted by the owner.</p>
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            inviteMutation.mutate({ email: inviteEmail, membershipRole: inviteRole });
          }}
        >
          <label className="min-w-[220px] flex-1 text-xs font-medium">
            Email address
            <input required type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-line bg-bg px-3 text-sm" />
          </label>
          <label className="text-xs font-medium">
            Studio role
            <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as typeof inviteRole)} className="mt-1 h-10 rounded-md border border-line bg-bg px-3 text-sm">
              {result.managerRole === "owner" ? <option value="admin">Admin</option> : null}
              <option value="producer">Producer</option>
              <option value="dit">DIT</option>
              <option value="member">Member</option>
            </select>
          </label>
          <button type="submit" disabled={inviteMutation.isPending} className="h-10 rounded-md bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50">
            {inviteMutation.isPending ? "Creating…" : "Create invitation"}
          </button>
        </form>
        {inviteMutation.isError ? <p role="alert" className="text-xs text-red-600">{inviteMutation.error.message}</p> : null}
        {inviteUrl ? (
          <div className="rounded-md border border-line bg-elevated p-3">
            <p className="text-xs font-semibold">Invitation created</p>
            <p className="mt-1 break-all text-xs text-muted">{inviteUrl}</p>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(inviteUrl)} className="mt-2 text-xs font-semibold underline">Copy invitation link</button>
          </div>
        ) : null}
        {invitesQuery.data?.invites.length ? (
          <div className="space-y-2 border-t border-line pt-3">
            <p className="text-xs font-semibold">Pending invitations</p>
            {invitesQuery.data.invites.map((invite) => (
              <div key={invite.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>{invite.email} · {invite.membershipRole} · expires {new Date(invite.expiresAt).toLocaleDateString()}</span>
                <button type="button" disabled={revokeInviteMutation.isPending} onClick={() => revokeInviteMutation.mutate(invite.id)} className="text-red-600 underline">Revoke</button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="px-2 py-2">Member</th>
              <th className="px-2 py-2">Email</th>
              <th className="px-2 py-2">Account</th>
              <th className="px-2 py-2">Studio access</th>
              <th className="px-2 py-2">Manage access</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.userId} className="border-b border-line/70">
                <td className="px-2 py-3 font-medium">{member.displayName || member.userId}</td>
                <td className="px-2 py-3">{member.email}</td>
                <td className="px-2 py-3">{member.accountType}</td>
                <td className="px-2 py-3">{member.membershipRole} · {member.status}</td>
                <td className="px-2 py-3">{controls(member)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mutation.isError ? <p role="alert" className="text-sm text-red-600">{mutation.error.message}</p> : null}

      <section className="space-y-3 rounded-xl border border-line p-4">
        <div>
          <h3 className="text-sm font-semibold">Studio ownership transfer</h3>
          <p className="mt-1 text-xs text-muted">The current owner proposes the handover. The selected active admin must sign in and accept. Both memberships and audit records change in one transaction.</p>
        </div>
        {result.managerRole === "owner" ? (
          <form
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              transferMutation.mutate({ proposedOwnerUserId: transferTarget, reason: transferReason });
            }}
          >
            <label className="text-xs font-medium">
              New owner
              <select required value={transferTarget} onChange={(event) => setTransferTarget(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-line bg-bg px-3 text-sm">
                <option value="">Select active admin</option>
                {activeAdmins.map((member) => <option key={member.userId} value={member.userId}>{member.displayName} · {member.email}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium">
              Reason for handover
              <input required minLength={8} maxLength={1000} value={transferReason} onChange={(event) => setTransferReason(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-line bg-bg px-3 text-sm" />
            </label>
            <button type="submit" disabled={transferMutation.isPending || !activeAdmins.length} className="h-10 self-end rounded-md bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50">
              {transferMutation.isPending ? "Submitting…" : "Request transfer"}
            </button>
          </form>
        ) : null}
        {transferMutation.isError ? <p role="alert" className="text-xs text-red-600">{transferMutation.error.message}</p> : null}
        {transfersQuery.data?.transfers.length ? (
          <div className="space-y-2 border-t border-line pt-3">
            <p className="text-xs font-semibold">Pending handover</p>
            {transfersQuery.data.transfers.map((transfer) => (
              <div key={transfer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-elevated p-3 text-xs">
                <div>
                  <p className="font-medium">{transfer.currentOwnerName} → {transfer.proposedOwnerName}</p>
                  <p className="mt-1 text-muted">{transfer.reason}</p>
                </div>
                <div className="flex gap-2">
                  {transfer.proposedOwnerUserId === result.currentUserId && result.managerRole === "admin" ? (
                    <button type="button" disabled={acceptTransferMutation.isPending} onClick={() => acceptTransferMutation.mutate(transfer.id)} className="font-semibold underline">Accept</button>
                  ) : null}
                  {transfer.currentOwnerUserId === result.currentUserId && result.managerRole === "owner" ? (
                    <button type="button" disabled={cancelTransferMutation.isPending} onClick={() => cancelTransferMutation.mutate(transfer.id)} className="text-red-600 underline">Cancel</button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-muted">No pending ownership handover.</p>}
        {acceptTransferMutation.isError ? <p role="alert" className="text-xs text-red-600">{acceptTransferMutation.error.message}</p> : null}
        {cancelTransferMutation.isError ? <p role="alert" className="text-xs text-red-600">{cancelTransferMutation.error.message}</p> : null}
      </section>

      <p className="text-xs text-muted">
        Owner/admin only. Membership, invitation and ownership changes are server-authorized and audit-logged. Removed memberships remain immutable; use a new invitation after the organization owner reviews the prior record.
      </p>
    </div>
  );
}
