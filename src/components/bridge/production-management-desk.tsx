import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  createProductionCrewMember,
  createProductionProject,
  createProductionScheduleEvent,
  createProductionShootDay,
  getProductionWorkspace,
  updateProductionLifecycle,
} from "@/lib/bridge/production-management";

const lifecycleOptions = ["PRE_PRODUCTION", "IN_PRODUCTION", "WRAP", "POST_PRODUCTION", "COMPLETED", "ON_HOLD"] as const;
const eventOptions = ["PRE_PRODUCTION", "SHOOT_DAY", "WRAP", "DIT_HANDOFF", "POST_PRODUCTION", "DELIVERY", "MILESTONE", "OTHER"] as const;
const typeOptions = ["FEATURE", "SHORT", "SERIES", "DOCUMENTARY", "OTHER"] as const;

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

export function ProductionManagementDesk({ userId, organizationId }: { userId: string; organizationId?: string | null }) {
  const client = useQueryClient();
  const queryKey = ["bridge-production-workspace-v1", userId, organizationId];
  const workspace = useQuery({ queryKey, queryFn: () => getProductionWorkspace() });
  const projects = workspace.data?.projects ?? [];
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const [name, setName] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [productionType, setProductionType] = useState<(typeof typeOptions)[number]>("FEATURE");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [location, setLocation] = useState("");
  const [shootDate, setShootDate] = useState("");
  const [dayLabel, setDayLabel] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventType, setEventType] = useState<(typeof eventOptions)[number]>("MILESTONE");
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [crewName, setCrewName] = useState("");
  const [crewRole, setCrewRole] = useState("");
  const [crewDepartment, setCrewDepartment] = useState("");

  const refresh = async () => client.invalidateQueries({ queryKey });
  const createProject = useMutation({
    mutationFn: () => createProductionProject({ data: {
      name, projectCode: projectCode || undefined, productionType,
      plannedStartDate: startDate || undefined, plannedEndDate: endDate || undefined,
      primaryLocation: location || undefined,
    } }),
    onSuccess: async (result) => { setName(""); setProjectCode(""); setSelectedProjectId(result.projectId); await refresh(); },
  });
  const changeLifecycle = useMutation({
    mutationFn: (status: (typeof lifecycleOptions)[number]) => {
      if (!selectedProject) throw new Error("Select a Production project");
      return updateProductionLifecycle({ data: { projectId: selectedProject.id, status } });
    },
    onSuccess: refresh,
  });
  const addShootDay = useMutation({
    mutationFn: () => {
      if (!selectedProject) throw new Error("Select a Production project");
      return createProductionShootDay({ data: {
        projectId: selectedProject.id, shootDate, dayLabel: dayLabel || undefined,
        location: location || undefined,
      } });
    },
    onSuccess: async () => { setShootDate(""); setDayLabel(""); await refresh(); },
  });
  const addEvent = useMutation({
    mutationFn: () => {
      if (!selectedProject) throw new Error("Select a Production project");
      return createProductionScheduleEvent({ data: {
        projectId: selectedProject.id, eventType, eventName,
        startsAt: new Date(eventStart).toISOString(), endsAt: new Date(eventEnd).toISOString(),
        location: location || undefined,
      } });
    },
    onSuccess: async () => { setEventName(""); setEventStart(""); setEventEnd(""); await refresh(); },
  });
  const addCrew = useMutation({
    mutationFn: () => {
      if (!selectedProject) throw new Error("Select a Production project");
      return createProductionCrewMember({ data: {
        projectId: selectedProject.id, fullName: crewName, role: crewRole,
        department: crewDepartment || undefined,
      } });
    },
    onSuccess: async () => { setCrewName(""); setCrewRole(""); setCrewDepartment(""); await refresh(); },
  });
  const shootDays = useMemo(() => (workspace.data?.shootDays ?? []).filter((d) => d.project_id === selectedProject?.id), [workspace.data?.shootDays, selectedProject?.id]);
  const events = useMemo(() => (workspace.data?.events ?? []).filter((e) => e.project_id === selectedProject?.id), [workspace.data?.events, selectedProject?.id]);
  const crew = useMemo(() => (workspace.data?.crew ?? []).filter((c) => c.project_id === selectedProject?.id), [workspace.data?.crew, selectedProject?.id]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-display text-xl font-semibold">Productions / In-Production Films</h3><p className="mt-1 text-sm text-muted">Manage pre-production, shooting, wrap and post-production separately from Finished Film review.</p></div>
          <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">{projects.length} projects</span>
        </div>
        {workspace.isError ? <p role="alert" className="mt-3 text-sm text-red-600">Could not load Production records. Confirm active Studio membership and refresh.</p> : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-sm"><span className="font-medium">Project name</span><input className="h-10 w-full rounded-lg border border-line bg-bg px-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="Film / series production name" /></label>
          <label className="space-y-1 text-sm"><span className="font-medium">Project code (optional)</span><input className="h-10 w-full rounded-lg border border-line bg-bg px-3" value={projectCode} onChange={(e) => setProjectCode(e.target.value)} /></label>
          <label className="space-y-1 text-sm"><span className="font-medium">Production type</span><select className="h-10 w-full rounded-lg border border-line bg-bg px-3" value={productionType} onChange={(e) => setProductionType(e.target.value as (typeof typeOptions)[number])}>{typeOptions.map((v) => <option key={v} value={v}>{label(v)}</option>)}</select></label>
          <label className="space-y-1 text-sm"><span className="font-medium">Planned start</span><input type="date" className="h-10 w-full rounded-lg border border-line bg-bg px-3" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
          <label className="space-y-1 text-sm"><span className="font-medium">Planned end</span><input type="date" className="h-10 w-full rounded-lg border border-line bg-bg px-3" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
          <label className="space-y-1 text-sm"><span className="font-medium">Primary location</span><input className="h-10 w-full rounded-lg border border-line bg-bg px-3" value={location} onChange={(e) => setLocation(e.target.value)} /></label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3"><Button disabled={createProject.isPending || name.trim().length < 2} onClick={() => createProject.mutate()}>{createProject.isPending ? "Creating…" : "Create Production project"}</Button>{createProject.error ? <span role="alert" className="text-sm text-red-600">{createProject.error.message}</span> : null}</div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-semibold">Production project workspace</h4><Button size="sm" variant="outline" onClick={() => void refresh()}>Refresh</Button></div>
        {!projects.length ? <p className="mt-3 text-sm text-muted">No Production projects registered for this Studio yet.</p> : <>
          <label className="mt-3 block max-w-xl space-y-1 text-sm"><span className="font-medium">Select Production project</span><select className="h-11 w-full rounded-lg border border-line bg-bg px-3" value={selectedProject?.id ?? ""} onChange={(e) => setSelectedProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name} · {label(p.status)}</option>)}</select></label>
          {selectedProject ? <>
            <div className="mt-4 flex flex-wrap items-center gap-3"><span className="text-sm font-semibold">{selectedProject.name}</span><span className="rounded-full border border-line px-3 py-1 text-xs">{label(selectedProject.status)}</span><span className="text-xs text-muted">{selectedProject.project_code || "No project code"}</span></div>
            <div className="mt-3 flex flex-wrap items-end gap-3"><label className="space-y-1 text-sm"><span className="font-medium">Lifecycle status</span><select className="h-10 rounded-lg border border-line bg-bg px-3" value={selectedProject.status} onChange={(e) => changeLifecycle.mutate(e.target.value as (typeof lifecycleOptions)[number])}>{lifecycleOptions.map((v) => <option key={v} value={v}>{label(v)}</option>)}</select></label><span className="text-xs text-muted">Transitions are server-validated; COMPLETED is terminal.</span></div>
            {changeLifecycle.error ? <p role="alert" className="mt-2 text-sm text-red-600">{changeLifecycle.error.message}</p> : null}

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-line p-3">
                <h5 className="font-semibold">Shoot days</h5>
                <div className="mt-2 grid gap-2 sm:grid-cols-2"><input aria-label="Shoot date" type="date" className="h-10 rounded-lg border border-line bg-bg px-3" value={shootDate} onChange={(e) => setShootDate(e.target.value)} /><input aria-label="Shoot day label" className="h-10 rounded-lg border border-line bg-bg px-3" placeholder="Day 01 / Schedule label" value={dayLabel} onChange={(e) => setDayLabel(e.target.value)} /></div>
                <Button className="mt-2" size="sm" disabled={!shootDate || addShootDay.isPending} onClick={() => addShootDay.mutate()}>Add shoot day</Button>
                {addShootDay.error ? <p role="alert" className="mt-2 text-xs text-red-600">{addShootDay.error.message}</p> : null}
                <ul className="mt-3 space-y-1 text-sm">{shootDays.map((d) => <li key={d.id}>{d.shoot_date} · {d.day_label || "Shoot day"}</li>)}</ul>
              </div>
              <div className="rounded-xl border border-line p-3">
                <h5 className="font-semibold">Crew / production records</h5>
                <div className="mt-2 grid gap-2 sm:grid-cols-2"><input aria-label="Crew name" className="h-10 rounded-lg border border-line bg-bg px-3" placeholder="Crew member name" value={crewName} onChange={(e) => setCrewName(e.target.value)} /><input aria-label="Crew role" className="h-10 rounded-lg border border-line bg-bg px-3" placeholder="Role / designation" value={crewRole} onChange={(e) => setCrewRole(e.target.value)} /><input aria-label="Crew department" className="h-10 rounded-lg border border-line bg-bg px-3 sm:col-span-2" placeholder="Department (optional)" value={crewDepartment} onChange={(e) => setCrewDepartment(e.target.value)} /></div>
                <Button className="mt-2" size="sm" disabled={crewName.trim().length < 2 || crewRole.trim().length < 2 || addCrew.isPending} onClick={() => addCrew.mutate()}>Add crew record</Button>
                {addCrew.error ? <p role="alert" className="mt-2 text-xs text-red-600">{addCrew.error.message}</p> : null}
                <ul className="mt-3 space-y-1 text-sm">{crew.map((c) => <li key={c.id}>{c.full_name} · {c.role}{c.department ? ` · ${c.department}` : ""}</li>)}</ul>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-line p-3">
              <h5 className="font-semibold">Schedule & milestones</h5>
              <div className="mt-2 grid gap-2 sm:grid-cols-2"><input aria-label="Event name" className="h-10 rounded-lg border border-line bg-bg px-3" placeholder="Milestone / schedule item" value={eventName} onChange={(e) => setEventName(e.target.value)} /><select aria-label="Event type" className="h-10 rounded-lg border border-line bg-bg px-3" value={eventType} onChange={(e) => setEventType(e.target.value as (typeof eventOptions)[number])}>{eventOptions.map((v) => <option key={v} value={v}>{label(v)}</option>)}</select><input aria-label="Event start" type="datetime-local" className="h-10 rounded-lg border border-line bg-bg px-3" value={eventStart} onChange={(e) => setEventStart(e.target.value)} /><input aria-label="Event end" type="datetime-local" className="h-10 rounded-lg border border-line bg-bg px-3" value={eventEnd} onChange={(e) => setEventEnd(e.target.value)} /></div>
              <Button className="mt-2" size="sm" disabled={!eventName.trim() || !eventStart || !eventEnd || addEvent.isPending} onClick={() => addEvent.mutate()}>Add schedule item</Button>
              {addEvent.error ? <p role="alert" className="mt-2 text-xs text-red-600">{addEvent.error.message}</p> : null}
              <ul className="mt-3 space-y-1 text-sm">{events.map((e) => <li key={e.id}>{new Date(e.starts_at).toLocaleString()} · {e.event_name} · {label(e.event_type)}</li>)}</ul>
            </div>

            {selectedProject.status === "COMPLETED" ? <div className="mt-4 rounded-xl border border-line p-3">
              <h5 className="font-semibold">Finished Film handoff</h5>
              <p className="mt-1 text-sm text-muted">This completed Production project can now start a separate Finished Film submission. Bridge will create the canonical DRAFT title and link it to this Production record. QC, Rights, Legal, Licensing and publication remain separate approval steps.</p>
              <a className="mt-3 inline-flex rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-accent" href={`/submit-film?productionProjectId=${selectedProject.id}`}>Start Finished Film submission</a>
            </div> : <p className="mt-4 text-xs text-muted">Finished Film handoff stays unavailable until this Production project reaches COMPLETED.</p>}
          </> : null}
        </>}
      </section>
    </div>
  );
}
