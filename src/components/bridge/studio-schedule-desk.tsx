import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTitles } from "@/lib/bridge/titles";
import {
  createStudioScheduleEvent,
  listStudioScheduleEvents,
  updateStudioScheduleEventStatus,
  type StudioScheduleEvent,
} from "@/lib/bridge/studio-schedule";

type Actor = { userId: string; organizationId?: string | null };

const eventTypes = [
  ["PRE_PRODUCTION", "Pre-production"],
  ["SHOOT_DAY", "Shoot day"],
  ["WRAP", "Wrap"],
  ["DIT_HANDOFF", "DIT handover"],
  ["POST_PRODUCTION", "Post-production"],
  ["DELIVERY", "Delivery"],
  ["OTHER", "Other"],
] as const;

function formatWhen(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function StudioScheduleDesk({ actor }: { actor: Actor }) {
  const queryClient = useQueryClient();
  const scheduleQuery = useQuery({
    queryKey: ["bridge-studio-schedule", actor.userId, actor.organizationId],
    queryFn: () => listStudioScheduleEvents(),
    retry: 1,
  });
  const titlesQuery = useQuery({
    queryKey: ["bridge-titles", actor.userId, actor.organizationId],
    queryFn: () => listTitles(),
    retry: 1,
  });
  const [titleId, setTitleId] = useState("");
  const [eventType, setEventType] = useState<(typeof eventTypes)[number][0]>("SHOOT_DAY");
  const [eventName, setEventName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const createMutation = useMutation({
    mutationFn: (data: { titleId: string; eventType: (typeof eventTypes)[number][0]; eventName: string; startsAt: string; endsAt: string; location?: string; notes?: string }) =>
      createStudioScheduleEvent({ data }),
    onSuccess: async () => {
      setEventName("");
      setLocation("");
      setNotes("");
      await queryClient.invalidateQueries({ queryKey: ["bridge-studio-schedule"] });
    },
  });
  const statusMutation = useMutation({
    mutationFn: (data: { eventId: string; status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED" }) =>
      updateStudioScheduleEventStatus({ data }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bridge-studio-schedule"] });
    },
  });

  if (scheduleQuery.isPending) return <p className="text-sm text-muted">Loading Studio production schedule…</p>;
  if (scheduleQuery.isError) {
    return (
      <div role="alert" className="rounded-sm border border-line p-4 text-sm">
        <p>Production schedule is unavailable for this Studio organization.</p>
        <button type="button" className="mt-2 font-semibold text-accent underline" onClick={() => void scheduleQuery.refetch()}>Retry</button>
      </div>
    );
  }
  if (!scheduleQuery.data) return <p className="text-sm text-muted">Production schedule data is unavailable.</p>;

  const schedule = scheduleQuery.data;
  const titles = titlesQuery.data?.titles ?? [];

  function updateStatus(event: StudioScheduleEvent, status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED") {
    statusMutation.mutate({ eventId: event.id, status });
  }

  return (
    <div className="space-y-4">
      {schedule.canManage ? (
        <form
          className="grid gap-3 rounded-sm border border-line p-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!titleId || !startsAt || !endsAt) return;
            createMutation.mutate({
              titleId,
              eventType,
              eventName,
              startsAt: new Date(startsAt).toISOString(),
              endsAt: new Date(endsAt).toISOString(),
              location,
              notes,
            });
          }}
        >
          <label className="grid gap-1 text-sm sm:col-span-2">
            Production title
            <select className="rounded-sm border border-line bg-bg px-3 py-2" required value={titleId} onChange={(event) => setTitleId(event.target.value)}>
              <option value="">Choose a Studio title</option>
              {titles.map((title) => <option key={title.id} value={title.id}>{title.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Event type
            <select className="rounded-sm border border-line bg-bg px-3 py-2" value={eventType} onChange={(event) => setEventType(event.target.value as (typeof eventTypes)[number][0])}>
              {eventTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Event name
            <input className="rounded-sm border border-line bg-bg px-3 py-2" required maxLength={180} value={eventName} onChange={(event) => setEventName(event.target.value)} placeholder="e.g. Camera A shoot day 1" />
          </label>
          <label className="grid gap-1 text-sm">
            Starts
            <input className="rounded-sm border border-line bg-bg px-3 py-2" required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            Ends
            <input className="rounded-sm border border-line bg-bg px-3 py-2" required type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            Location (optional)
            <input className="rounded-sm border border-line bg-bg px-3 py-2" maxLength={240} value={location} onChange={(event) => setLocation(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            Notes (optional)
            <textarea className="rounded-sm border border-line bg-bg px-3 py-2" rows={3} maxLength={4000} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={!titles.length || !titleId || !eventName.trim() || !startsAt || !endsAt || createMutation.isPending} className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">
              {createMutation.isPending ? "Saving…" : "Add schedule event"}
            </button>
            {titlesQuery.isError ? <span className="text-xs text-muted">Studio titles could not be loaded.</span> : null}
          </div>
        </form>
      ) : null}

      {createMutation.isError || statusMutation.isError ? (
        <p role="alert" className="text-sm text-red-600">{createMutation.error?.message ?? statusMutation.error?.message}</p>
      ) : null}

      {titlesQuery.isError ? <p role="alert" className="text-sm text-muted">Studio title list is unavailable. Refresh to try again.</p> : null}
      {!schedule.events.length ? (
        <p className="text-sm text-muted">No production events are scheduled for this organization.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-line">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-3 py-2">Event / title</th>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Status</th>
                {schedule.canManage ? <th className="px-3 py-2">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {schedule.events.map((item) => (
                <tr key={item.id} className="border-b border-line/70 align-top">
                  <td className="px-3 py-3">
                    <p className="font-medium">{item.eventName}</p>
                    <p className="text-xs text-muted">{item.titleName} · {item.eventType.replaceAll("_", " ")}</p>
                    {item.notes ? <p className="mt-1 max-w-sm whitespace-pre-wrap text-xs text-muted">{item.notes}</p> : null}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{formatWhen(item.startsAt)} – {formatWhen(item.endsAt)}</td>
                  <td className="px-3 py-3">{item.location || "—"}</td>
                  <td className="px-3 py-3">{item.status.replaceAll("_", " ")}</td>
                  {schedule.canManage ? (
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        {item.status === "SCHEDULED" ? (
                          <>
                            <button type="button" disabled={statusMutation.isPending} className="text-xs font-semibold text-accent underline disabled:opacity-50" onClick={() => updateStatus(item, "IN_PROGRESS")}>Start</button>
                            <button type="button" disabled={statusMutation.isPending} className="text-xs font-semibold text-muted underline disabled:opacity-50" onClick={() => updateStatus(item, "CANCELLED")}>Cancel</button>
                          </>
                        ) : item.status === "IN_PROGRESS" ? (
                          <>
                            <button type="button" disabled={statusMutation.isPending} className="text-xs font-semibold text-accent underline disabled:opacity-50" onClick={() => updateStatus(item, "COMPLETED")}>Complete</button>
                            <button type="button" disabled={statusMutation.isPending} className="text-xs font-semibold text-muted underline disabled:opacity-50" onClick={() => updateStatus(item, "CANCELLED")}>Cancel</button>
                          </>
                        ) : "—"}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs leading-5 text-muted">
        Events are scoped to the active Studio organization. Only owners, admins and producers can create or move events through SCHEDULED → IN_PROGRESS → COMPLETED/CANCELLED. Each change is recorded in the Bridge audit log; completed and cancelled events are locked.
      </p>
    </div>
  );
}
