import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { DitAgentDesk } from "@/components/bridge/dit-agent-desk";

export const Route = createFileRoute("/studio-dit")({ component: StudioDit });

function StudioDit() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Production & DIT">
          <div className="mx-auto max-w-5xl space-y-5 pb-16">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Primary Studio workspace</p>
                <h2 className="mt-1 font-display text-2xl font-semibold">Production &amp; DIT</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted">Register original camera cards, verify source manifests and confirm independent Primary and Recovery Vault copies before DIT sign-off.</p>
              </div>
              <Link to="/studio" className="text-sm font-semibold text-accent hover:underline">← Studio Home</Link>
            </div>
            <DitAgentDesk actor={actor} />
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
