import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createStoryConceptSubmission } from "@/lib/bridge/story-concept-api";
import {
  createStoryConceptOrder,
  getStoryConceptFee,
  verifyStoryConceptPayment,
} from "@/lib/bridge/payments";

const GENRES = [
  "Drama", "Thriller", "Comedy", "Romance", "Action", "Documentary",
  "Horror", "Family", "Crime", "Sci-Fi", "Period", "Other",
];
const PLATFORMS = [
  "OTT", "Theatrical", "Broadcast", "Festival", "International", "Investor pitch",
];

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
  modal?: { ondismiss: () => void };
}) => { open: () => void };

function loadRazorpay(): Promise<RzCtor> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { Razorpay?: RzCtor };
    if (w.Razorpay) return resolve(w.Razorpay);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => w.Razorpay
      ? resolve(w.Razorpay)
      : reject(new Error("Razorpay Checkout did not initialize"));
    script.onerror = () => reject(new Error("Razorpay Checkout could not be loaded"));
    document.head.appendChild(script);
  });
}

function formatRupees(amountPaise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", minimumFractionDigits: 2,
  }).format(amountPaise / 100);
}

export function StoryConceptForm() {
  const navigate = useNavigate();
  const [titleName, setTitleName] = useState("");
  const [logline, setLogline] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [language, setLanguage] = useState("Malayalam");
  const [genre, setGenre] = useState<string[]>([]);
  const [targetPlatforms, setTargetPlatforms] = useState<string[]>([]);
  const [estimatedBudgetRange, setEstimatedBudgetRange] = useState("");
  const [treatmentUrl, setTreatmentUrl] = useState("");
  const [screenplayUrl, setScreenplayUrl] = useState("");
  const [draftTitleId, setDraftTitleId] = useState<string | null>(null);

  const feeQ = useQuery({
    queryKey: ["story-concept-submission-fee"],
    queryFn: () => getStoryConceptFee(),
    retry: 1,
  });

  const payment = useMutation({
    mutationFn: async () => {
      let titleId = draftTitleId;
      if (!titleId) {
        const draft = await createStoryConceptSubmission({
          data: {
            titleName, logline, synopsis, language, genre, targetPlatforms,
            estimatedBudgetRange: estimatedBudgetRange || undefined,
            treatmentUrl: treatmentUrl || undefined,
            screenplayUrl: screenplayUrl || undefined,
          },
        });
        titleId = draft.titleId;
        setDraftTitleId(titleId);
      }

      const order = await createStoryConceptOrder({
        data: { titleId, idempotencyKey: `concept-${titleId}-${feeQ.data?.rateVersion ?? "rate"}-${feeQ.data?.taxRateId ?? "tax"}` },
      });
      const Razorpay = await loadRazorpay();
      await new Promise<void>((resolve, reject) => {
        const checkout = new Razorpay({
          key: order.keyId,
          amount: order.amountPaise,
          currency: order.currency,
          order_id: order.orderId,
          modal: {
            ondismiss: () => reject(new Error("Checkout closed. The concept remains a draft until payment is verified.")),
          },
          handler: (result) => {
            void verifyStoryConceptPayment({
              data: {
                orderId: result.razorpay_order_id,
                paymentId: result.razorpay_payment_id,
                signature: result.razorpay_signature,
              },
            }).then(() => resolve()).catch(reject);
          },
        });
        checkout.open();
      });
      return titleId;
    },
    onSuccess: (titleId) => {
      toast("Payment verified. Story / Concept submitted for admin curation.");
      void navigate({ to: "/title/$id", params: { id: titleId } });
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Payment was not verified"),
  });

  function toggle(value: string, list: string[], setList: (v: string[]) => void) {
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!feeQ.data?.available) {
      toast("The Story / Concept submission fee is not certified yet. No payment can be collected.");
      return;
    }
    if (logline.trim().length < 10) {
      toast("Logline must be at least 10 characters");
      return;
    }
    if (synopsis.trim().length < 40) {
      toast("Synopsis must be at least 40 characters");
      return;
    }
    payment.mutate();
  }

  const feeAvailable = feeQ.data?.available === true;
  const feeLoading = feeQ.isPending;

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">
        Working title
        <input required value={titleName} onChange={(e) => setTitleName(e.target.value)}
          disabled={Boolean(draftTitleId) || payment.isPending}
          className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"
          placeholder="Project title" />
      </label>

      <label className="text-sm sm:col-span-2">
        Logline
        <textarea required rows={2} maxLength={500} value={logline}
          onChange={(e) => setLogline(e.target.value)} disabled={Boolean(draftTitleId) || payment.isPending}
          className="mt-1 w-full rounded-lg border border-line-strong bg-elevated px-3 py-2"
          placeholder="One or two sentences that sell the concept" />
      </label>

      <label className="text-sm sm:col-span-2">
        Synopsis
        <textarea required rows={5} maxLength={8000} value={synopsis}
          onChange={(e) => setSynopsis(e.target.value)} disabled={Boolean(draftTitleId) || payment.isPending}
          className="mt-1 w-full rounded-lg border border-line-strong bg-elevated px-3 py-2"
          placeholder="Full story synopsis" />
      </label>

      <label className="text-sm">
        Language
        <select value={language} onChange={(e) => setLanguage(e.target.value)}
          disabled={Boolean(draftTitleId) || payment.isPending}
          className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3">
          {["Malayalam", "Tamil", "Telugu", "Kannada", "Hindi", "English"].map((x) => <option key={x}>{x}</option>)}
        </select>
      </label>

      <label className="text-sm">
        Estimated budget range
        <input value={estimatedBudgetRange} onChange={(e) => setEstimatedBudgetRange(e.target.value)}
          disabled={Boolean(draftTitleId) || payment.isPending}
          className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"
          placeholder="e.g. under 1 Cr / 1–3 Cr / 3–10 Cr" />
      </label>

      <div className="sm:col-span-2">
        <p className="text-sm font-medium">Genre</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <label key={g} className="rounded-full border border-line px-3 py-1.5 text-sm">
              <input className="mr-2" type="checkbox" checked={genre.includes(g)}
                disabled={Boolean(draftTitleId) || payment.isPending}
                onChange={() => toggle(g, genre, setGenre)} />{g}
            </label>
          ))}
        </div>
      </div>

      <div className="sm:col-span-2">
        <p className="text-sm font-medium">Target platforms / outcome</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <label key={p} className="rounded-full border border-line px-3 py-1.5 text-sm">
              <input className="mr-2" type="checkbox" checked={targetPlatforms.includes(p)}
                disabled={Boolean(draftTitleId) || payment.isPending}
                onChange={() => toggle(p, targetPlatforms, setTargetPlatforms)} />{p}
            </label>
          ))}
        </div>
      </div>

      <label className="text-sm sm:col-span-2">
        Treatment URL (optional)
        <input type="url" value={treatmentUrl} onChange={(e) => setTreatmentUrl(e.target.value)}
          disabled={Boolean(draftTitleId) || payment.isPending}
          className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" placeholder="https://…" />
      </label>

      <label className="text-sm sm:col-span-2">
        Screenplay URL (optional)
        <input type="url" value={screenplayUrl} onChange={(e) => setScreenplayUrl(e.target.value)}
          disabled={Boolean(draftTitleId) || payment.isPending}
          className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" placeholder="https://…" />
      </label>

      <div className="rounded-xl border border-line bg-elevated p-4 text-xs leading-relaxed text-muted sm:col-span-2">
        {feeLoading ? (
          <p>Checking the certified Story / Concept submission fee…</p>
        ) : feeQ.isError ? (
          <p role="alert">The fee schedule could not be checked. Retry before submitting; no payment has been requested.</p>
        ) : feeAvailable ? (
          <>
            <p className="font-semibold text-fg">Submission fee: {formatRupees(feeQ.data!.amountPaise!)}</p>
            <p className="mt-1">Base fee {formatRupees(feeQ.data!.subtotalPaise!)} + tax {formatRupees(feeQ.data!.taxPaise!)} ({feeQ.data!.taxRatePercent}%).</p>
            <p className="mt-1">Payment is processed by Razorpay. Only a server-verified capture moves this concept into the admin curation queue. This fee is not a licence, investment or guarantee of approval, buyer interest or distribution.</p>
          </>
        ) : (
          <p>Submission fee is not yet certified by Finance / Super Admin. Payment and network submission remain locked; no charge can be made.</p>
        )}
        {draftTitleId ? <p className="mt-2">Draft saved. Complete payment to submit it to the Network.</p> : null}
      </div>

      <div className="sm:col-span-2">
        <Button type="submit" disabled={payment.isPending || feeLoading || !feeAvailable}
          className="w-full rounded-full sm:w-auto sm:px-8">
          {payment.isPending ? "Opening secure payment…" : draftTitleId ? "Retry payment" : "Pay & Submit to Network"}
        </Button>
      </div>
    </form>
  );
}
