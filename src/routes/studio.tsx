import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";
import { StoryConceptForm } from "@/components/bridge/story-concept-form";
import { MyStoryConcepts } from "@/components/bridge/my-story-concepts";
import { StreamVistaOrders } from "@/components/bridge/streamvista-orders";
import { Button } from "@/components/ui/button";
import { STORY_CONCEPT_ENABLED } from "@/lib/bridge/story-concept";

export const Route = createFileRoute("/studio")({ component: Studio });

type SubmissionPath = "none" | "finished_film" | "story_concept";

function Studio() {
  const [path, setPath] = useState<SubmissionPath>("none");

  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio">
          <div className="mx-auto max-w-3xl space-y-10 px-1 pb-16">
            <header className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl tracking-tight sm:text-3xl">Studio</h1>
                  <p className="mt-1 text-sm text-muted">
                    Your titles, rights, and delivery in one place.
                  </p>
                </div>
                {path === "none" && (
                  <Button
                    type="button"
                    onClick={() => setPath("finished_film")}
                    className="rounded-full px-6"
                  >
                    + New submission
                  </Button>
                )}
              </div>

              {path !== "none" && (
                <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium">Choose submission type</p>
                    <button
                      type="button"
                      onClick={() => setPath("none")}
                      className="text-xs text-muted underline-offset-2 hover:underline"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setPath("finished_film")}
                      className={`rounded-xl border p-4 text-left transition ${
                        path === "finished_film"
                          ? "border-fg bg-fg/5"
                          : "border-line hover:border-line-strong"
                      }`}
                    >
                      <p className="font-medium">Finished Film</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted">
                        Free path. Record → QC → Rights → License → Deliver.
                      </p>
                    </button>

                    {STORY_CONCEPT_ENABLED ? (
                      <button
                        type="button"
                        onClick={() => setPath("story_concept")}
                        className={`rounded-xl border p-4 text-left transition ${
                          path === "story_concept"
                            ? "border-fg bg-fg/5"
                            : "border-line hover:border-line-strong"
                        }`}
                      >
                        <p className="font-medium">Story / Concept</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted">
                          Network submission. Admin curation → buyers & investors.
                        </p>
                      </button>
                    ) : (
                      <div className="rounded-xl border border-dashed border-line p-4 text-left opacity-60">
                        <p className="font-medium">Story / Concept</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted">
                          Coming soon. Enable STORY_CONCEPT_ENABLED after migration.
                        </p>
                      </div>
                    )}
                  </div>

                  {path === "finished_film" && (
                    <div className="mt-6 border-t border-line pt-6">
                      <h2 className="text-sm font-semibold">Add finished title</h2>
                      <div className="mt-3">
                        <CreateTitleForm concise />
                      </div>
                      <p className="mt-3 text-xs text-muted">
                        Prefer the full rights-ready form?{" "}
                        <Link to="/submit-film" className="underline underline-offset-2">
                          Open detailed submission
                        </Link>
                      </p>
                    </div>
                  )}

                  {path === "story_concept" && STORY_CONCEPT_ENABLED && (
                    <div className="mt-6 border-t border-line pt-6">
                      <h2 className="text-sm font-semibold">Story / Concept</h2>
                      <p className="mt-1 text-xs text-muted">
                        Submit for admin curation. Not published to Loop automatically.
                      </p>
                      <div className="mt-4">
                        <StoryConceptForm />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </header>

            <MyStoryConcepts />

            <section>
              <h2 className="mb-3 text-lg font-semibold">Your titles</h2>
              <TitleList empty="No titles yet. Start with a new submission." />
            </section>

            <section className="border-t border-line pt-8">
              <h2 className="text-sm font-semibold text-muted">Production services</h2>
              <p className="mt-1 text-xs text-muted">Optional. Separate from licensing.</p>
              <div className="mt-4">
                <StreamVistaOrders />
              </div>
            </section>
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
