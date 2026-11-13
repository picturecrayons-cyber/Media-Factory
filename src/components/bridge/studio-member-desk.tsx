import { useQuery } from "@tanstack/react-query";
import { listStudioMembers } from "@/lib/bridge/studio-members";

export function StudioMemberDesk() {
  const query = useQuery({
    queryKey: ["bridge-studio-members"],
    queryFn: () => listStudioMembers(),
  });
  if (query.isPending) return <p className="text-sm text-muted">Loading verified Studio members…</p>;
  if (query.isError) return <p role="alert" className="text-sm text-muted">Studio member records are unavailable for this account or environment. No members are inferred from the Studio name.</p>;
  const members = query.data.members;
  if (members.length === 0) return <p className="text-sm text-muted">No active or suspended members are recorded for this Studio organization.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead><tr className="border-b border-line text-xs text-muted">
          <th className="px-2 py-2">Member</th><th className="px-2 py-2">Email</th><th className="px-2 py-2">Account</th><th className="px-2 py-2">Studio role</th><th className="px-2 py-2">Status</th>
        </tr></thead>
        <tbody>{members.map((member) => <tr key={member.userId} className="border-b border-line/70">
          <td className="px-2 py-3 font-medium">{member.displayName || member.userId}</td>
          <td className="px-2 py-3">{member.email}</td>
          <td className="px-2 py-3">{member.accountType}</td>
          <td className="px-2 py-3">{member.membershipRole}</td>
          <td className="px-2 py-3">{member.status}</td>
        </tr>)}</tbody>
      </table>
      <p className="mt-2 text-xs text-muted">Read-only roster. Invitations and role changes remain disabled until the environment's membership schema and authorization rules are certified.</p>
    </div>
  );
}
