import { createFileRoute } from "@tanstack/react-router";
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
          <div className="space-y-10">
            <section className="flex flex-col gap-5 border-b border-line pb-8 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm text-muted">Your studio workspace</p>
                <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                  Manage your titles.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
                  Prepare titles, manage rights and move approved content to delivery.
                </p>
              </div>
              <a
                href="#add-title"
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-strong"
              >
                + Add title
              </a>
            </section>

            <section id="add-title" className="scroll-mt-24">
              <div className="mb-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">New title</p>
                <h2 className="mt-1 font-display text-2xl font-semibold">Start with the basics</h2>
                <p className="mt-1 text-sm text-muted">
                  You can complete the remaining details inside the title workspace.
                </p>
              </div>
              <CreateTitleForm concise />
            </section>

            <section>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Library</p>
                  <h2 className="mt-1 font-display text-2xl font-semibold">Your titles</h2>
                </div>
              </div>
              <div className="mt-4">
                <TitleList empty="No titles yet. Add your first title above." />
              </div>
            </section>

            <section className="border-t border-line pt-8">
              <details className="group">
                <summary className="cursor-pointer list-none text-sm font-semibold text-fg">
                  Production services
                  <span className="ml-2 text-muted transition group-open:rotate-90">›</span>
                </summary>
                <div className="mt-5">
                  <StreamVistaOrders />
                </div>
              </details>
            </section>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
