import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listStudioMembers, updateStudioMember } from "@/lib/bridge/studio-members";

type Role = "member" | "producer" | "dit" | "admin";
type Status = "active" | "suspended" | "removed";

function MemberRow({
  member, managerRole, onSave, saving,
}: {
  member: { userId: string; displayName: string; email: string; accountType: string; membershipRole: string; status: string };
  managerRole: string;
  onSave: (data: { userId: string; membershipRole: Role; status: Status }) => void;
  saving: boolean;
}) {
  const [role, setRole] = useState<Role>(member.membershipRole as Role);
  const [status, setStatus] = useState<Status>(member.status as Status);
  const protectedOwner = member.membershipRole === "owner";
  const cannotManage = protectedOwner || (managerRole === "admin" && member.membershipRole === "admin");
  const roleOptions: Role[] = managerRole === "owner"
    ? ["admin", "member", "producer", "dit"]
    : ["member", "producer", "dit"];
  return (
    <tr className="border-b border-line/70">
      <td className="px-2 py-3 font-medium">{member.displayName || member.userId}</td>
      <td className="px-2 py-3">{member.email}</td>
      <td className="px-2 py-3">{member.accountType}</td>
      <td className="px-2 py-3">
        {protectedOwner ? "owner" : (
          <select aria-label={`Role for ${member.displayName || member.userId}`} value={role}
            onChange={(event) => setRole(event.target.value as Role)} className="rounded border border-line bg-surface px-2 py-1"
            disabled={cannotManage}>
            {roleOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        )}
      </td>
      <td className="px-2 py-3">
        {protectedOwner ? member.status : (
          <select aria-label={`Status for ${member.displayName || member.userId}`} value={status}
            onChange={(event) => setStatus(event.target.value as Status)} className="rounded border border-line bg-surface px-2 py-1">
            <option value="active">active</option><option value="suspended">suspended</option><option value="removed">remove access</option>
          </select>
        )}
      </td>
      <td className="px-2 py-3">
        {!cannotManage ? <button type="button" disabled={saving || (role === member.membershipRole && status === member.status)}
          onClick={() => onSave({ userId: member.userId, membershipRole: role, status })}
          className="rounded border border-line px-3 py-1.5 text-xs hover:border-accent disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button> : <span className="text-xs text-muted">Protected</span>}
      </td>
    </tr>
  );
}

export function StudioMemberDesk() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["bridge-studio-members"], queryFn: () => listStudioMembers() });
  const mutation = useMutation({
    mutationFn: (data: { userId: string; membershipRole: Role; status: Status }) => updateStudioMember({ data }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["bridge-studio-members"] }); },
  });
  if (query.isPending) return <p className="text-sm text-muted">Loading verified Studio members…</p>;
  if (query.isError) return <p role="alert" className="text-sm text-muted">Studio membership is unavailable or this account lacks owner/admin permission. No member list was assumed.</p>;
  const members = query.data.members;
  if (members.length === 0) return <p className="text-sm text-muted">No active or suspended members are recorded for this Studio organization.</p>;
  return (
    <div className="space-y-3">
      {mutation.isError ? <p role="alert" className="text-sm text-accent">{mutation.error instanceof Error ? mutation.error.message : "Member update failed"}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead><tr className="border-b border-line text-xs text-muted">
            <th className="px-2 py-2">Member</th><th className="px-2 py-2">Email</th><th className="px-2 py-2">Account</th><th className="px-2 py-2">Studio role</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Action</th>
          </tr></thead>
          <tbody>{members.map((member) => <MemberRow key={member.userId} member={member}
            managerRole={query.data.managerRole} saving={mutation.isPending}
            onSave={(data) => mutation.mutate(data)} />)}</tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Only verified Studio owners/admins can manage existing organization members. Owner transfer and new-account invitations are not enabled. Removal is a soft membership status change and preserves the audit trail.</p>
    </div>
  );
}
