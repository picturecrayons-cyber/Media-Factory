import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { hasPermission } from "@/lib/bridge/rbac";
import { createPersistentVendorJob, listPersistentVendorJobs, transitionPersistentVendorJob } from "@/lib/bridge/streamvista";
import type { Actor } from "@/lib/bridge/rbac";
import { VENDOR_JOB_TYPES, type VendorJobType } from "@/lib/delivery/vendor-jobs";

export const Route = createFileRoute("/deliveries")({ component: Deliveries });

const LABELS: Record<VendorJobType, string> = {
  dubbing: "Dubbing request",
  loudness_check: "Loudness check (not a Dolby encode)",
  imf_request: "IMF package request",
  dcp_request: "DCP package request",
  human_qc: "Human QC",
};

function normalizeTitleName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function Deliveries() {
  return (
    <RequireBridge>
      {(actor) => (
        <BridgeShell actor={actor} title="Deliveries">
          <VendorJobs actor={actor} />
          <HumanQcStandard />
          <DeliveryList />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function VendorJobs({ actor }: { actor: Actor }) {
  const canRequest = hasPermission(actor, "title.deliver") || hasPermission(actor, "title.create");
  const canReview = hasPermission(actor, "title.deliver") || hasPermission(actor, "title.qc_review");
  const qc = useQueryClient();
  const [type, setType] = useState<VendorJobType>("human_qc");
  const [titleId, setTitleId] = useState("");
  const [error, setError] = useState("");
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const jobsQ = useQuery({ queryKey: ["bridge-vendor-jobs"], queryFn: () => listPersistentVendorJobs() });
  const titles = titlesQ.data?.titles ?? [];
  const jobs = jobsQ.data?.jobs ?? [];
  const request = useMutation({
    mutationFn: () => createPersistentVendorJob({ data: { type, titleId } }),
    onSuccess: async () => {
      setError("");
      setTitleId("");
      await qc.invalidateQueries({ queryKey: ["bridge-vendor-jobs"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Vendor request could not be saved."),
  });
  const transition = useMutation({
    mutationFn: ({ jobId, action }: { jobId: string; action: "start" | "submit_review" | "approve" | "reject" }) =>
      transitionPersistentVendorJob({ data: { jobId, action } }),
    onSuccess: async () => {
      setError("");
      await qc.invalidateQueries({ queryKey: ["bridge-vendor-jobs"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Job transition failed."),
  });

  return (
    <section className="mb-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-xl font-semibold">Vendor jobs</h2>
      <p className="mt-1 text-sm text-muted">
        Requests are persisted and audited. A request is not approval; only an independent reviewer can sign off. No automatic Dolby, IMF, or DCP master is created.
      </p>
      {canRequest ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <select
            className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as VendorJobType)}
          >
            {VENDOR_JOB_TYPES.map((jobType) => (
              <option key={jobType} value={jobType}>{LABELS[jobType]}</option>
            ))}
          </select>
          <select
            className="min-w-64 rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
            aria-label="Title for vendor job"
            value={titleId}
            onChange={(e) => { setTitleId(e.target.value); setError(""); }}
            disabled={titlesQ.isPending || titles.length === 0}
          >
            <option value="">
              {titlesQ.isPending ? "Loading titles…" : titles.length ? "Choose a title…" : "No titles available"}
            </option>
            {titles.map((title) => <option key={title.id} value={title.id}>{title.name}</option>)}
          </select>
          <button
            type="button"
            className="rounded-lg border border-line px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => request.mutate()}
            disabled={!titleId.trim() || titlesQ.isPending || request.isPending}
          >
            {request.isPending ? "Saving…" : "Request"}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">You can view jobs. Requesting work requires title ownership or delivery permission.</p>
      )}
      {titlesQ.isError ? <p className="mt-3 text-sm" role="alert">Could not load titles. Refresh and try again.</p> : null}
      {jobsQ.isError ? <p className="mt-3 text-sm" role="alert">Could not load persisted vendor jobs. Check your delivery permissions and retry.</p> : null}
      {error ? <p className="mt-3 text-sm" role="alert">{error}</p> : null}
      <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
        {jobs.map((job) => {
          const typeKey = job.type as VendorJobType;
          const canOperateJob = job.type === "human_qc"
            ? hasPermission(actor, "title.qc_review")
            : hasPermission(actor, "title.deliver");
          const canSignOff = canOperateJob;
          return (
            <li key={job.id} className="flex flex-col gap-3 p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{LABELS[typeKey] ?? job.type} · {job.titleName}</p>
                  <p className="mt-1 break-all font-mono text-[11px] text-muted">Job {job.id} · Title {job.titleId}</p>
                  <p className="mt-1 text-xs text-muted">
                    Status: {job.status}{job.canDeliver ? " · independent sign-off recorded" : " · delivery output not authorized by this status alone"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canOperateJob && job.status === "queued" ? (
                    <button type="button" className="rounded-lg border border-line px-3 py-1.5 text-xs" disabled={transition.isPending} onClick={() => transition.mutate({ jobId: job.id, action: "start" })}>Start work</button>
                  ) : null}
                  {canOperateJob && job.status === "running" ? (
                    <button type="button" className="rounded-lg border border-line px-3 py-1.5 text-xs" disabled={transition.isPending} onClick={() => transition.mutate({ jobId: job.id, action: "submit_review" })}>Submit for review</button>
                  ) : null}
                  {canSignOff && job.status === "needs_review" ? (
                    <>
                      <button type="button" className="rounded-lg border border-line px-3 py-1.5 text-xs" disabled={transition.isPending} onClick={() => transition.mutate({ jobId: job.id, action: "approve" })}>Sign off</button>
                      <button type="button" className="rounded-lg border border-line px-3 py-1.5 text-xs" disabled={transition.isPending} onClick={() => transition.mutate({ jobId: job.id, action: "reject" })}>Reject</button>
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
        {jobsQ.isPending ? <li className="p-4 text-sm text-muted">Loading persisted vendor jobs…</li> : null}
        {!jobsQ.isPending && !jobsQ.isError && !jobs.length ? <li className="p-4 text-sm text-muted">No vendor jobs yet.</li> : null}
      </ul>
    </section>
  );
}

function HumanQcStandard() {
  return (
    <section className="mb-6 rounded-2xl border border-line bg-surface p-5 sm:p-6" aria-labelledby="human-qc-standard">
      <h2 id="human-qc-standard" className="font-display text-xl font-semibold">Human QC standard</h2>
      <p className="mt-1 text-sm text-muted">
        Human inspection is mandatory where specified. A request is not a pass, payment is not approval, and no master or delivery is auto-certified.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-line p-4">
          <h3 className="text-sm font-semibold">Reviewer qualification</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Assign a reviewer competent for the asset and requested service (picture, sound, subtitles, packaging, or metadata).</li>
            <li>Use current inspection guidance and reference examples; calibrate reviewers periodically against shared examples.</li>
            <li>Escalate outside-scope, ambiguous, or untestable items instead of guessing.</li>
          </ul>
        </div>
        <div className="rounded-xl border border-line p-4">
          <h3 className="text-sm font-semibold">Inspection and acceptance</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Inspect 100% of required delivery-critical checks; sampling is allowed only when the approved service specification explicitly defines it.</li>
            <li>Record pass, fail, or blocked for each applicable check, with timecode/file reference and a defect code for failures.</li>
            <li>Verify file identity, duration, audio layout/loudness where applicable, subtitle sync/readability, technical package integrity, and requested delivery specs.</li>
          </ul>
        </div>
        <div className="rounded-xl border border-line p-4">
          <h3 className="text-sm font-semibold">Severity and escalation</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            <li><strong>Critical:</strong> wrong asset, corruption, missing/replaced content, rights/security concern, or a delivery-blocking defect. Stop delivery and require a second independent reviewer.</li>
            <li><strong>Major:</strong> spec failure or material picture, sound, subtitle, or package defect. Reject or return for correction and re-inspection.</li>
            <li><strong>Minor:</strong> non-blocking issue documented for disposition. Do not silently waive contractual requirements.</li>
          </ul>
        </div>
        <div className="rounded-xl border border-line p-4">
          <h3 className="text-sm font-semibold">Traceability and reviewer care</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Capture reviewer identity, timestamp, asset/version, checklist outcome, defect severity, rationale, and correction/retest result in the approved audit record.</li>
            <li>Use independent blind review for critical findings and resolve disagreements through a designated lead.</li>
            <li>Take regular breaks, rotate high-focus tasks, and recalibrate when reviewer agreement falls below the team's approved threshold.</li>
          </ul>
        </div>
      </div>
      <p className="mt-4 text-xs text-muted">
        This panel is the operational standard, not a persisted QC checklist or sign-off record. The title's approved workflow/audit trail remains authoritative; delivery stays blocked until required sign-off exists.
      </p>
    </section>
  );
}

function DeliveryList() {
  const q = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const titles = q.data?.titles ?? [];
  const duplicateGroups = useMemo(() => {
    type TitleItem = (typeof titles)[number];
    type CandidateGroup = { key: string; normalizedName: string; titles: TitleItem[] };
    const groups = new Map<string, CandidateGroup>();
    for (const title of titles) {
      const normalizedName = normalizeTitleName(title.name);
      if (!normalizedName) continue;
      const language = title.language.trim().toLocaleLowerCase();
      const year = title.year ?? null;
      const key = `${normalizedName}|${language}|${year ?? "unknown"}`;
      const group = groups.get(key);
      if (group) group.titles.push(title);
      else groups.set(key, { key, normalizedName, titles: [title] });
    }
    return Array.from(groups.values()).filter((group) => group.titles.length > 1);
  }, [titles]);
  if (q.isError) return <p role="alert">Delivery data is unavailable. Refresh to retry.</p>;
  if (q.isPending) return <p className="text-sm text-muted">Loading deliveries…</p>;
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-xl font-semibold">Delivery desk</h2>
      <p className="mt-1 text-sm text-muted">
        Open a title to review its canonical Delivery workspace. No rights or fulfilment rules are changed here.
      </p>
      {duplicateGroups.length ? (
        <section className="mb-5 rounded-xl border border-line p-4" aria-labelledby="duplicate-title-review">
          <h3 id="duplicate-title-review" className="text-sm font-semibold">Possible duplicate titles · human review required</h3>
          <p className="mt-1 text-xs text-muted">
            Grouped by normalized title name, language, and year. These are review candidates only; no records have been merged or changed.
          </p>
          <ul className="mt-3 space-y-3">
            {duplicateGroups.map((group) => (
              <li key={group.key} className="rounded-lg border border-line p-3">
                <p className="text-sm font-semibold">{group.normalizedName}</p>
                <ul className="mt-2 space-y-2">
                  {group.titles.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>{t.name} <span className="text-xs text-muted">· {t.language}{t.year ? ` · ${t.year}` : ""} · ID {t.id}</span></span>
                      <Link to="/title/$id" params={{ id: t.id }} className="rounded-lg border border-line px-3 py-1 text-xs font-semibold">Compare record</Link>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted">Before any future merge: confirm canonical identity, ownership, rights/contracts, asset versions, delivery history, and linked references; obtain authorized sign-off and preserve an auditable redirect/history.</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="mt-5 divide-y divide-line rounded-xl border border-line">
        {titles.map((t) => (
          <Link
            key={t.id}
            to="/title/$id"
            params={{ id: t.id }}
            className="flex items-center justify-between gap-3 p-4 hover:bg-fg/5"
          >
            <div>
              <p className="text-sm font-semibold">{t.name}</p>
              <p className="text-xs text-muted">
                {t.language}
                {t.year ? ` · ${t.year}` : ""}
              </p>
              <p className="mt-1 break-all font-mono text-[11px] text-muted">Bridge Title ID: {t.id}</p>
              <p className="text-xs text-muted">Owner: {t.ownerAccountType === "independent_creator" ? "Creator" : t.ownerAccountType === "studio" ? "Studio" : t.ownerAccountType} · {t.ownerUserId}</p>
            </div>
            <span className="rounded-full border border-line px-3 py-1 text-[10px] font-semibold">
              {t.status === "DELIVERED" ? "DELIVERED" : "OPEN TITLE"}
            </span>
          </Link>
        ))}
      </div>
      {!titles.length ? <p className="mt-5 text-sm text-muted">No titles available.</p> : null}
    </section>
  );
}
