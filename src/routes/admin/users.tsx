import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listAdminProfiles } from "@/lib/bridge/profiles";

export const Route = createFileRoute("/admin/users")({ component: UsersWorkspace });

function UsersWorkspace() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Users & Access">
          <div className="mx-auto max-w-6xl space-y-5">
            <header>
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">People & Access</p>
              <h2 className="mt-1 font-display text-3xl font-semibold">Users & Access</h2>
              <p className="mt-2 text-sm text-muted">Verified Bridge profile inventory. Role invitations remain controlled by the existing server-side role-grant workflow.</p>
            </header>
            <ProfilesInventory />
            <div className="flex flex-wrap gap-3 border-t border-line pt-4 text-sm">
              <Link to="/internal" className="text-accent hover:underline">Internal invitations →</Link>
              <Link to="/dashboard" className="text-accent hover:underline">Founder Centre →</Link>
            </div>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function ProfilesInventory() {
  const query = useQuery({
    queryKey: ["bridge-admin-profiles"],
    queryFn: () => listAdminProfiles(),
    retry: 1,
  });
  const profiles = query.data?.profiles ?? [];

  if (query.isPending) return <p className="text-sm text-muted">Loading verified profile inventory…</p>;
  if (query.isError) return <p role="alert" className="rounded-sm border border-line p-4 text-sm">Profile inventory is unavailable. No zero count is assumed.</p>;

  return (
    <section className="overflow-hidden rounded-sm border border-line">
      <div className="border-b border-line px-4 py-3">
        <h3 className="font-semibold">Bridge profiles</h3>
        <p className="mt-1 text-xs text-muted">Latest 200 profiles only. This is not a complete organization membership register.</p>
      </div>
      {profiles.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
              <tr><th className="px-3 py-3">User</th><th className="px-3 py-3">Account</th><th className="px-3 py-3">Organization</th><th className="px-3 py-3">Internal role</th><th className="px-3 py-3">Verification</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {profiles.map((profile) => (
                <tr key={profile.userId}>
                  <td className="px-3 py-3"><p className="font-medium">{profile.displayName}</p><p className="text-xs text-muted">{profile.email}</p></td>
                  <td className="px-3 py-3">{profile.accountType.replaceAll("_", " ")}</td>
                  <td className="px-3 py-3">{profile.organizationName || "—"}</td>
                  <td className="px-3 py-3">{profile.internalRole?.replaceAll("_", " ") || "—"}</td>
                  <td className="px-3 py-3">{profile.emailVerified ? "Verified" : "Unverified"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="px-4 py-8 text-center text-sm text-muted">No Bridge profiles found in the returned window.</p>}
    </section>
  );
}
