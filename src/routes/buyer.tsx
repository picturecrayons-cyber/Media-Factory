import { useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusChip } from "@/components/bridge/status-rail";
import { Button } from "@/components/ui/button";
import { listTitles } from "@/lib/bridge/titles";
import {
  createLicenseOrder,
  listOwnEntitlements,
  verifyLicensePayment,
} from "@/lib/bridge/payments";

export const Route = createFileRoute("/buyer")({ component: Buyer });

type RzCtor = new (opts: {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  handler: (res: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
}) => { open: () => void };

function loadRazorpay(): Promise<RzCtor> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { Razorpay?: RzCtor };
    if (w.Razorpay) {
      resolve(w.Razorpay);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => {
      const ctor = (window as unknown as { Razorpay?: RzCtor }).Razorpay;
      if (ctor) resolve(ctor);
      else reject(new Error("Razorpay checkout missing"));
    };
    s.onerror = () => reject(new Error("Razorpay checkout failed to load"));
    document.head.appendChild(s);
  });
}

function Buyer() {
  return (
    <RequireBridge>
      {(actor) => {
        if (actor.internalRole === "admin" || actor.internalRole === "super_admin") {
          return <AdminBuyerDesk actor={actor} />;
        }
        if (actor.internalRole || actor.accountType !== "buyer") {
          return <Navigate to={actor.internalRole ? "/internal" : "/dashboard"} />;
        }
        return (
          <BridgeShell actor={actor} title="Buyer dashboard">
            <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted">
              Discover licensing-ready titles, open a listing, then license only after captured payment.
            </p>
            <BuyerBody />
          </BridgeShell>
        );
      }}
    </RequireBridge>
  );
}

function AdminBuyerDesk({ actor }: { actor: { internalRole: string | null; organizationName?: string | null; displayName?: string } }) {
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const liveTitles = (titlesQ.data?.titles ?? []).filter((title) => title.status === "LIVE_FOR_BUYERS");

  return (
    <BridgeShell actor={actor as never} title="Buyer Desk · Admin Preview">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Read-only · Admin / Super Admin</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Buyer-facing catalogue</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Inspect only titles whose Bridge lifecycle is LIVE FOR BUYERS. This administrator view does not create orders, trigger payments, grant entitlements, or publish titles.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/admin"><Button variant="outline">Back to Command Center</Button></Link>
          <Link to="/cms" search={{ tab: "licensing" }}><Button variant="outline">Licensing readiness</Button></Link>
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4">
          <div>
            <h3 className="font-semibold">Live buyer listings</h3>
            <p className="mt-1 text-sm text-muted">Canonical Bridge records · no unpublished or preparing titles are shown.</p>
          </div>
          <span className="rounded-full border border-line px-3 py-1 text-sm font-semibold tabular-nums">{titlesQ.isPending ? "—" : liveTitles.length} titles</span>
        </div>
        {titlesQ.isPending ? (
          <p className="px-4 py-6 text-sm text-muted">Loading buyer listings…</p>
        ) : titlesQ.isError ? (
          <p role="alert" className="px-4 py-6 text-sm text-muted">Buyer listings could not be loaded. Refresh to retry; no empty catalogue is inferred.</p>
        ) : !liveTitles.length ? (
          <p className="px-4 py-6 text-sm text-muted">No titles are currently marked LIVE FOR BUYERS in the canonical Bridge records.</p>
        ) : (
          <ul className="divide-y divide-line">
            {liveTitles.map((title) => (
              <li key={title.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">{title.name}</p>
                  <p className="mt-1 text-sm text-muted">{title.language} · {title.licensingFeePaise > 0 ? `₹${Math.round(title.licensingFeePaise / 100)}` : "Fee not set"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-line px-2 py-1 text-xs text-muted">LIVE FOR BUYERS</span>
                  <Link to="/title/$id" params={{ id: title.id }} className="text-sm font-semibold text-accent hover:underline">Inspect title →</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </BridgeShell>
  );
}

function BuyerBody() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"discover" | "listing" | "licenses">("discover");
  const [query, setQuery] = useState("");
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const entQ = useQuery({
    queryKey: ["bridge-entitlements"],
    queryFn: () => listOwnEntitlements(),
  });
  const entitled = new Set(entQ.data?.entitlements.map((e) => e.titleId));
  const order = useMutation({
    mutationFn: async (titleId: string) => {
      const created = await createLicenseOrder({
        data: { titleId, idempotencyKey: `lic-${titleId}-${Date.now()}` },
      });
      const Razorpay = await loadRazorpay();
      await new Promise<void>((resolve, reject) => {
        const ck = new Razorpay({
          key: created.keyId,
          amount: created.amountPaise,
          currency: created.currency,
          order_id: created.orderId,
          handler: (res) => {
            void verifyLicensePayment({
              data: {
                orderId: res.razorpay_order_id,
                paymentId: res.razorpay_payment_id,
                signature: res.razorpay_signature,
              },
            })
              .then(() => resolve())
              .catch(reject);
          },
        });
        ck.open();
      });
    },
    onSuccess: () => {
      toast("Payment captured — entitlement recorded");
      void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
      void qc.invalidateQueries({ queryKey: ["bridge-entitlements"] });
      setTab("licenses");
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Payment did not complete"),
  });

  const titles = titlesQ.data?.titles ?? [];
  const needle = query.trim().toLowerCase();
  const visible = titles.filter((t) => !needle || `${t.name} ${t.language}`.toLowerCase().includes(needle));
  const licensed = visible.filter((t) => entitled.has(t.id));
  if (titlesQ.isPending || entQ.isPending) return <p>Loading buyer dashboard…</p>;
  if (titlesQ.isError)
    return (
      <p role="alert">
        No licensing-ready titles are on the desk yet.{" "}
        <button type="button" className="underline" onClick={() => void titlesQ.refetch()}>Refresh</button>
      </p>
    );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Discover" value={String(titles.length)} note="Live for buyers" />
        <Stat label="Listing" value={String(visible.length)} note="Matching this search" />
        <Stat label="Licenses" value={String(licensed.length)} note="Captured entitlements" />
      </div>
      <div className="flex flex-wrap gap-2">
        {(["discover", "listing", "licenses"] as const).map((id) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-sm border px-3 py-1.5 text-sm capitalize ${tab === id ? "border-accent text-accent" : "border-line text-muted"}`}>
            {id}
          </button>
        ))}
      </div>
      {tab !== "licenses" && (
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title or language" className="w-full max-w-md rounded-sm border border-line bg-transparent px-3 py-2 text-sm" />
      )}
      {!titles.length ? (
        <p className="text-sm text-muted">No live titles yet. Nothing is for sale until licensing-ready clears.</p>
      ) : tab === "licenses" ? (
        <TitleList titles={licensed} entitled={entitled} order={order} empty="No licenses yet. Discover a title and complete payment." />
      ) : (
        <TitleList titles={visible} entitled={entitled} order={order} empty="No titles match this search." />
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-sm border border-line px-4 py-3">
      <div className="text-xs uppercase tracking-widest text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted">{note}</div>
    </div>
  );
}

function TitleList({ titles, entitled, order, empty }: { titles: Array<{ id: string; name: string; language: string; licensingFeePaise: number; status: string }>; entitled: Set<string>; order: { isPending: boolean; mutate: (id: string) => void }; empty: string }) {
  if (!titles.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line rounded-sm border border-line">
      {titles.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <Link to="/title/$id" params={{ id: t.id }} className="font-medium hover:text-accent">{t.name}</Link>
            <p className="text-sm text-muted">{t.language}{t.licensingFeePaise > 0 ? ` · ₹${(t.licensingFeePaise / 100).toFixed(0)}` : " · fee unset"}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusChip status={t.status as never} />
            {entitled.has(t.id) ? <span className="text-sm text-accent">Licensed</span> : <Button disabled={order.isPending || t.licensingFeePaise <= 0} onClick={() => order.mutate(t.id)}>License</Button>}
          </div>
        </li>
      ))}
    </ul>
  );
}
