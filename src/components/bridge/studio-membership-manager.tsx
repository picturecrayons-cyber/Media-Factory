import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getStudioMembershipDirectory, grantStudioMembership } from "@/lib/bridge/profiles";

export function StudioMembershipManager() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [membershipRole, setMembershipRole] = useState<"admin" | "member">("member");
  const directory = useQuery({
    queryKey: ["studio-membership-directory"],
    queryFn: () => getStudioMembershipDirectory(),
  });
  const grant = useMutation({
    mutationFn: () => grantStudioMembership({ data: { userId, organizationId, membershipRole } }),
    onSuccess: () => {
      toast.success("Studio membership activated");
      void qc.invalidateQueries({ queryKey: ["studio-membership-directory"] });
      void qc.invalidateQueries({ queryKey: ["bridge-session"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Studio membership could not be updated"),
  });

  if (directory.isPending) return <p className="text-sm text-muted">Loading Studio membership directory…</p>;
  if (directory.isError) return <p role="alert" className="text-sm text-muted">Studio membership directory is unavailable.</p>;

  const organizations = directory.data?.organizations ?? [];
  const studioUsers = directory.data?.studioUsers ?? [];

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div>
        <h2 className="font-display text-xl font-semibold">Studio memberships</h2>
        <p className="mt-1 text-sm text-muted">
          Assign a verified Studio account to more than one active organization. Ownership is never transferred here.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-xs text-muted">
          Studio account
          <select value={userId} onChange={(event) => setUserId(event.target.value)} className="h-10 w-full rounded-lg border border-line-strong bg-elevated px-3 text-sm text-fg">
            <option value="">Select Studio account</option>
            {studioUsers.map((user) => (
              <option key={user.user_id} value={user.user_id}>{user.display_name} · {user.email}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted">
          Organization
          <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} className="h-10 w-full rounded-lg border border-line-strong bg-elevated px-3 text-sm text-fg">
            <option value="">Select organization</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>{organization.legal_name}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted">
          Membership role
          <select value={membershipRole} onChange={(event) => setMembershipRole(event.target.value as "admin" | "member")} className="h-10 w-full rounded-lg border border-line-strong bg-elevated px-3 text-sm text-fg">
            <option value="member">Member</option>
            <option value="admin">Studio admin</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={!userId || !organizationId || grant.isPending} onClick={() => grant.mutate()}>
          {grant.isPending ? "Saving…" : "Add / reactivate membership"}
        </Button>
        <span className="text-xs text-muted">{studioUsers.length} verified Studio accounts · {organizations.length} active organizations</span>
      </div>

      <div className="divide-y divide-line rounded-xl border border-line">
        {studioUsers.map((user) => (
          <div key={user.user_id} className="px-4 py-3">
            <p className="text-sm font-medium">{user.display_name} <span className="text-xs text-muted">· {user.email}</span></p>
            <p className="mt-1 text-xs text-muted">
              {user.memberships.length
                ? user.memberships.map((membership) => {
                    const org = organizations.find((item) => item.id === membership.organizationId);
                    return `${org?.legal_name ?? membership.organizationId} (${membership.membershipRole})`;
                  }).join(" · ")
                : "No active organization memberships"}
            </p>
          </div>
        ))}
        {!studioUsers.length ? <p className="px-4 py-5 text-sm text-muted">No verified Studio accounts found.</p> : null}
      </div>
    </section>
  );
}
