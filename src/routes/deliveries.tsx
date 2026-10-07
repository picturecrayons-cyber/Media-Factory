import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listDeliveryTraces } from "@/lib/bridge/deliveries";
import { hasPermission } from "@/lib/bridge/rbac";
import type { Actor } from "@/lib/bridge/rbac";

export const Route = createFileRoute("/deliveries")({ component: Deliveries });

function Deliveries() {
  return (
    <RequireBridge>
      {(actor) => (
        <BridgeShell actor={actor} title="Deliveries">
          <DeliveryList />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}
function DeliveryList() {
  const q = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const titles = q.data?.titles ?? [];
  if (q.isError) return <p role="alert">Delivery data is unavailable. Refresh to retry.</p>;
  if (q.isPending) return <p className="text-sm text-muted">Loading deliveries…</p>;
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-xl font-semibold">Delivery desk</h2>
      <p className="mt-1 text-sm text-muted">
        Open a title to review its canonical Delivery workspace. No rights or fulfilment rules are
        changed here.
      </p>
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
