import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import {
  createMembershipPlanVersion,
  getMembershipControlPlane,
  grantBridgeMembership,
  updateBridgeMembershipStatus,
} from "@/lib/bridge/membership";

export const Route = createFileRoute("/admin/memberships")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: MembershipControlPage,
});

type AccountKey = "independent_creator" | "studio" | "buyer" | "investor";

const ACCOUNT_LABELS: Record<string, string> = {
  independent_creator: "Creator",
  studio: "Studio",
  buyer: "Buyer",
  investor: "Investor",
};

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function MembershipControlPage() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Membership & commercial controls">
          <MembershipControlBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function MembershipControlBody() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["bridge-membership-control-plane"],
    queryFn: () => getMembershipControlPlane(),
    retry: false,
  });
  const [displayName, setDisplayName] = useState("Bridge Membership");
  const [trialDays, setTrialDays] = useState("30");
  const [billingInterval, setBillingInterval] = useState<"unconfigured" | "monthly" | "annual">("unconfigured");
  const [priceRupees, setPriceRupees] = useState("");
  const [gstPercent, setGstPercent] = useState("");
  const [graceDays, setGraceDays] = useState("");
  const [accountTypes, setAccountTypes] = useState<AccountKey[]>(["independent_creator", "studio", "buyer", "investor"]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [grantNote, setGrantNote] = useState("");
  const [suspensionReason, setSuspensionReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["bridge-membership-control-plane"] });
  };
  const planMutation = useMutation({
    mutationFn: (data: {
      displayName: string; accountTypes: AccountKey[]; trialDays: number;
      billingInterval: "unconfigured" | "monthly" | "annual";
      priceAmountPaise: number | null; gstBasisPoints: number | null; gracePeriodDays: number | null;
    }) => createMembershipPlanVersion({ data }),
    onSuccess: async () => { setError(null); setNotice("New versioned plan saved. Billing remains disabled."); await refresh(); },
    onError: (e) => { setNotice(null); setError(e instanceof Error ? e.message : "Plan could not be saved."); },
  });
  const grantMutation = useMutation({
    mutationFn: (data: { userId: string; planId: string; grantType: "trial" | "complimentary"; note?: string }) =>
      grantBridgeMembership({ data }),
    onSuccess: async (result) => {
      setError(null); setNotice(`Membership created: ${result.status}.`);
      setGrantNote(""); setSelectedUserId(""); await refresh();
    },
    onError: (e) => { setNotice(null); setError(e instanceof Error ? e.message : "Membership could not be created."); },
  });
  const statusMutation = useMutation({
    mutationFn: (data: { membershipId: string; action: "suspend" | "reinstate"; reason?: string }) =>
      updateBridgeMembershipStatus({ data }),
    onSuccess: async (result) => {
      setError(null); setNotice(`Membership status updated to ${result.status}.`);
      setSuspensionReason(""); await refresh();
    },
    onError: (e) => { setNotice(null); setError(e instanceof Error ? e.message : "Membership status could not be updated."); },
  });

  const data = query.data;
  const plans = data?.plans ?? [];
  const activePlans = plans.filter((p: any) => p.plan_status === "active");
  const defaultPlanId = activePlans[0]?.id ?? "";
  const planId = selectedPlanId || defaultPlanId;
  const selectedPlan = activePlans.find((plan: any) => plan.id === planId);

  function toggleAccountType(value: AccountKey, checked: boolean) {
    setAccountTypes((current) => checked
      ? [...current, value]
      : current.filter((item) => item !== value));
  }

  function savePlan(event: FormEvent) {
    event.preventDefault();
    setError(null); setNotice(null);
    const parsedPrice = priceRupees.trim() ? Math.round(Number(priceRupees) * 100) : null;
    const parsedGst = gstPercent.trim() ? Math.round(Number(gstPercent) * 100) : null;
    const parsedGrace = graceDays.trim() ? Number(graceDays) : null;
    if (billingInterval === "unconfigured" && parsedPrice !== null) {
      setError("Keep price blank while billing cadence is unconfigured."); return;
    }
    if (billingInterval !== "unconfigured" && parsedPrice === null) {
      setError("Enter a price for the selected billing cadence."); return;
    }
    if (priceRupees.trim() && (!Number.isFinite(parsedPrice) || parsedPrice! < 0)) {
      setError("Enter a valid non-negative price."); return;
    }
    if (gstPercent.trim() && (!Number.isFinite(parsedGst) || parsedGst! < 0 || parsedGst! > 10000)) {
      setError("Enter a valid GST percentage."); return;
    }
    if (graceDays.trim() && (!Number.isInteger(parsedGrace) || parsedGrace! < 0 || parsedGrace! > 90)) {
      setError("Grace period must be between 0 and 90 days."); return;
    }
    planMutation.mutate({
      displayName: displayName.trim(),
      accountTypes,
      trialDays: Number(trialDays),
      billingInterval,
      priceAmountPaise: parsedPrice,
      gstBasisPoints: parsedGst,
      gracePeriodDays: parsedGrace,
    });
  }

  if (query.isPending) return <p className="text-sm text-muted">Loading membership control plane…</p>;
  if (query.isError || !data) return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <p role="alert" className="text-sm text-accent">Membership control data could not be loaded. No zero values are assumed.</p>
      <Button className="mt-3" variant="outline" onClick={() => void query.refetch()}>Retry</Button>
    </section>
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Bridge account membership</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">Commercial control plane</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted">
              Separate platform access from Loop subscriptions and title licensing. Super Admin grants, suspensions,
              plan versions and trial periods are recorded in the Bridge membership ledger.
            </p>
          </div>
          <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">Billing disabled</span>
        </div>
        {(error || notice) ? (
          <p role={error ? "alert" : "status"} className={`mt-4 rounded-xl border p-3 text-sm ${error ? "border-red-500/30 text-red-600" : "border-line text-muted"}`}>
            {error || notice}
          </p>
        ) : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Membership records" value={data.counts.total} />
          <Metric label="Trialing" value={data.counts.trialing} />
          <Metric label="Active" value={data.counts.active} />
          <Metric label="Complimentary" value={data.counts.complimentary} />
          <Metric label="Suspended / expired" value={data.counts.suspended + data.counts.expired} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <form onSubmit={savePlan} className="space-y-4 rounded-2xl border border-line bg-surface p-5">
          <div>
            <h3 className="font-display text-xl font-semibold">Plan configuration</h3>
            <p className="mt-1 text-sm text-muted">Every save creates a new immutable commercial version. Billing cannot be enabled here.</p>
          </div>
          <label className="block text-sm font-medium">Plan name
            <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-elevated px-3" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">Trial days
              <input type="number" min="0" max="90" required value={trialDays} onChange={(e) => setTrialDays(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-elevated px-3" />
            </label>
            <label className="block text-sm font-medium">Billing cadence
              <select value={billingInterval} onChange={(e) => setBillingInterval(e.target.value as typeof billingInterval)} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-elevated px-3">
                <option value="unconfigured">Not configured</option>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm font-medium">Price (₹)
              <input type="number" min="0" step="0.01" disabled={billingInterval === "unconfigured"} value={priceRupees} onChange={(e) => setPriceRupees(e.target.value)} placeholder="Not set" className="mt-1.5 h-10 w-full rounded-lg border border-line bg-elevated px-3 disabled:opacity-50" />
            </label>
            <label className="block text-sm font-medium">GST (%)
              <input type="number" min="0" max="100" step="0.01" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)} placeholder="Not set" className="mt-1.5 h-10 w-full rounded-lg border border-line bg-elevated px-3" />
            </label>
            <label className="block text-sm font-medium">Grace days
              <input type="number" min="0" max="90" value={graceDays} onChange={(e) => setGraceDays(e.target.value)} placeholder="Not set" className="mt-1.5 h-10 w-full rounded-lg border border-line bg-elevated px-3" />
            </label>
          </div>
          <fieldset>
            <legend className="text-sm font-medium">Eligible account types</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {Object.entries(ACCOUNT_LABELS).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={accountTypes.includes(value as AccountKey)} onChange={(e) => toggleAccountType(value as AccountKey, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-muted">Trial duration follows the selected plan. Pricing cadence, GST and grace period remain unconfigured until approved.</p>
          <Button type="submit" disabled={planMutation.isPending || accountTypes.length === 0}>
            {planMutation.isPending ? "Saving version…" : "Save new plan version"}
          </Button>
        </form>

        <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
          <div>
            <h3 className="font-display text-xl font-semibold">Grant membership</h3>
            <p className="mt-1 text-sm text-muted">Assign an existing Bridge profile a trial or complimentary access. This does not charge the account.</p>
          </div>
          <label className="block text-sm font-medium">Account without membership
            <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-elevated px-3">
              <option value="">Select account</option>
              {data.eligibleProfiles.map((profile: any) => (
                <option key={profile.user_id} value={profile.user_id}>
                  {profile.display_name || profile.email} · {ACCOUNT_LABELS[profile.account_type] || profile.account_type}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">Plan
            <select value={planId} onChange={(e) => setSelectedPlanId(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-elevated px-3">
              <option value="">Select active plan</option>
              {activePlans.map((plan: any) => <option key={plan.id} value={plan.id}>{plan.display_name} · v{plan.version} · {plan.trial_days}-day trial</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">Admin note (optional)
            <input value={grantNote} onChange={(e) => setGrantNote(e.target.value)} maxLength={500} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-elevated px-3" placeholder="Reason / reference" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!selectedUserId || !planId || grantMutation.isPending} onClick={() => grantMutation.mutate({ userId: selectedUserId, planId, grantType: "trial", note: grantNote || undefined })}>
              Grant {selectedPlan?.trial_days ?? "—"}-day trial
            </Button>
            <Button type="button" variant="outline" disabled={!selectedUserId || !planId || grantMutation.isPending} onClick={() => grantMutation.mutate({ userId: selectedUserId, planId, grantType: "complimentary", note: grantNote || undefined })}>
              Grant complimentary access
            </Button>
          </div>
          {data.eligibleProfiles.length === 0 ? <p className="text-xs text-muted">No eligible profiles are currently awaiting membership assignment.</p> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-semibold">Membership register</h3>
            <p className="mt-1 text-sm text-muted">Up to 500 most recently updated membership records. Trial expiry is calculated from its end timestamp.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => void query.refetch()}>Refresh</Button>
        </div>
        {data.memberships.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No membership records yet. Existing profiles are not automatically charged or enrolled.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead><tr className="border-b border-line text-xs text-muted">
                <th className="px-3 py-3 font-medium">Account</th><th className="px-3 py-3 font-medium">Type</th>
                <th className="px-3 py-3 font-medium">Plan</th><th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Trial ends</th><th className="px-3 py-3 font-medium">Updated</th><th className="px-3 py-3 font-medium">Action</th>
              </tr></thead>
              <tbody>
                {data.memberships.map((membership: any) => (
                  <tr key={membership.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-3"><p className="font-medium">{membership.display_name || membership.email}</p><p className="text-xs text-muted">{membership.email}</p></td>
                    <td className="px-3 py-3">{ACCOUNT_LABELS[membership.account_type] || membership.account_type}</td>
                    <td className="px-3 py-3">{membership.plan_name} · v{membership.plan_version}</td>
                    <td className="px-3 py-3"><span className="rounded-full border border-line px-2 py-1 text-xs">{membership.effective_status.replaceAll("_", " ")}</span></td>
                    <td className="px-3 py-3">{dateLabel(membership.trial_ends_at)}</td>
                    <td className="px-3 py-3">{dateLabel(membership.updated_at)}</td>
                    <td className="px-3 py-3">
                      {membership.effective_status === "suspended" ? (
                        <Button size="sm" variant="outline" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ membershipId: membership.id, action: "reinstate" })}>Reinstate</Button>
                      ) : ["trialing", "active", "complimentary", "past_due"].includes(membership.effective_status) ? (
                        <Button size="sm" variant="outline" disabled={statusMutation.isPending || !suspensionReason.trim()} onClick={() => statusMutation.mutate({ membershipId: membership.id, action: "suspend", reason: suspensionReason.trim() })}>Suspend</Button>
                      ) : <span className="text-xs text-muted">No action</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <label className="mt-4 block max-w-xl text-sm font-medium">Suspension reason (required)
          <input value={suspensionReason} onChange={(e) => setSuspensionReason(e.target.value)} maxLength={500} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-elevated px-3" placeholder="Enter reason before selecting Suspend" />
        </label>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="font-semibold">Commercial safeguards</h3>
        <ul className="mt-2 grid gap-2 text-sm text-muted md:grid-cols-2">
          <li>• Billing is hard-disabled in the database and server actions.</li>
          <li>• Plan changes create a new version; prior versions remain recorded.</li>
          <li>• Trial and complimentary grants require Super Admin authorization.</li>
          <li>• Suspensions require a reason and create an audit event.</li>
          <li>• Payment ledger is separate and has no collection endpoint enabled.</li>
          <li>• This desk does not modify Loop subscriptions or title entitlements.</li>
        </ul>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-line bg-elevated p-4"><p className="text-xs text-muted">{label}</p><p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p></div>;
}
