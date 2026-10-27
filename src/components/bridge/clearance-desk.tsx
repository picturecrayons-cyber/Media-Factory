import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listClearance, setClearance } from "@/lib/bridge/clearance";
import { toast } from "sonner";

export function ClearanceDesk() {
  const qc = useQueryClient();
  const queue = useQuery({
    queryKey: ["bridge-clearance"],
    queryFn: () => listClearance(),
  });
  const act = useMutation({
    mutationFn: (input: { titleId: string; step: "check" | "verify" | "certify" }) => setClearance({ data: input }),
    onSuccess: async (result) => {
      toast.success(result.word);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["bridge-clearance"] }),
        qc.invalidateQueries({ queryKey: ["bridge-titles"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update"),
  });

  const titles = queue.data?.titles ?? [];
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">QC</h2>
      <p className="text-sm text-muted">Submitted titles. Check the files, watch the preview, then pass QC. The studio gets a mail at each step.</p>
      {queue.isPending ? <p className="text-sm text-muted">Loading…</p> : null}
      {queue.isError ? <p role="alert" className="text-sm text-red-700">QC queue unavailable.</p> : null}
      {!queue.isPending && !titles.length ? <p className="text-sm text-muted">Nothing is waiting.</p> : null}
      <ul className="space-y-3">
        {titles.map((title) => (
          <li key={title.id} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title.status}</p>
                <p className="mt-1 text-base font-semibold">{title.name}</p>
                {title.facts ? <p className="text-sm text-muted">{title.facts}</p> : null}
              </div>
              <Link to="/title/$id" params={{ id: title.id }} className="rounded-full border border-line px-4 py-2 text-sm font-semibold">Preview</Link>
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {title.checks.map((item) => (
                <li key={item.label} className="text-sm">
                  <span className={item.ok ? "font-semibold" : "text-muted"}>{item.ok ? "Yes" : "No"}</span>
                  <span className="text-muted"> · {item.label}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={act.isPending || title.checked || !title.ready} onClick={() => act.mutate({ titleId: title.id, step: "check" })} className="rounded-full border border-line px-4 py-2 text-sm font-semibold disabled:opacity-40">
                {title.checked ? "Checked" : "Check"}
              </button>
              <button type="button" disabled={act.isPending || !title.checked || title.verified} onClick={() => act.mutate({ titleId: title.id, step: "verify" })} className="rounded-full border border-line px-4 py-2 text-sm font-semibold disabled:opacity-40">
                {title.verified ? "Verified" : "Verify"}
              </button>
              <button type="button" disabled={act.isPending || !title.verified || title.certified} onClick={() => act.mutate({ titleId: title.id, step: "certify" })} className="rounded-full bg-[#102433] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                {title.certified ? "QC passed" : "Pass QC"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
