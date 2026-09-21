import { createFileRoute } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";

export const Route = createFileRoute("/creator")({ component: Creator });

function Creator() {
  return (
    <RequireBridge allow="creator">
      {(actor) => (
        <BridgeShell actor={actor} title="Creator desk">
          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted">
            Each film is one title record. Upload stays on private S3. Buyers cannot see drafts.
          </p>
          <CreateTitleForm />
          <h2 className="mt-10 font-display text-2xl">Your titles</h2>
          <div className="mt-4">
            <TitleList empty="No titles yet. Open a draft to begin the chain." />
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
