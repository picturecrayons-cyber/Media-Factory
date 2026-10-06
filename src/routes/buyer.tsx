import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusChip } from "@/components/bridge/status-rail";
import { Button } from "@/components/ui/button";
import { listTitles } from "@/lib/bridge/titles";
import { createLicenseOrder, listOwnEntitlements, verifyLicensePayment } from "@/lib/bridge/payments";

export const Route = createFileRoute("/buyer")({ component: Buyer });

type RzCtor = new (opts: {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  handler: (res: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
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
        <BridgeShell actor={actor} title="Buyer catalog">
          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted">
            Only titles at live-for-buyers or later appear here. A license is an entitlement after captured payment.
          </p>
          <BuyerBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function BuyerBody() {
  const qc = useQueryClient();
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const entQ = useQuery({ queryKey: ["bridge-entitlements"], queryFn: () => listOwnEntitlements() });
  const entitled = new Set(entQ.data?.entitlements.map((e) => e.titleId));
  const order = useMutation({
    mutationFn: async (titleId: string) => {
      const created = await createLicenseOrder({
        data: { titleId, idempotencyKey: `lic-${titleId}` },
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
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Payment did not complete"),
  });

  const titles = titlesQ.data?.titles ?? [];
  return (
    <div className="space-y-4">
      {!titles.length ? (
        <p className="text-sm text-muted">No live titles yet. Nothing is for sale until licensing-ready clears.</p>
      ) : (
        <ul className="divide-y divide-line rounded-sm border border-line">
          {titles.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
              <div>
                <Link to="/title/$id" params={{ id: t.id }} className="font-medium hover:text-accent">
                  {t.name}
                </Link>
                <p className="text-sm text-muted">
                  {t.language}
                  {t.licensingFeePaise > 0 ? ` · ₹${(t.licensingFeePaise / 100).toFixed(0)}` : " · fee unset"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusChip status={t.status} />
                {entitled.has(t.id) ? (
                  <span className="text-sm text-ok">Licensed</span>
                ) : (
                  <Button
                    type="button"
                    disabled={order.isPending || t.licensingFeePaise <= 0}
                    onClick={() => order.mutate(t.id)}
                  >
                    License
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
