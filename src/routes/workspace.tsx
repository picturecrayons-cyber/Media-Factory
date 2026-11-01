import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/lib/bridge/rbac";

export const Route = createFileRoute("/workspace")({ component: Workspace });

function Workspace() {
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const search = useMemo(() => query.trim(), [query]);

  return (
    <RequireBridge allow="workspace">
      {(actor) => {
        const canCreate = hasPermission(actor, "title.create");

        return (
          <BridgeShell actor={actor} title="Titles">
            <div className="space-y-6">
              <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-7">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-line bg-elevated px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                        Private workspace
                      </span>
                      <span className="text-xs text-muted">Role-controlled access</span>
                    </div>
                    <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                      Your title library
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      Find a title, review its current workflow state, and continue from its canonical Bridge workspace.
                    </p>
                  </div>
                  {canCreate ? (
                    <Button
                      onClick={() => setShowCreate((value) => !value)}
                      className="h-10 shrink-0 rounded-full px-5"
                    >
                      {showCreate ? "Cancel" : "＋ New title"}
                    </Button>
                  ) : null}
                </div>

                <div className="mt-6 border-t border-line pt-5">
                  <label htmlFor="title-search" className="mb-2 block text-xs font-semibold text-muted">
                    Search titles
                  </label>
                  <input
                    id="title-search"
                    aria-label="Search titles"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by title name…"
                    className="h-11 w-full rounded-xl border border-line-strong bg-elevated px-4 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15 sm:max-w-xl"
                  />
                </div>
              </section>

              {showCreate && canCreate ? (
                <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
                  <div className="mb-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                      Start a title record
                    </p>
                    <h3 className="mt-2 font-display text-xl font-semibold">New title</h3>
                    <p className="mt-1 text-sm text-muted">
                      Capture the essentials first. Complete the remaining metadata in the title workspace.
                    </p>
                  </div>
                  <CreateTitleForm concise />
                </section>
              ) : null}

              <section className="overflow-hidden rounded-2xl border border-line bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
                  <div>
                    <h3 className="font-display text-lg font-semibold">All titles</h3>
                    <p className="mt-1 text-xs text-muted">
                      Open a record to view files, metadata, QC, rights and delivery information.
                    </p>
                  </div>
                  {search ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent hover:text-fg"
                    >
                      Clear search
                    </button>
                  ) : null}
                </div>
                <div className="p-4 sm:p-6">
                  <TitleList empty="No titles available for this workspace." query={search} />
                </div>
              </section>

              <p className="px-1 text-xs leading-5 text-muted">
                Bridge is the authorization workspace. A title appears on Crayons Loop only after the required approval, publication authorization and active publication conditions are satisfied.
              </p>
            </div>
          </BridgeShell>
        );
      }}
    </RequireBridge>
  );
}
