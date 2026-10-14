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
  listOwnAcceptedLicenseDeals,
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

type BuyerDeal = {
  id: string;
  titleId: string;
  titleName: string;
  language: string;
  rightsCategory: string;
  territories: string[];
  languages: string[];
  mediaModes: string[];
  termStart: string;
  termEnd: string;
  exclusivity: string;
  agreedFeePaise: number;
  currency: string;
  status: string;
};

function BuyerBody() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"discover" | "licenses">("discover");
  const [query, setQuery] = useState("");
  // Persist per-deal idempotency keys for this browser session so reloads and
  // checkout retries reuse the same server-side purchase identity.
  const idempotencyKeys = useRef(new Map<string, string>());
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const entQ = useQuery({
    queryKey: ["bridge-entitlements"],
    queryFn: () => listOwnEntitlements(),
  });
  const dealsQ = useQuery({
    queryKey: ["bridge-accepted-license-deals"],
    queryFn: () => listOwnAcceptedLicenseDeals(),
  });
  const entitled = new Set(entQ.data?.entitlements.map((e) => e.titleId));
  const entitledDeals = new Set(entQ.data?.entitlements.map((e) => e.dealId).filter((id): id is string => Boolean(id)));

  const order = useMutation({
    mutationFn: async ({ titleId, dealId }: { titleId: string; dealId: string }) => {
      let idempotencyKey = idempotencyKeys.current.get(dealId);
      if (!idempotencyKey) {
        idempotencyKey = `lic-${dealId}-${crypto.randomUUID()}`;
        idempotencyKeys.current.set(dealId, idempotencyKey);
      }
      const created = await createLicenseOrder({
        data: { titleId, dealId, idempotencyKey },
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
      return { titleId, dealId };
    },
    onSuccess: (_result, variables) => {
      idempotencyKeys.current.delete(variables.dealId);
      toast("License payment verified");
      void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
      void qc.invalidateQueries({ queryKey: ["bridge-entitlements"] });
      void qc.invalidateQueries({ queryKey: ["bridge-accepted-license-deals"] });
      setTab("licenses");
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Payment did not complete"),
  });

  const titles = titlesQ.data?.titles ?? [];
  const needle = query.trim().toLowerCase();
  const visible = titles.filter((t) => !needle || `${t.name} ${t.language}`.toLowerCase().includes(needle));
  const licensed = titles.filter((t) => entitled.has(t.id));

  if (titlesQ.isPending || entQ.isPending || dealsQ.isPending) return <p>Loading buyer workspace…</p>;
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
        <TitleList titles={licensed} entitled={entitled} entitledDeals={entitledDeals} deals={[]} order={order} mode="licenses" empty="Your completed licenses will appear here." />
      ) : (
        <TitleList titles={visible} entitled={entitled} entitledDeals={entitledDeals} deals={dealsQ.data?.deals ?? []} order={order} mode="discover" empty="No titles match this search." />
      )}
    </div>
  );
}

function TitleList({
  titles,
  entitled,
  entitledDeals,
  deals,
  order,
  mode,
  empty,
}: {
  titles: Array<{ id: string; name: string; language: string; licensingFeePaise: number; status: string }>;
  entitled: Set<string>;
  entitledDeals: Set<string>;
  deals: BuyerDeal[];
  order: { isPending: boolean; mutate: (input: { titleId: string; dealId: string }) => void };
  mode: "discover" | "licenses";
  empty: string;
}) {
  if (!titles.length) return <p className="py-6 text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line rounded-sm border border-line">
      {titles.map((t) => {
        const titleDeals = deals.filter((deal) => deal.titleId === t.id);
        return (
          <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
            <div className="min-w-0 flex-1">
              <Link to="/title/$id" params={{ id: t.id }} className="font-medium hover:text-accent">
                {t.name}
              </Link>
              <p className="mt-1 text-sm text-muted">{t.language}</p>
              {mode === "discover" && (
                <div className="mt-3 space-y-2">
                  {!titleDeals.length ? (
                    <p className="text-sm text-muted">No accepted offer is available. Bridge must record an approved deal before checkout.</p>
                  ) : titleDeals.map((deal) => (
                    <div key={deal.id} className="rounded-sm border border-line p-3">
                      <p className="font-medium">{deal.rightsCategory} · {deal.exclusivity === "EXCLUSIVE" ? "Exclusive" : "Non-exclusive"}</p>
                      <p className="mt-1 text-sm text-muted">
                        {deal.territories.join(", ")} · {deal.languages.join(", ")} · {deal.termStart} to {deal.termEnd}
                      </p>
                      <p className="mt-1 text-sm">
                        {deal.currency} {(deal.agreedFeePaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <div className="mt-2">
                        {entitledDeals.has(deal.id) ? (
                          <span className="text-sm font-medium text-accent">Licensed under this deal</span>
                        ) : (
                          <Button disabled={order.isPending} onClick={() => order.mutate({ titleId: t.id, dealId: deal.id })}>
                            {order.isPending ? "Opening checkout…" : "Pay agreed fee"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {mode === "licenses" && entitled.has(t.id) && (
              <span className="text-sm font-medium text-accent">Licensed</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
