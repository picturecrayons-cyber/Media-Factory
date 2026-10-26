import { createFileRoute } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StudioStorage } from "@/components/bridge/studio-storage";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";

export const Route = createFileRoute("/creator")({ component: Creator });

function Creator() {
  return (
    <RequireBridge allow="creator">
      {(actor) => (
        <BridgeShell actor={actor} title="My titles">
          <div className="space-y-8">
            <CreateTitleForm defaults={{ producer: actor.displayName, language: "Malayalam", country: "India", contentType: "Film" }} />
            <TitleList empty="No titles yet." />
            <StudioStorage />
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
