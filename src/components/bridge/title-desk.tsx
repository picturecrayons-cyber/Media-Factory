import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/bridge/status-rail";
import { createTitle, listTitles } from "@/lib/bridge/titles";
import {
  archiveDraftTitleAction,
  listArchivableDraftIds,
  listMyArchivedDrafts,
  restoreArchivedDraftAction,
} from "@/lib/bridge/title-archive-api";
import { BRIDGE_LOOP_LANES } from "@/lib/bridge/loop-lanes";

export function TitleList({ empty, query = "" }: { empty: string; query?: string }) {
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const eligibleQ = useQuery({ queryKey: ["bridge-archivable-draft-ids"], queryFn: () => listArchivableDraftIds() });
  const archivedQ = useQuery({
    queryKey: ["bridge-archived-drafts"],
    queryFn: () => listMyArchivedDrafts(),
    enabled: showArchived,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
    void qc.invalidateQueries({ queryKey: ["bridge-archived-drafts"] });
    void qc.invalidateQueries({ queryKey: ["bridge-archivable-draft-ids"] });
    void qc.invalidateQueries({ queryKey: ["my-story-concepts"] });
  };
  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveDraftTitleAction({ data: { id } }),
    onSuccess: () => { toast("Draft archived"); refresh(); },
    onError: (error) => toast(error instanceof Error ? error.message : "Could not archive this draft"),
  });
  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreArchivedDraftAction({ data: { id } }),
    onSuccess: () => { toast("Draft restored"); refresh(); },
    onError: (error) => toast(error instanceof Error ? error.message : "Could not restore this draft"),
  });
  const titles = (titlesQ.data?.titles ?? []).filter((t) =>
    !query || `${t.name} ${t.language} ${t.year ?? ""}`.toLowerCase().includes(query.toLowerCase())
  );
  const eligible = new Set(eligibleQ.data?.ids ?? []);

  if (titlesQ.isPending) return <p className="text-sm text-muted">Loading titles…</p>;
  if (titlesQ.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-accent">
        <p>Could not load titles.</p>
        <Button type="button" onClick={() => void titlesQ.refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Only untouched drafts with no linked media or workflow records can be archived.</p>
        <Button type="button" variant="outline" onClick={() => setShowArchived((value) => !value)}>
          {showArchived ? "Hide archived" : "Archived drafts"}
        </Button>
      </div>
      {showArchived && (
        <div className="rounded-lg border border-line p-3">
          <h3 className="mb-2 text-sm font-semibold">Archived drafts</h3>
          {archivedQ.isPending ? <p className="text-sm text-muted">Loading archived drafts…</p> :
            archivedQ.isError ? <p className="text-sm text-accent">Could not load archived drafts.</p> :
            (archivedQ.data?.titles ?? []).length === 0 ? <p className="text-sm text-muted">No archived drafts.</p> :
            <ul className="divide-y divide-line">
              {(archivedQ.data?.titles ?? []).map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <Link to="/title/$id" params={{ id: t.id }} className="min-w-0 flex-1">
                    <span className="font-medium">{t.name}</span>
                    <span className="ml-2 text-xs text-muted">Archived</span>
                  </Link>
                  <Button type="button" size="sm" variant="outline" disabled={restoreMutation.isPending}
                    onClick={() => restoreMutation.mutate(t.id)}>Restore</Button>
                </li>
              ))}
            </ul>
          }
        </div>
      )}
      {!titles.length ? <p className="text-sm text-muted">{empty}</p> : (
        <ul className="divide-y divide-line rounded-sm border border-line">
          {titles.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <Link to="/title/$id" params={{ id: t.id }} className="min-w-0 flex-1 rounded-md py-1 hover:text-accent">
                <p className="font-medium">{t.name}</p>
                <p className="text-sm text-muted">
                  {t.contentType ? `${t.contentType} · ` : ""}{t.language}{t.year ? ` · ${t.year}` : ""}
                </p>
              </Link>
              <div className="flex shrink-0 items-center gap-3">
                <StatusChip status={t.status} />
                {t.status === "DRAFT" && eligible.has(t.id) && (
                  <Button type="button" size="sm" variant="outline" disabled={archiveMutation.isPending}
                    onClick={() => {
                      const confirmed = window.confirm(`Archive “${t.name}”? It will disappear from your active lists and can be restored later. No media or workflow record will be deleted.`);
                      if (confirmed) archiveMutation.mutate(t.id);
                    }}>Archive</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

