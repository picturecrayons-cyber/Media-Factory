import { createFileRoute } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";

export const Route = createFileRoute("/studio")({ component: Studio });

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title={actor.organizationName ?? "Studio desk"}>
          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted">
            Studio slate uses the same title record and lifecycle as independent creators.
          </p>
          <CreateTitleForm />
          <h2 className="mt-10 font-display text-2xl">Slate</h2>
          <div className="mt-4">
            <TitleList empty="No titles on this slate yet." />
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
