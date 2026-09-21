import { createFileRoute } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { SubmitFilmForm } from "@/components/bridge/submit-film-form";

export const Route = createFileRoute("/studio/submit-film")({ component: StudioSubmit });

function StudioSubmit() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} kicker="Studio" title="Submit film">
          <p className="mb-5 max-w-2xl text-sm leading-relaxed text-muted">
            Studio slate uses the same submission record as independent creators.
          </p>
          <SubmitFilmForm />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
