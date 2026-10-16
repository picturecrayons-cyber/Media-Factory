import { createFileRoute } from "@tanstack/react-router";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";
import { StreamVistaOrders } from "@/components/bridge/streamvista-orders";
import { Desk } from "./creator";

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
            <section id="add-title" aria-labelledby="add-title-heading">
              <h2 id="add-title-heading" className="text-lg font-semibold">Add title</h2>
              <p className="mt-1 text-sm text-muted">
                New titles start as drafts. Creating a title does not publish it or make it visible to buyers.
              </p>
              <div className="mt-3"><CreateTitleForm concise /></div>
            </section>
            <section aria-labelledby="studio-slate-heading">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 id="studio-slate-heading" className="text-lg font-semibold">Studio slate</h2>
                  <p className="mt-1 text-sm text-muted">
                    Open a title to continue its workflow. Rights, QC and publication checks remain required.
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <TitleList
                  empty="No studio titles yet. Add your first title above to start a draft."
                  showNextStep
                />
              </div>
            </section>
            <section aria-labelledby="production-services-heading">
              <h2 id="production-services-heading" className="text-lg font-semibold">Production services</h2>
              <p className="mt-1 text-sm text-muted">
                Optional service requests are managed separately and do not grant licensing or publishing approval.
              </p>
              <div className="mt-3"><StreamVistaOrders /></div>
            </section>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
