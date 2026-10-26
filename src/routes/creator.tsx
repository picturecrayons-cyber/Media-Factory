import { createFileRoute } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";

export const Route = createFileRoute("/creator")({ component: Creator });

function Creator() {
  return (
    <RequireBridge allow="creator">
      {(actor) => (
        <BridgeShell actor={actor} title="My titles">
          <CreateTitleForm defaults={{ producer: actor.displayName, language: "Malayalam", country: "India", contentType: "Film" }} />
          <section className="mt-6">
            <TitleList empty="No titles yet." />
          </section>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
