import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";
import { StreamVistaOrders } from "@/components/bridge/streamvista-orders";

export const Route = createFileRoute("/studio")({ component: Studio });

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio">
          <div className="space-y-8">
            <section id="add-title">
              <h2 className="text-lg font-semibold">New title</h2>
              <div className="mt-3"><CreateTitleForm concise /></div>
            </section>
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Studio slate</h2>
                <Link to="/gallery" className="text-sm text-muted">Library</Link>
              </div>
              <TitleList empty="No titles yet. Add the first title." />
            </section>
            <section>
              <h2 className="text-lg font-semibold">Production services</h2>
              <div className="mt-3"><StreamVistaOrders /></div>
            </section>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
