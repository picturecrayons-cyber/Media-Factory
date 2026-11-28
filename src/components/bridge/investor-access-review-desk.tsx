import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listInvestorAccessRequests, reviewInvestorAccessRequest } from "@/lib/bridge/profiles";

export function InvestorAccessReviewDesk({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const requestsQ = useQuery({
    queryKey: ["bridge-investor-access-requests"],
    queryFn: () => listInvestorAccessRequests(),
    enabled,
  });
  const review = useMutation({
    mutationFn: (input: { requestId: string; decision: "APPROVE" | "REJECT" }) =>
      reviewInvestorAccessRequest({
        data: { ...input, notes: notes[input.requestId] ?? "" },
      }),
    onSuccess: (result) => {
      toast.success(result.status === "APPROVED" ? "Investor approved; invitation sent" : "Investor request rejected");
      void qc.invalidateQueries({ queryKey: ["bridge-investor-access-requests"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Review failed"),
  });

  if (!enabled) return null;
  if (requestsQ.isPending) return <p className="text-sm text-muted">Loading Investor access requests…</p>;
  if (requestsQ.isError) return <p role="alert" className="text-sm text-red-600">Investor requests could not be loaded.</p>;
  const requests = requestsQ.data?.requests ?? [];

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h2 className="font-display text-xl font-semibold text-fg">Investor Access Review</h2>
        <p className="mt-1 text-xs text-muted">Only Super Admin can approve or reject. Approval sends a seven-day, email-bound Investor invitation; it does not grant internal roles.</p>
      </div>
      {requests.length === 0 ? <p className="text-sm text-muted">No Investor access requests.</p> : (
        <ul className="space-y-3">
          {requests.map((request: {
            id: string; name: string; email: string; organization_name: string;
            investor_type: string; website: string | null; purpose: string;
            status: string; review_notes: string | null; created_at: string;
          }) => (
            <li key={request.id} className="rounded-xl border border-line bg-elevated p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-fg">{request.name} · {request.organization_name}</p>
                  <p className="text-xs text-muted">{request.email} · {request.investor_type} · {request.created_at}</p>
                  {request.website ? <a className="text-xs text-accent underline" href={request.website} target="_blank" rel="noreferrer">{request.website}</a> : null}
                </div>
                <span className="rounded-full border border-line px-2 py-1 text-xs">{request.status}</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{request.purpose}</p>
              {request.review_notes ? <p className="mt-2 text-xs text-muted">Review: {request.review_notes}</p> : null}
              {request.status === "PENDING" ? (
                <div className="mt-4 space-y-3">
                  <label className="block text-xs font-semibold text-muted">Review notes (required)
                    <textarea value={notes[request.id] ?? ""} onChange={e=>setNotes(current=>({...current,[request.id]:e.target.value}))} minLength={8} maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border border-line bg-surface p-2 text-sm text-fg" />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={review.isPending || (notes[request.id] ?? "").trim().length < 8} onClick={()=>review.mutate({requestId:request.id,decision:"APPROVE"})}>Approve & invite</Button>
                    <Button size="sm" variant="outline" disabled={review.isPending || (notes[request.id] ?? "").trim().length < 8} onClick={()=>review.mutate({requestId:request.id,decision:"REJECT"})}>Reject</Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
