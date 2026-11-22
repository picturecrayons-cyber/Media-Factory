import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listAdminProfiles } from "@/lib/bridge/profiles";

export const Route = createFileRoute("/admin/users")({ component: UsersWorkspace });

type AccountFilter = "all" | "independent_creator" | "studio" | "buyer" | "investor" | "internal";
const FILTERS: Array<{ value: AccountFilter; label: string }> = [
  { value: "all", label: "All accounts" },
  { value: "independent_creator", label: "Creators" },
  { value: "studio", label: "Studios" },
  { value: "buyer", label: "Buyers" },
  { value: "investor", label: "Investors" },
  { value: "internal", label: "Internal team" },
];

function UsersWorkspace() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Users & Access">
          <div className="mx-auto max-w-6xl space-y-5">
            <header>
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">People & Access</p>
              <h2 className="mt-1 font-display text-3xl font-semibold">Users & Access</h2>
              <p className="mt-2 text-sm text-muted">Named account registers for Creators, Studios, Buyers, Investors and internal operators. Only verified Bridge profiles are shown; legacy candidates are not silently promoted into live accounts.</p>
            </header>
            <ProfilesInventory />
            <div className="flex flex-wrap gap-3 border-t border-line pt-4 text-sm">
              <Link to="/admin/team" className="text-accent hover:underline">Team & invitations →</Link>
              <Link to="/admin/buyers" className="text-accent hover:underline">Buyer verification register →</Link>
              <Link to="/dashboard" className="text-accent hover:underline">Founder Centre →</Link>
            </div>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function ProfilesInventory() {
  const [filter, setFilter] = useState<AccountFilter>("all");
  const query = useQuery({
    queryKey: ["bridge-admin-profiles"],
    queryFn: () => listAdminProfiles(),
    retry: 1,
  });
  const profiles = query.data?.profiles ?? [];
  const visible = profiles.filter((profile) => {
    if (filter === "all") return true;
    if (filter === "internal") return Boolean(profile.internalRole);
    return !profile.internalRole && profile.accountType === filter;
  });

  if (query.isPending) return <p className="text-sm text-muted">Loading verified profile inventory…</p>;
  if (query.isError) return <p role="alert" className="rounded-sm border border-line p-4 text-sm">Profile inventory is unavailable. No zero count is assumed.</p>;

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="border-b border-line px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Account register</h3>
            <p className="mt-1 text-xs text-muted">Latest 200 verified Bridge profile records returned by the server. A legacy export entry is not a live account until matched.</p>
          </div>
          <span className="text-xs text-muted tabular-nums">{profiles.length} profiles returned</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Filter account register">
          {FILTERS.map((item) => {
            const count = profiles.filter((profile) => item.value === "all"
              ? true
              : item.value === "internal"
                ? Boolean(profile.internalRole)
                : !profile.internalRole && profile.accountType === item.value).length;
            return (
              <button key={item.value} type="button" aria-pressed={filter === item.value}
                onClick={() => setFilter(item.value)}
                className={filter === item.value
                  ? "rounded-full bg-fg px-3 py-2 text-xs font-semibold text-bg"
                  : "rounded-full border border-line px-3 py-2 text-xs font-medium text-muted hover:text-fg"}>
                {item.label} <span className="ml-1 tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
      </div>
      {visible.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
              <tr><th className="px-3 py-3">User</th><th className="px-3 py-3">Account</th><th className="px-3 py-3">Organization</th><th className="px-3 py-3">Internal role</th><th className="px-3 py-3">Verification</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((profile) => (
                <tr key={profile.userId}>
                  <td className="px-3 py-3"><p className="font-medium">{profile.displayName || "Name not supplied"}</p><p className="text-xs text-muted">{profile.email}</p></td>
                  <td className="px-3 py-3">{profile.accountType.replaceAll("_", " ")}</td>
                  <td className="px-3 py-3">{profile.organizationName || "Organization not linked"}</td>
                  <td className="px-3 py-3">{profile.internalRole?.replaceAll("_", " ") || "—"}</td>
                  <td className="px-3 py-3">{profile.emailVerified ? "Verified" : "Unverified"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="px-4 py-8 text-center text-sm text-muted">No live Bridge profiles are present in this account category in the returned window. This does not mean legacy candidates have been imported.</p>}
    </section>
  );
}
