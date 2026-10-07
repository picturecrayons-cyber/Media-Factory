import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
    <RequireBridge allow="buyer">
      {(actor) => (
        <BridgeShell actor={actor} title="Buyer dashboard">
          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted">
            Discover licensing-ready titles, open a listing, then license only after captured payment.
          </p>
          <BuyerBody />
        </BridgeShell>
      )}
    </RequireBridge>
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
  if (titlesQ.isError || entQ.isError)
    return <p role="alert">Buyer catalog or entitlement data is unavailable. Refresh to retry.</p>;

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
            <StatusChip status={t.status} />
            {entitled.has(t.id) ? <span className="text-sm text-accent">Licensed</span> : <Button disabled={order.isPending || t.licensingFeePaise <= 0} onClick={() => order.mutate(t.id)}>License</Button>}
          </div>
        </li>
      ))}
    </ul>
  );
}
