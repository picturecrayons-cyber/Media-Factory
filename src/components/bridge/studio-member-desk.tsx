import { useQuery } from "@tanstack/react-query";
import { listStudioMembers } from "@/lib/bridge/studio-members";
import { bridgeWorkspaceQueryKey, type BridgeWorkspaceActor } from "@/lib/bridge/query-scope";

export function StudioMemberDesk({ actor }: { actor: BridgeWorkspaceActor }) {
  const query = useQuery({
    queryKey: bridgeWorkspaceQueryKey("bridge-studio-members", actor),
    queryFn: () => listStudioMembers(),
    retry: 1,
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
    return <p className="text-sm text-muted">No active or suspended members are recorded for this Studio organization.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="px-2 py-2">Member</th>
              <th className="px-2 py-2">Email</th>
              <th className="px-2 py-2">Account</th>
              <th className="px-2 py-2">Studio role</th>
              <th className="px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.userId} className="border-b border-line/70">
                <td className="px-2 py-3 font-medium">{member.displayName || member.userId}</td>
                <td className="px-2 py-3">{member.email}</td>
                <td className="px-2 py-3">{member.accountType}</td>
                <td className="px-2 py-3">{member.membershipRole}</td>
                <td className="px-2 py-3">{member.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Read-only organization roster. Invitations, role changes, suspensions and removals are not enabled.</p>
    </div>
  );
}
