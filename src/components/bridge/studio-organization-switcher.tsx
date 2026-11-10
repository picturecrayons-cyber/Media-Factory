import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { setActiveStudioOrganization } from "@/lib/bridge/profiles";
import type { BridgeActor } from "@/lib/bridge/session";

export function StudioOrganizationSwitcher({ actor }: { actor: BridgeActor }) {
  const router = useRouter();
  const memberships = actor.organizationMemberships ?? [];
  const [selected, setSelected] = useState(actor.organizationId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (memberships.length === 0) {
    return (
      <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-sm font-semibold">No active Studio membership</p>
        <p className="mt-1 text-sm text-muted">
          Studio title creation is paused until an Admin confirms your organization membership.
        </p>
      </section>
    );
  }

  if (memberships.length === 1) {
    return (
      <p className="text-xs text-muted">
        Active Studio: <span className="font-medium text-fg">{memberships[0].organizationName}</span>
      </p>
    );
  }

  async function applySelection() {
    if (!selected || saving || selected === actor.organizationId) return;
    setSaving(true);
    setError(null);
    try {
      await setActiveStudioOrganization({ data: { organizationId: selected } });
      await router.invalidate();
    } catch {
      setError("Could not switch Studio. Confirm that this membership is still active.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Active Studio workspace</span>
          <select
            aria-label="Active Studio workspace"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            className="h-10 w-full rounded-lg border border-line-strong bg-elevated px-3 text-sm"
          >
            <option value="">Select a Studio</option>
            {memberships.map((membership) => (
              <option key={membership.organizationId} value={membership.organizationId}>
                {membership.organizationName} · {membership.membershipRole}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" disabled={!selected || selected === actor.organizationId || saving} onClick={() => void applySelection()}>
          {saving ? "Switching…" : "Use Studio"}
        </Button>
      </div>
      {error ? <p role="alert" className="mt-2 text-sm text-red-600">{error}</p> : null}
      <p className="mt-2 text-xs text-muted">
        Your memberships remain unchanged. This only selects the Studio context for new submissions.
      </p>
    </section>
  );
}
