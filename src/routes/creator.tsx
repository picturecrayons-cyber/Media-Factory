import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";

export const Route = createFileRoute("/creator")({ component: Creator });

function Creator() {
  return (
    <RequireBridge allow="creator">
      {(actor) => (
        <BridgeShell actor={actor} title="Creator">
          <section>
            <h2 className="text-lg font-semibold">New title</h2>
            <div className="mt-3"><CreateTitleForm /></div>
          </section>
          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Titles</h2>
              <Link to="/gallery" className="text-sm text-muted">Library</Link>
            </div>
            <TitleList empty="No titles yet." />
          </section>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
