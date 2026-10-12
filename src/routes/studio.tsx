import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { CreateTitleForm, TitleList } from "@/components/bridge/title-desk";
import { StreamVistaOrders } from "@/components/bridge/streamvista-orders";
import { Button } from "@/components/ui/button";
import { runOciReadOnlyDiagnostic } from "@/lib/bridge/oci-diagnostics";
import { Desk } from "./creator";

export const Route = createFileRoute("/studio")({ component: Studio });

function Studio() {
  return (
    <RequireBridge allow="studio">
      {(actor) => (
        <BridgeShell actor={actor} title="Studio desk">
          <div className="space-y-8">
            <Desk
              role="Studio"
              scope="Studio-owned titles only. Same rights gate as creators. No buyer catalog access."
              opportunity="Submit a slate. Production services stay optional and separate from licensing."
              steps={["Add title", "Prepare assets", "Rights clearance", "License", "Deliver"]}
            />
            <section id="add-title">
              <h2 className="text-lg font-semibold">Add title</h2>
              <div className="mt-3"><CreateTitleForm concise /></div>
            </section>
            <section>
              <h2 className="text-lg font-semibold">Studio slate</h2>
              <div className="mt-3"><TitleList empty="No titles yet. Add the first title." /></div>
            </section>
            <section>
              <h2 className="text-lg font-semibold">Production services</h2>
              <div className="mt-3"><StreamVistaOrders /></div>
            </section>
            <OciReadOnlyCheck />
          </div>
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function OciReadOnlyCheck() {
  const diagnostic = useMutation({ mutationFn: () => runOciReadOnlyDiagnostic() });
  const result = diagnostic.data;

  return (
    <section className="border-t border-line pt-8">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Storage diagnostics</p>
      <h2 className="mt-2 text-lg font-semibold">OCI authentication check</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Runs two signed, read-only OCI requests to verify identity authentication and bucket read access.
        It does not create a pre-authenticated request, upload, copy, or delete any object.
      </p>
      <div className="mt-4">
        <Button type="button" variant="outline" disabled={diagnostic.isPending} onClick={() => diagnostic.mutate()}>
          {diagnostic.isPending ? "Checking OCI…" : "Run read-only OCI check"}
        </Button>
      </div>
      {diagnostic.error ? (
        <p role="alert" className="mt-4 rounded-md border border-line p-3 text-sm">
          Check failed: {diagnostic.error instanceof Error ? diagnostic.error.message : "OCI diagnostic failed"}
        </p>
      ) : null}
      {result ? (
        <div className="mt-4 rounded-md border border-line p-4 text-sm">
          <p className="font-medium">Read-only checks passed</p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr]">
            <dt className="text-muted">Region</dt><dd>{result.region}</dd>
            <dt className="text-muted">Bucket</dt><dd>{result.bucket}</dd>
            <dt className="text-muted">Namespace</dt><dd>{result.namespace}</dd>
            <dt className="text-muted">Derived fingerprint</dt><dd className="break-all">{result.fingerprint}</dd>
            <dt className="text-muted">Namespace auth</dt><dd>{result.checks.namespaceAuthentication}</dd>
            <dt className="text-muted">Bucket read access</dt><dd>{result.checks.bucketReadAccess}</dd>
          </dl>
        </div>
      ) : null}
    </section>
  );
}
