import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listSuperAdminStorageOverview } from "@/lib/bridge/super-admin-storage";

export const Route = createFileRoute("/storage-admin")({ component: SuperAdminStorage });

function SuperAdminStorage() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Storage & asset oversight">
          <StorageBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function StorageBody() {
  const overviewQ = useQuery({
    queryKey: ["super-admin-storage-overview"],
    queryFn: () => listSuperAdminStorageOverview(),
    retry: false,
  });
  const summary = overviewQ.data?.summary ?? [];
  const recent = overviewQ.data?.recentAssets ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Governance · read only</p>
        <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Storage metadata overview</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Bridge asset metadata plus a read-only OCI bucket metadata probe. No object keys, signed URLs or credentials are exposed; no objects are changed.
        </p>
      </section>

      {overviewQ.isPending ? (
        <p className="rounded-xl border border-line p-5 text-sm text-muted">Loading asset metadata…</p>
      ) : overviewQ.isError ? (
        <p role="alert" className="rounded-xl border border-line p-5 text-sm text-accent">
          Storage metadata is unavailable. No zero usage or healthy storage state is assumed.
        </p>
      ) : (
        <>
          <section className="space-y-3">
            <div>
              <h3 className="font-display text-lg font-semibold">Assets by type</h3>
              <p className="text-xs text-muted">Verified means the database has a recorded byte size; it is not a fresh object-store integrity check.</p>
            </div>
            {summary.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {summary.map((row) => (
                  <article key={row.kind} className="rounded-xl border border-line bg-surface p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">{row.kind.replaceAll("_", " ")}</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">{row.assetCount.toLocaleString("en-IN")}</p>
                    <p className="text-xs text-muted">asset records · {row.verifiedCount.toLocaleString("en-IN")} with recorded size</p>
                    <p className="mt-3 text-sm font-medium tabular-nums">{formatBytes(row.totalBytes)}</p>
                    <p className="text-[10px] text-muted">recorded total size</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-line p-5 text-sm text-muted">No asset rows were returned by the current query.</p>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-semibold">OCI provider bucket health</h3><p className="mt-1 text-xs text-muted">Signed, read-only bucket metadata request. No object listing or mutation.</p></div>
              <span className="rounded-full border border-line px-2.5 py-1 text-xs">{overviewQ.data?.providerHealth.status ?? "NOT VERIFIED"}</span>
            </div>
            {overviewQ.data?.providerHealth.status === "AVAILABLE" ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Metric label="Bucket" value={overviewQ.data.providerHealth.bucketName} />
                <Metric label="Region" value={overviewQ.data.providerHealth.region} />
                <Metric label="Storage tier" value={overviewQ.data.providerHealth.storageTier ?? "Not returned"} />
                <Metric label="Public access" value={overviewQ.data.providerHealth.publicAccessType ?? "Not returned"} />
                <Metric label="Versioning" value={overviewQ.data.providerHealth.versioning ?? "Not returned"} />
                <Metric label="Object events" value={overviewQ.data.providerHealth.objectEventsEnabled == null ? "Not returned" : String(overviewQ.data.providerHealth.objectEventsEnabled)} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">{overviewQ.data?.providerHealth.reason ?? "OCI provider health is unavailable."}</p>
            )}
            <p className="mt-3 text-xs text-muted">Backup verification: {overviewQ.data?.providerHealth.backupVerification ?? "NOT VERIFIED"} · Replication verification: {overviewQ.data?.providerHealth.replicationVerification ?? "NOT VERIFIED"}</p>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="font-display text-lg font-semibold">Storage lifecycle & retention metadata</h3>
              <p className="text-xs text-muted">Application policy fields only. These values do not prove OCI object state, backup success or provider-side retention enforcement.</p>
            </div>
            {overviewQ.data?.lifecycle.status === "AVAILABLE" ? (
              overviewQ.data.lifecycle.groups.length ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {overviewQ.data.lifecycle.groups.map((row) => (
                    <article key={row.tier + row.businessState + row.restoreState} className="rounded-xl border border-line bg-surface p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{row.tier} · {row.businessState.replaceAll("_", " ")}</p>
                      <p className="mt-2 text-xl font-semibold tabular-nums">{row.assetCount.toLocaleString("en-IN")} assets</p>
                      <p className="mt-2 text-xs text-muted">Restore state: {row.restoreState}</p>
                      <p className="mt-1 text-xs text-muted">Legal holds: {row.legalHoldCount} · Commercial holds: {row.commercialHoldCount}</p>
                      <p className="mt-1 text-xs text-muted">Retention date passed: {row.retentionDueCount}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-line p-5 text-sm text-muted">No storage lifecycle metadata rows are available.</p>
              )
            ) : (
              <p className="rounded-xl border border-line p-5 text-sm text-muted">Storage lifecycle metadata is unavailable in this environment. Retention and hold status are NOT VERIFIED.</p>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-line">
            <div className="border-b border-line px-4 py-4 sm:px-5">
              <h3 className="font-semibold">Recent asset records</h3>
              <p className="mt-1 text-xs text-muted">Latest 25 metadata records. Storage object paths and owner identifiers are intentionally excluded.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-3">Title / reference</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Content type</th>
                    <th className="px-4 py-3">Recorded size</th>
                    <th className="px-4 py-3">Verification</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {recent.map((row) => (
                    <tr key={row.reference}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{row.titleName ?? "Unlinked title"}</p>
                        <p className="mt-1 font-mono text-[10px] text-muted">{row.reference}</p>
                      </td>
                      <td className="px-4 py-3">{row.kind}</td>
                      <td className="px-4 py-3 text-xs text-muted">{row.contentType ?? "—"}</td>
                      <td className="px-4 py-3 tabular-nums">{row.byteSize == null ? "Not recorded" : formatBytes(row.byteSize)}</td>
                      <td className="px-4 py-3">{row.verified ? "Recorded size present" : "Not verified"}</td>
                      <td className="px-4 py-3 text-xs text-muted">{formatDate(row.createdAt)}</td>
                    </tr>
                  ))}
                  {!recent.length ? <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No recent asset records.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="rounded-xl border border-line p-4 sm:p-5">
        <h3 className="font-semibold">Storage control boundaries</h3>
        <ul className="mt-2 grid gap-2 text-sm text-muted sm:grid-cols-2">
          <li>• This workspace is metadata-only and read-only.</li>
          <li>• No upload, deletion, overwrite, move or restore action is exposed.</li>
          <li>• Recorded byte totals are not provider billing or quota measurements.</li>
          <li>• OCI bucket metadata is probed; backup restore tests and replication destination checks remain NOT CONFIGURED.</li>
          <li>• Asset ownership and title-level access rules remain unchanged.</li>
          <li>• Destructive storage operations require a separate reviewed workflow and explicit approval.</li>
        </ul>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="rounded-xl border border-line bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p><p className="mt-2 text-sm font-semibold break-words">{value}</p></article>;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return "Size unavailable";
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 2)} ${units[exponent]}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString("en-IN");
}
