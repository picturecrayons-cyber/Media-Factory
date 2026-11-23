import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import {
  decideBridgeOwnerSubmission,
  listBridgeAdminOwnerSubmissionQueue,
} from "@/lib/bridge/owner-submission-intake";

export const Route = createFileRoute("/admin/submissions")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: OwnerSubmissionQueue,
});

function OwnerSubmissionQueue() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Owner submissions">
          <SubmissionQueueBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function SubmissionQueueBody() {
  const queryClient = useQueryClient();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const queue = useQuery({
    queryKey: ["bridge-owner-submission-queue"],
    queryFn: () => listBridgeAdminOwnerSubmissionQueue(),
    refetchInterval: 30_000,
  });
  const decision = useMutation({
    mutationFn: (input: { titleId: string; decision: "ACCEPT" | "REQUEST_CORRECTIONS"; reason?: string }) =>
      decideBridgeOwnerSubmission({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bridge-owner-submission-queue"] });
    },
  });

  const submissions = queue.data?.submissions ?? [];
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Super Admin · Intake authority</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">New submissions</h2>
        <p className="mt-2 text-sm text-muted">
          Accept confirms intake only. It does not approve QC, Rights, Legal, Licensing, buyer access, or Loop publication.
        </p>
        <p className="mt-3 text-sm font-semibold">{queue.isPending ? "Loading…" : `${submissions.length} pending submission(s)`}</p>
      </section>

      {queue.isError ? (
        <section role="alert" className="rounded-xl border border-line bg-surface p-4 text-sm">
          Submission queue unavailable: {queue.error.message}
          <button className="ml-3 font-semibold underline" onClick={() => void queue.refetch()}>Retry</button>
        </section>
      ) : null}
      {decision.isError ? (
        <p role="alert" className="text-sm text-red-600">
          Decision failed: {decision.error instanceof Error ? decision.error.message : "Unknown error"}
        </p>
      ) : null}
      {decision.isSuccess ? <p role="status" className="text-sm text-muted">Intake decision recorded. Downstream approval gates remain unchanged.</p> : null}

      <section className="space-y-3">
        {submissions.map((item) => (
          <article key={item.title_id} className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{item.title_name}</h3>
                <p className="mt-1 text-xs text-muted">
                  {item.owner_display_name || item.owner_email || item.owner_user_id}
                  {item.owner_organization_name ? ` · ${item.owner_organization_name}` : ""}
                </p>
              </div>
              <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">{item.submission_status}</span>
            </div>
            <p className="mt-3 text-xs text-muted">
              Submitted {item.submitted_at ? new Date(item.submitted_at).toLocaleString() : "time unavailable"} · Title lifecycle: {item.title_status}
            </p>
            <label className="mt-4 block text-sm">
              Correction reason (required only when requesting corrections)
              <textarea
                value={reasons[item.title_id] ?? ""}
                onChange={(event) => setReasons((current) => ({ ...current, [item.title_id]: event.target.value }))}
                rows={3}
                maxLength={2000}
                className="mt-1 w-full rounded-lg border border-line bg-elevated p-3"
                placeholder="Describe the exact corrections required…"
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={decision.isPending}
                onClick={() => decision.mutate({ titleId: item.title_id, decision: "ACCEPT" })}
                className="rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50"
              >
                Accept intake
              </button>
              <button
                type="button"
                disabled={decision.isPending || !(reasons[item.title_id] ?? "").trim()}
                onClick={() => decision.mutate({ titleId: item.title_id, decision: "REQUEST_CORRECTIONS", reason: reasons[item.title_id]?.trim() })}
                className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Request corrections
              </button>
              <a href={`/title/${encodeURIComponent(item.title_id)}`} className="self-center text-sm font-semibold text-accent hover:underline">
                Open title workspace
              </a>
            </div>
          </article>
        ))}
        {!queue.isPending && !queue.isError && submissions.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">No pending owner submissions.</div>
        ) : null}
      </section>
    </div>
  );
}
