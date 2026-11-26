import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import type { BridgeActor } from "@/lib/bridge/session";
import { createInternalTask, listInternalTasks, updateInternalTask } from "@/lib/bridge/internal-workflows";

export const Route = createFileRoute("/admin/tasks")({ component: TaskInbox });

function TaskInbox() {
  return <RequireBridge allow="internal">
    {(actor) => <BridgeShell actor={actor} title="Persisted Task Inbox"><TaskBody actor={actor} /></BridgeShell>}
  </RequireBridge>;
}

function TaskBody({ actor }: { actor: BridgeActor }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["bridge-internal-tasks"], queryFn: () => listInternalTasks() });
  const [summary, setSummary] = useState("");
  const [taskType, setTaskType] = useState("GENERAL");
  const [assignedRole, setAssignedRole] = useState("admin");
  const [priority, setPriority] = useState("NORMAL");
  const create = useMutation({ mutationFn: createInternalTask, onSuccess: () => { setSummary(""); client.invalidateQueries({ queryKey: ["bridge-internal-tasks"] }); } });
  const update = useMutation({ mutationFn: updateInternalTask, onSuccess: () => client.invalidateQueries({ queryKey: ["bridge-internal-tasks"] }) });
  const canCreate = actor.internalRole === "admin" || actor.internalRole === "super_admin";
  if (query.isLoading) return <p className="p-6 text-sm">Loading task inbox…</p>;
  if (query.isError) return <p className="p-6 text-sm">Unable to load persisted tasks.</p>;
  const tasks = query.data ?? [];
  return <div className="space-y-5">
    <header className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-2xl font-semibold">Operational Task Inbox</h2>
      <p className="mt-2 text-sm text-muted">Tasks are stored in Bridge and scoped to the assigned internal role. Status changes are audited.</p>
    </header>
    {canCreate ? <form className="grid gap-3 rounded-2xl border border-line bg-surface p-5 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); create.mutate({ data: { taskType: taskType as any, assignedRole: assignedRole as any, priority: priority as any, summary: summary.trim(), details: {} } }); }}>
      <input value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={500} required placeholder="Task summary" className="rounded-xl border border-line bg-elevated p-3 text-sm md:col-span-2" />
      <select value={taskType} onChange={(e) => setTaskType(e.target.value)} className="rounded-xl border border-line bg-elevated p-3 text-sm"><option>GENERAL</option><option>QC_REVIEW</option><option>LEGAL_REVIEW</option><option>RIGHTS_REVIEW</option><option>ASSET_VERIFICATION</option><option>MIGRATION_RECONCILIATION</option><option>PRODUCTION_CLASSIFICATION</option></select>
      <select value={assignedRole} onChange={(e) => setAssignedRole(e.target.value)} className="rounded-xl border border-line bg-elevated p-3 text-sm"><option>admin</option><option>super_admin</option><option>qc_reviewer</option><option>legal_reviewer</option><option>finance</option><option>viewer</option></select>
      <select value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded-xl border border-line bg-elevated p-3 text-sm"><option>NORMAL</option><option>LOW</option><option>HIGH</option><option>URGENT</option></select>
      <button disabled={create.isPending || !summary.trim()} className="rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40">Create task</button>
    </form> : null}
    <div className="space-y-3">
      {tasks.length === 0 ? <p className="rounded-xl border border-line p-5 text-sm">No tasks in your queue.</p> : tasks.map((task: any) => <section key={task.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 md:flex-row md:items-center md:justify-between">
        <div><p className="font-medium">{task.summary}</p><p className="mt-1 text-xs text-muted">{task.task_type} · {task.assigned_role} · {task.priority} · {task.status}</p><p className="mt-1 text-xs text-muted">{task.title_id ?? "No linked title"} · {task.created_at}</p></div>
        {actor.internalRole === task.assigned_role || actor.internalRole === "admin" || actor.internalRole === "super_admin" ? <select value={task.status} onChange={(e) => update.mutate({ data: { taskId: task.id, status: e.target.value as any } })} className="rounded-xl border border-line bg-elevated p-2 text-sm"><option>OPEN</option><option>IN_PROGRESS</option><option>BLOCKED</option><option>DONE</option><option>CANCELLED</option></select> : <span className="text-xs text-muted">Read only</span>}
      </section>)}
    </div>
    {create.isError || update.isError ? <p className="rounded-xl border border-line p-3 text-sm">Task operation failed: {String(create.error ?? update.error)}</p> : null}
  </div>;
}
