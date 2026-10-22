import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm } from "@/components/bridge/title-desk";
import { TitleGallery, type LibraryStatus } from "@/components/bridge/title-gallery";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/lib/bridge/rbac";

export const Route = createFileRoute("/workspace")({ component: Workspace });

const STATUS_FILTERS: { label: string; value: LibraryStatus }[] = [
  { label: "All titles", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Preparing", value: "preparing" },
  { label: "Uploading", value: "uploading" },
  { label: "Live for Buyers", value: "live for buyers" },
];

function Workspace() {
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LibraryStatus>("all");
  const search = useMemo(() => query.trim(), [query]);

  return <RequireBridge>{(actor) => {
    const canCreate = hasPermission(actor, "title.create");
    return <BridgeShell actor={actor} title="Titles">
      <div className="space-y-7">
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Title library</h2>
              <p className="mt-2 text-sm text-muted">Find and open the original Bridge record for any film.</p>
            </div>
            {canCreate ? <Button onClick={() => setShowCreate(!showCreate)} className="rounded-full px-5">{showCreate ? "Cancel" : "New Title"}</Button> : null}
          </div>
          <label className="mt-6 block">
            <span className="sr-only">Search titles</span>
            <input aria-label="Search titles" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search films by title, language or year…" className="h-12 w-full rounded-xl border border-line-strong bg-elevated px-4 text-base outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20" />
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Filter titles by status">
            {STATUS_FILTERS.map((filter) => <button key={filter.value} type="button" onClick={() => setStatus(filter.value)} aria-pressed={status === filter.value} className={`rounded-full border px-4 py-2 text-sm font-medium transition ${status === filter.value ? "border-fg bg-fg text-bg" : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg"}`}>{filter.label}</button>)}
          </div>
        </section>
        {showCreate && canCreate ? <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><h3 className="font-display text-xl font-semibold">New Title</h3><p className="mb-4 mt-1 text-sm text-muted">Start with the essentials. You can complete metadata inside the Title Workspace.</p><CreateTitleForm concise /></section> : null}
        <section aria-label="Film gallery" className="rounded-2xl border border-line bg-surface p-4 sm:p-6 lg:p-7">
          <TitleGallery empty="No titles available for this workspace." query={search} status={status} />
        </section>
      </div>
    </BridgeShell>;
  }}</RequireBridge>;
}
