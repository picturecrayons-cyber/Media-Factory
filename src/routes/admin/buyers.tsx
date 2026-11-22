import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listAdminProfiles } from "@/lib/bridge/profiles";

export const Route = createFileRoute("/admin/buyers")({ component: BuyerManagement });

const BOOKMYSHOW_CONTACTS = new Set([
  "amin.kapadia@bookmyshow.com",
  "raj.goradia@bookmyshow.com",
]);

function BuyerManagement() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Buyer Management">
          <BuyerDirectory />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function BuyerDirectory() {
  const query = useQuery({
    queryKey: ["bridge-admin-profiles"],
    queryFn: () => listAdminProfiles(),
    retry: 1,
  });
  const profiles = (query.data?.profiles ?? []).filter((profile) => profile.accountType === "buyer");
  const verifiedCount = profiles.filter((profile) => profile.emailVerified).length;
  const organizationCount = new Set(profiles.map((profile) => organizationLabel(profile)).filter(Boolean)).size;

  if (query.isPending) return <p role="status" className="text-sm text-muted">Loading Bridge Buyer profiles…</p>;
  if (query.isError) {
    return (
      <section role="alert" className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Buyer directory unavailable</h2>
        <p className="mt-2 text-sm text-muted">Bridge could not verify the Buyer profile inventory. No zero count or access status is assumed.</p>
      </section>
    );
  }

  const grouped = new Map<string, typeof profiles>();
  for (const profile of profiles) {
    const label = organizationLabel(profile) || "Organization not linked";
    grouped.set(label, [...(grouped.get(label) ?? []), profile]);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Super Admin · Buyer access</p>
        <h2 className="font-display text-3xl font-semibold">Buyer Management</h2>
        <p className="max-w-3xl text-sm text-muted">
          Read-only directory of Buyer profiles already present in Crayons Bridge. Each verified Buyer signs in to their own Buyer Dashboard at /buyer.
        </p>
      </header>

      <section aria-label="Buyer profile overview" className="grid gap-3 sm:grid-cols-3">
        <Metric label="Bridge Buyer profiles" value={String(profiles.length)} />
        <Metric label="Email verified" value={String(verifiedCount)} />
        <Metric label="Organization groups" value={String(organizationCount)} />
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h3 className="font-semibold">Access and organization rules</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Every Buyer keeps an individual login, profile and audit identity.</li>
          <li>Organization grouping does not automatically grant another member’s film access.</li>
          <li>Film visibility and licensing remain controlled by the existing title-level authorization and payment gates.</li>
          <li>This directory does not import legacy accounts or change roles, invitations, organizations or permissions.</li>
        </ul>
      </section>

      {profiles.length === 0 ? (
        <section className="rounded-xl border border-line bg-surface px-4 py-8 text-center">
          <h3 className="font-semibold">No Buyer profiles found in the current Bridge profile window</h3>
          <p className="mt-2 text-sm text-muted">Legacy export candidates are not treated as live Bridge users. Reconcile them against verified Bridge profiles before granting access.</p>
        </section>
      ) : (
        <div className="space-y-4">
          {[...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([organization, members]) => (
            <section key={organization} className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div>
                  <h3 className="font-semibold">{organization}</h3>
                  <p className="text-xs text-muted">{organization === "BookMyShow" ? "Super Admin-confirmed contact grouping · organization record still requires reconciliation" : "Organization label from the Bridge profile, or unlinked account"}</p>
                </div>
                <span className="text-xs text-muted">{members.length} {members.length === 1 ? "Buyer" : "Buyers"}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-4 py-3">Buyer</th>
                      <th className="px-4 py-3">Account</th>
                      <th className="px-4 py-3">Email verification</th>
                      <th className="px-4 py-3">Dashboard</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {members.sort((a, b) => a.displayName.localeCompare(b.displayName)).map((profile) => (
                      <tr key={profile.userId}>
                        <td className="px-4 py-3">
                          <p className="font-medium">{profile.displayName}</p>
                          <p className="text-xs text-muted">{profile.email}</p>
                        </td>
                        <td className="px-4 py-3">Buyer</td>
                        <td className="px-4 py-3">{profile.emailVerified ? "Verified" : "Unverified"}</td>
                        <td className="px-4 py-3"><span className="text-xs font-medium text-accent">/buyer · role-gated</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="border-t border-line pt-4 text-xs text-muted">
        The profile API returns the latest 200 Bridge profiles. This page is not a complete legacy Buyer export or film-to-Buyer mapping report.
      </p>
    </div>
  );
}

function organizationLabel(profile: {
  email: string;
  organizationName: string | null;
}) {
  if (BOOKMYSHOW_CONTACTS.has(profile.email.trim().toLowerCase())) return "BookMyShow";
  if (profile.organizationName?.trim()) return profile.organizationName.trim();
  return "";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-line bg-surface px-4 py-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </article>
  );
}
