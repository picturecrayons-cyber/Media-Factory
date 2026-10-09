import { useQuery } from "@tanstack/react-query";
import { listDistributionAvails } from "@/lib/bridge/distribution-avails";

function display(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return "Unspecified";
  return value.map((item) => String(item)).join(", ");
}

export function DistributionAvailsReport() {
  const query = useQuery({
    queryKey: ["bridge-distribution-avails"],
    queryFn: () => listDistributionAvails(),
    retry: false,
  });

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5 sm:p-6" aria-labelledby="distribution-avails-heading">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Read-only · Evidence-backed</p>
        <h2 id="distribution-avails-heading" className="mt-1 font-display text-2xl font-semibold">Distribution catalog avails</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          A current snapshot of Bridge metadata, asset, QC, legal-review and structured rights evidence.
          A title is never advertised as available from lifecycle status or a stored media key alone.
        </p>
      </div>

      {query.isPending ? <p className="text-sm text-muted">Loading evidence snapshot…</p> : null}
      {query.isError ? <p role="alert" className="rounded-xl border border-line p-4 text-sm text-muted">Could not load the avails snapshot. Access or schema may need review; no empty result is inferred.</p> : null}

      {query.data ? (
        <>
          <p className="text-xs text-muted">Snapshot generated {new Date(query.data.generatedAt).toLocaleString()} · {query.data.rows.length} active catalog rows · Read-only</p>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-line bg-elevated text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-3">Title / record</th>
                  <th className="px-3 py-3">Metadata</th>
                  <th className="px-3 py-3">Evidence</th>
                  <th className="px-3 py-3">Structured rights</th>
                  <th className="px-3 py-3">Assessment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {query.data.rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-3 py-3">
                      <p className="font-medium text-fg">{row.name}</p>
                      <p className="mt-1 break-all font-mono text-[11px] text-muted">{row.id}</p>
                      <p className="mt-1 text-xs text-muted">{row.status}</p>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted">
                      <p>{row.language || "Language missing"} · {row.year ?? "Year missing"}</p>
                      <p>{row.runtime_minutes ? `${row.runtime_minutes} min` : "Runtime missing"} · {row.content_type || "Format missing"}</p>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted">
                      <p>Master: {row.master_verified ? "verified record" : "missing/unverified"}</p>
                      <p>QC: {row.qc_verified ? "current sign-off" : "not verified"}</p>
                      <p>Legal review: {row.legal_review_recorded ? "recorded" : "not recorded"}</p>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted">
                      {row.valid_rights_grants.length ? row.valid_rights_grants.map((grant) => (
                        <div key={grant.id} className="mb-2 rounded-lg border border-line p-2">
                          <p className="font-mono">{grant.id}</p>
                          <p>Territory: {display(grant.territories)}</p>
                          <p>Language: {display(grant.languages)}</p>
                          <p>Media: {display(grant.media)}</p>
                          <p>Window: {grant.window_start ? new Date(grant.window_start).toLocaleDateString() : "missing"} – {grant.window_end ? new Date(grant.window_end).toLocaleDateString() : "missing"}</p>
                          <p>Exclusivity: {grant.exclusivity || "unspecified"}</p>
                        </div>
                      )) : <span>No VALID grant found</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${row.assessment.decision === "HOLD" ? "border-amber-500/40 text-amber-700" : "border-line text-muted"}`}>
                        {row.assessment.decision.replaceAll("_", " ")}
                      </span>
                      <ul className="mt-2 max-w-xs space-y-1 text-xs text-muted">
                        {row.assessment.blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}
                        {!row.assessment.blockers.length ? <li>Evidence present; operator must still review contract scope and carve-outs.</li> : null}
                      </ul>
                    </td>
                  </tr>
                ))}
                {!query.data.rows.length ? <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-muted">No active catalog rows were returned.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <p className="text-xs leading-relaxed text-muted">This report is a screening aid, not legal certification. It does not send buyer messages, create access grants, mutate titles, or treat free-text notes as structured rights.</p>
        </>
      ) : null}
    </section>
  );
}
