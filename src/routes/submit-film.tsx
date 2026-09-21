import { createFileRoute } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { SubmitFilmForm } from "@/components/bridge/submit-film-form";

export const Route = createFileRoute("/submit-film")({ component: SubmitFilm });

function SubmitFilm() {
  return (
    <RequireBridge allow="filmmaker">
      {(actor) => (
        <BridgeShell actor={actor} kicker="Filmmaker" title="Submit film">
          <p className="mb-5 max-w-2xl text-sm leading-relaxed text-muted">
            One title record. Submission is not Loop publication. Rights, deal and capture still gate delivery.
          </p>
          <SubmitFilmForm />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
