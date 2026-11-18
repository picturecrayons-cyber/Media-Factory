import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listAdminProfiles } from "@/lib/bridge/profiles";

export const Route = createFileRoute("/buyer-management")({ component: BuyerManagement });

function BuyerManagement() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Buyer Management">
          <BuyerManagementBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function BuyerManagementBody() {
  const profilesQ = useQuery({
    queryKey: ["bridge-admin-profiles"],
    queryFn: () => listAdminProfiles(),
    retry: 1,
  });
  const buyers = (profilesQ.data?.profiles ?? []).filter((profile) => profile.accountType === "buyer");
  const organizationNames = new Set(
    buyers.map((buyer) => buyer.organizationName?.trim()).filter((name): name is string => Boolean(name)),
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Crayons Bridge · Super Admin</p>
        <h2 className="mt-1 font-display text-3xl font-semibold">Independent Buyer accounts</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Each Buyer is an independent account. Account creation or Buyer role assignment never grants title access,
          licensing rights, delivery access or playback entitlement.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <Metric label="Buyer user accounts" value={profilesQ.isPending || profilesQ.isError ? "—" : String(buyers.length)} />
        <Metric label="Recorded organization names" value={profilesQ.isPending || profilesQ.isError ? "—" : String(organizationNames.size)} />
      </section>

      {profilesQ.isPending ? (
        <p className="text-sm text-muted">Loading Buyer account records…</p>
      ) : profilesQ.isError ? (
        <section role="alert" className="rounded-sm border border-line p-5 text-sm">
          Buyer account data could not be loaded. No empty-state or zero count is assumed.
        </section>
      ) : (
        <section className="overflow-hidden rounded-sm border border-line">
          <div className="border-b border-line px-4 py-3">
            <h3 className="font-semibold">Buyer accounts</h3>
            <p className="mt-1 text-xs text-muted">Read-only account inventory from the existing Bridge profile registry.</p>
          </div>
          {buyers.length ? (
            <ul className="divide-y divide-line">
              {buyers.map((buyer) => (
                <li key={buyer.userId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{buyer.organizationName || buyer.displayName || "Buyer account"}</p>
                    <p className="mt-1 text-xs text-muted">{buyer.displayName} · {buyer.email}</p>
                  </div>
                  <span className="text-xs text-muted">{buyer.emailVerified ? "Email verified" : "Email not verified"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted">
              No Buyer user profiles are currently registered. Crayons Loop remains Buyer No. 1 in the architecture;
              future Buyer onboarding stays separately controlled.
            </p>
          )}
        </section>
      )}

      <section className="rounded-sm border border-line bg-surface px-4 py-4">
        <h3 className="font-semibold">Authorization boundary</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          This initial view is intentionally read-only. Buyer organizations, memberships, contracts, title grants,
          delivery packages, payments and audit history must remain separately scoped and server-authorized.
          Buyer A/B/C/D are illustrative labels only, never permanent account IDs.
        </p>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-line px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
