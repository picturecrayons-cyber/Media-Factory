import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listTitles } from "@/lib/bridge/titles";
import { decideServiceRequest, listDeskServiceRequests, listMyServiceRequests, submitServiceRequest } from "@/lib/bridge/service-requests";

const kinds = [
  ["transcode", "Transcode and package"],
  ["compliance", "Compliance check"],
  ["vault", "Vault hold"],
] as const;

const statusLabel: Record<string, string> = {
  submitted: "Waiting for the desk",
  accepted: "Accepted. Not started.",
  working: "The desk is doing this.",
  done: "Finished.",
  declined: "Not taken.",
};

export function ServiceAsk() {
  const qc = useQueryClient();
  const titles = useQuery({ queryKey: ["titles"], queryFn: () => listTitles() });
  const mine = useQuery({ queryKey: ["my-service-requests"], queryFn: () => listMyServiceRequests() });
  const [titleId, setTitleId] = useState("");
  const [kind, setKind] = useState<(typeof kinds)[number][0]>("transcode");
  const [note, setNote] = useState("");
  const send = useMutation({
    mutationFn: () => submitServiceRequest({ data: { titleId, kind, note } }),
    onSuccess: () => {
      setNote("");
      toast("Sent to the desk. Nothing starts until they accept it.");
      void qc.invalidateQueries({ queryKey: ["my-service-requests"] });
    },
    onError: (error) => toast(error instanceof Error ? error.message : "Could not send"),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!titleId) {
      toast("Choose a title first.");
      return;
    }
    send.mutate();
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="font-display text-xl font-semibold">Ask the desk</h2>
      <p className="mt-1 text-sm text-muted">Transcode, a compliance check, or a vault hold. You send the request. The desk decides. Nothing runs on its own.</p>
      <form className="mt-4 grid gap-3" onSubmit={onSubmit}>
        <label className="text-sm text-muted">Title
          <select value={titleId} onChange={(event) => setTitleId(event.target.value)} className="mt-1 h-12 w-full rounded-xl border border-line bg-bg px-3 text-base text-fg">
            <option value="">Choose a title</option>
            {(titles.data?.titles ?? []).map((title) => <option key={title.id} value={title.id}>{title.name}</option>)}
          </select>
        </label>
        <label className="text-sm text-muted">Service
          <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="mt-1 h-12 w-full rounded-xl border border-line bg-bg px-3 text-base text-fg">
            {kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm text-muted">Note
          <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} placeholder="What do you need? One or two lines." className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-base text-fg" />
        </label>
        <Button type="submit" disabled={send.isPending}>{send.isPending ? "Sending…" : "Send to the desk"}</Button>
      </form>
      <ul className="mt-4 divide-y divide-line">
        {(mine.data?.requests ?? []).map((row) => (
          <li key={row.id} className="py-3">
            <p className="text-sm font-semibold">{kinds.find(([value]) => value === row.kind)?.[1]} · {row.title_name}</p>
            <p className="text-xs text-muted">{statusLabel[row.status] ?? row.status}</p>
            {row.admin_note ? <p className="mt-1 text-sm">{row.admin_note}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ServiceQueue() {
  const qc = useQueryClient();
  const queue = useQuery({ queryKey: ["desk-service-requests"], queryFn: () => listDeskServiceRequests() });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const decide = useMutation({
    mutationFn: (input: { id: string; status: "accepted" | "working" | "done" | "declined" }) =>
      decideServiceRequest({ data: { ...input, adminNote: notes[input.id] ?? "" } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["desk-service-requests"] }),
    onError: (error) => toast(error instanceof Error ? error.message : "Could not update"),
  });

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <h3 className="font-display text-xl font-semibold">Service requests</h3>
      <p className="mt-1 text-sm text-muted">Creators and studios send these. You accept, do the work, or decline. Nothing starts by itself.</p>
      {queue.isPending ? <p className="mt-3 text-sm text-muted">Loading…</p> : null}
      {queue.isError ? <p role="alert" className="mt-3 text-sm text-muted">Could not load requests.</p> : null}
      <ul className="mt-3 divide-y divide-line">
        {(queue.data?.requests ?? []).map((row) => (
          <li key={row.id} className="py-3">
            <p className="text-sm font-semibold">{kinds.find(([value]) => value === row.kind)?.[1]} · {row.title_name}</p>
            <p className="text-xs text-muted">{row.display_name || "No name"} · {row.email || "No email"} · {statusLabel[row.status] ?? row.status}</p>
            {row.note ? <p className="mt-1 text-sm">{row.note}</p> : null}
            {row.status !== "done" && row.status !== "declined" ? (
              <div className="mt-2 grid gap-2">
                <input value={notes[row.id] ?? row.admin_note} onChange={(event) => setNotes((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="Reply to the owner" className="h-10 rounded-xl border border-line bg-bg px-3 text-sm" />
                <div className="flex flex-wrap gap-2">
                  {row.status === "submitted" ? <Button type="button" disabled={decide.isPending} onClick={() => decide.mutate({ id: row.id, status: "accepted" })}>Accept</Button> : null}
                  {row.status === "accepted" ? <Button type="button" disabled={decide.isPending} onClick={() => decide.mutate({ id: row.id, status: "working" })}>Start</Button> : null}
                  {row.status === "working" ? <Button type="button" disabled={decide.isPending} onClick={() => decide.mutate({ id: row.id, status: "done" })}>Mark done</Button> : null}
                  <Button type="button" disabled={decide.isPending} onClick={() => decide.mutate({ id: row.id, status: "declined" })}>Decline</Button>
                </div>
              </div>
            ) : row.admin_note ? <p className="mt-1 text-sm">{row.admin_note}</p> : null}
          </li>
        ))}
        {!queue.isPending && !queue.isError && (queue.data?.requests.length ?? 0) === 0 ? <li className="py-3 text-sm text-muted">No requests yet.</li> : null}
      </ul>
    </section>
  );
}
