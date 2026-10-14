import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
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
  modal?: { ondismiss?: () => void };
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
          <p className="mb-5 max-w-2xl text-sm leading-relaxed text-muted">
            Find licensing-ready titles and manage your licenses in one place.
          </p>
          <BuyerBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function BuyerBody() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"discover" | "licenses">("discover");
  const [query, setQuery] = useState("");
  // Reuse the same key for retries of one title purchase; do not mint a new
  // key on every click. Clear it only after server verification succeeds.
  const idempotencyKeys = useRef(new Map<string, string>());
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const entQ = useQuery({
    queryKey: ["bridge-entitlements"],
    queryFn: () => listOwnEntitlements(),
  });
  const entitled = new Set(entQ.data?.entitlements.map((e) => e.titleId));

  const order = useMutation({
    mutationFn: async (titleId: string) => {
      let idempotencyKey = idempotencyKeys.current.get(titleId);
      if (!idempotencyKey) {
        idempotencyKey = `lic-${titleId}-${crypto.randomUUID()}`;
        idempotencyKeys.current.set(titleId, idempotencyKey);
      }
      const created = await createLicenseOrder({
        data: { titleId, idempotencyKey },
      });
      const Razorpay = await loadRazorpay();
      await new Promise<void>((resolve, reject) => {
        let verified = false;
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
              .then(() => {
                verified = true;
                resolve();
              })
              .catch(reject);
          },
          modal: {
            ondismiss: () => {
              if (!verified) reject(new Error("Checkout closed before payment was verified"));
            },
          },
        });
        ck.open();
      });
      return titleId;
    },
    onSuccess: (_titleId, titleId) => {
      idempotencyKeys.current.delete(titleId);
      toast("License payment verified");
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

  if (titlesQ.isPending || entQ.isPending) return <p>Loading buyer workspace…</p>;
  if (titlesQ.isError)
    return (
      <p role="alert">
        Titles could not be loaded.{" "}
        <button type="button" className="underline" onClick={() => void titlesQ.refetch()}>Try again</button>
      </p>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex gap-2" aria-label="Buyer workspace">
          <button
            type="button"
            onClick={() => setTab("discover")}
            aria-pressed={tab === "discover"}
            className={`rounded-sm px-3 py-2 text-sm ${tab === "discover" ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}
          >
            Discover titles
          </button>
          <button
            type="button"
            onClick={() => setTab("licenses")}
            aria-pressed={tab === "licenses"}
            className={`rounded-sm px-3 py-2 text-sm ${tab === "licenses" ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}
          >
            My licenses
          </button>
        </div>
        {tab === "discover" && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or language"
            aria-label="Search titles by name or language"
            className="w-full max-w-xs rounded-sm border border-line bg-transparent px-3 py-2 text-sm"
          />
        )}
      </div>

      {!titles.length ? (
        <p className="py-6 text-sm text-muted">
          No licensing-ready titles are available yet. Titles appear here after Bridge authorizes buyer access.
        </p>
      ) : tab === "licenses" ? (
        <TitleList titles={licensed} entitled={entitled} order={order} empty="Your completed licenses will appear here." />
      ) : (
        <TitleList titles={visible} entitled={entitled} order={order} empty="No titles match this search." />
      )}
    </div>
  );
}

function TitleList({
  titles,
  entitled,
  order,
  empty,
}: {
  titles: Array<{ id: string; name: string; language: string; licensingFeePaise: number; status: string }>;
  entitled: Set<string>;
  order: { isPending: boolean; mutate: (id: string) => void };
  empty: string;
}) {
  if (!titles.length) return <p className="py-6 text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line rounded-sm border border-line">
      {titles.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <Link to="/title/$id" params={{ id: t.id }} className="font-medium hover:text-accent">
              {t.name}
            </Link>
            <p className="mt-1 text-sm text-muted">
              {t.language} · {t.licensingFeePaise > 0 ? `₹${(t.licensingFeePaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "Price unavailable"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {entitled.has(t.id) ? (
              <span className="text-sm font-medium text-accent">Licensed</span>
            ) : tabSafeOrderButton(t, order)}
          </div>
        </li>
      ))}
    </ul>
  );
}

function tabSafeOrderButton(
  title: { id: string; licensingFeePaise: number },
  order: { isPending: boolean; mutate: (id: string) => void },
) {
  return (
    <Button
      disabled={order.isPending || title.licensingFeePaise <= 0}
      onClick={() => order.mutate(title.id)}
    >
      {order.isPending ? "Opening checkout…" : "License"}
    </Button>
  );
}
