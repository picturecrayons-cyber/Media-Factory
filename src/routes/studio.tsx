import { createFileRoute } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StudioStorage } from "@/components/bridge/studio-storage";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";

export const Route = createFileRoute("/studio")({ component: Studio });

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="My titles">
          <div className="space-y-6">
            <CreateTitleForm defaults={{ producer: actor.organizationName || actor.displayName, language: "Malayalam", country: "India", contentType: "Film" }} />
            <TitleList empty="No titles yet." />
            <StudioStorage />
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
