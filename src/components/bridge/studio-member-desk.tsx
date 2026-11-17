import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listStudioMembers, updateStudioMember, type StudioMember } from "@/lib/bridge/studio-members";

export function StudioMemberDesk() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["bridge-studio-members"],
    queryFn: () => listStudioMembers(),
    retry: 1,
  });
  const mutation = useMutation({
    mutationFn: updateStudioMember,
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

  const members = query.data.members;
  if (!members.length) {
    return <p className="text-sm text-muted">No Studio memberships are recorded for this organization.</p>;
  }

  function controls(member: StudioMember) {
    const locked = member.membershipRole === "owner" ||
      member.userId === query.data.currentUserId ||
      member.status === "removed" ||
      mutation.isPending;
    return (
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor={`studio-role-${member.userId}`}>Role for {member.displayName}</label>
        <select
          id={`studio-role-${member.userId}`}
          className="rounded-sm border border-line bg-bg px-2 py-1 text-xs"
          value={member.membershipRole}
          disabled={locked || (query.data.managerRole !== "owner" && member.membershipRole === "admin")}
          onChange={(event) => mutation.mutate({
            memberUserId: member.userId,
            membershipRole: event.target.value as "admin" | "producer" | "dit" | "member",
            status: member.status as "active" | "suspended" | "removed",
          })}
        >
          {query.data.managerRole === "owner" ? <option value="admin">Admin</option> : null}
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
        {locked ? <span className="self-center text-[11px] text-muted">{member.membershipRole === "owner" ? "Owner protected" : member.userId === query.data.currentUserId ? "Your access protected" : member.status === "removed" ? "Removed" : "Updating…"}</span> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
      <p className="text-xs text-muted">
        Owner/admin only. Role and status changes are server-authorized and audit-logged. Owner transfer, new member invitations and restoration of removed memberships remain disabled.
      </p>
    </div>
  );
}
