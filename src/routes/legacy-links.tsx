import { createFileRoute } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { LegacyLinkReviewPanel } from "@/components/bridge/legacy-link-review-panel";

export const Route = createFileRoute("/legacy-links")({
  component: LegacyLinkReviewRoute,
});

function LegacyLinkReviewRoute() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Legacy Mapping Review">
          <LegacyLinkReviewPanel />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
