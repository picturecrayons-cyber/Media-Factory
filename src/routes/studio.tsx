import { createFileRoute } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";
import { StreamVistaOrders } from "@/components/bridge/streamvista-orders";
import { Desk } from "./creator";
import { InsuranceReadinessPanel } from "@/components/bridge/insurance-readiness-panel";

export const Route = createFileRoute("/studio")({ component: Studio });

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio desk">
          <div className="space-y-8">
            <Desk
              role="Studio"
              scope="Studio-owned titles only. Same rights gate as creators. No buyer catalog access."
              opportunity="Submit a slate. Production services stay optional and separate from licensing."
              steps={["Add title", "Prepare assets", "Rights clearance", "License", "Deliver"]}
            />
            <InsuranceReadinessPanel audience="Studio" />\n            <section id="add-title">
              <h2 className="text-lg font-semibold">Add title</h2>
              <div className="mt-3"><CreateTitleForm concise /></div>
            </section>
            <section>
              <h2 className="text-lg font-semibold">Studio slate</h2>
              <div className="mt-3"><TitleList empty="No titles yet. Add the first title." /></div>
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
