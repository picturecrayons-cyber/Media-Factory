import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getPaidFeaturePricing, createStoryConceptOrder, verifyStoryConceptPayment, createDitAgentOrder, verifyDitAgentPayment, listOwnStoryConceptPayments } from "@/lib/bridge/payments";
import { listTitles } from "@/lib/bridge/titles";
import { createStoryConceptSubmission, listOwnStoryConceptSubmissions, submitStoryConceptForReview } from "@/lib/bridge/story-concept";

type RazorpayResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayCtor = new (options: { key: string; amount: number; currency: string; order_id: string; handler: (result: RazorpayResult) => void; modal?: { ondismiss?: () => void } }) => { open: () => void };

function loadRazorpay(): Promise<RazorpayCtor> {
  return new Promise((resolve, reject) => {
    const win = window as unknown as { Razorpay?: RazorpayCtor };
    if (win.Razorpay) return resolve(win.Razorpay);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => {
      const ctor = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
      if (ctor) resolve(ctor);
      else reject(new Error("Razorpay checkout did not initialize"));
    };
    script.onerror = () => reject(new Error("Razorpay checkout could not load"));
    document.head.appendChild(script);
  });
}

export function PaidFeaturesPanel({ mode }: { mode: "creator" | "studio" }) {
  const qc = useQueryClient();
  const pricingQ = useQuery({ queryKey: ["bridge-paid-feature-pricing", mode], queryFn: () => getPaidFeaturePricing() });
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const conceptsQ = useQuery({ queryKey: ["own-story-concepts"], queryFn: () => listOwnStoryConceptSubmissions() });
  const paymentsQ = useQuery({ queryKey: ["own-story-concept-payments"], queryFn: () => listOwnStoryConceptPayments() });
  const [paymentRecordId, setPaymentRecordId] = useState("");
  const [titleId, setTitleId] = useState("");
  const [logline, setLogline] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [genre, setGenre] = useState("");
  const [format, setFormat] = useState("Feature Film");
  const [rightsBasis, setRightsBasis] = useState<"ORIGINAL_AUTHOR" | "ASSIGNED" | "LICENSED" | "PUBLIC_DOMAIN" | "OTHER">("ORIGINAL_AUTHOR");
  const [estimatedBudgetRange, setEstimatedBudgetRange] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [intendedDistribution, setIntendedDistribution] = useState("");
  const [rightsNotes, setRightsNotes] = useState("");
  const pricing = pricingQ.data;
  const titles = titlesQ.data?.titles ?? [];
  const concepts = conceptsQ.data?.storyConcepts ?? [];
  const payments = paymentsQ.data?.payments ?? [];

  const storyPay = useMutation({
    mutationFn: async () => {
      const order = await createStoryConceptOrder({ data: { idempotencyKey: "story-concept-" + crypto.randomUUID() } });
      const Razorpay = await loadRazorpay();
      await new Promise<void>((resolve, reject) => {
        const checkout = new Razorpay({
          key: order.keyId, amount: order.amountPaise, currency: order.currency, order_id: order.orderId,
          handler: (result) => {
            void verifyStoryConceptPayment({ data: { orderId: result.razorpay_order_id, paymentId: result.razorpay_payment_id, signature: result.razorpay_signature } }).then(() => resolve()).catch(reject);
          },
          modal: { ondismiss: () => reject(new Error("Payment window closed before verification")) },
        });
        checkout.open();
      });
      return order.paymentRecordId;
    },
    onSuccess: async (id) => {
      setPaymentRecordId(id);
      toast.success("Razorpay payment verified. Story Concept setup is unlocked.");
      await qc.invalidateQueries({ queryKey: ["own-story-concept-payments"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Story Concept payment failed"),
  });

  const ditPay = useMutation({
    mutationFn: async () => {
      const order = await createDitAgentOrder({ data: { idempotencyKey: "dit-agent-" + crypto.randomUUID() } });
      const Razorpay = await loadRazorpay();
      await new Promise<void>((resolve, reject) => {
        const checkout = new Razorpay({
          key: order.keyId, amount: order.amountPaise, currency: order.currency, order_id: order.orderId,
          handler: (result) => {
            void verifyDitAgentPayment({ data: { orderId: result.razorpay_order_id, paymentId: result.razorpay_payment_id, signature: result.razorpay_signature } }).then(() => resolve()).catch(reject);
          },
          modal: { ondismiss: () => reject(new Error("Payment window closed before verification")) },
        });
        checkout.open();
      });
    },
    onSuccess: async () => {
      toast.success("DIT Agent payment verified.");
      await qc.invalidateQueries({ queryKey: ["bridge-paid-feature-pricing"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "DIT Agent payment failed"),
  });

  const createConcept = useMutation({
    mutationFn: () => createStoryConceptSubmission({ data: {
      titleId, paymentRecordId, logline, synopsis, genre, format, rightsBasis,
      estimatedBudgetRange: estimatedBudgetRange || undefined,
      targetAudience: targetAudience || undefined,
      intendedDistribution: intendedDistribution || undefined,
      rightsNotes: rightsNotes || undefined,
    } }),
    onSuccess: async () => {
      toast.success("Paid Story Concept setup saved.");
      setPaymentRecordId(""); setLogline(""); setSynopsis(""); setGenre("");
      await qc.invalidateQueries({ queryKey: ["own-story-concepts"] });
      await qc.invalidateQueries({ queryKey: ["own-story-concept-payments"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Story Concept setup failed"),
  });

  const submitConcept = useMutation({
    mutationFn: (id: string) => submitStoryConceptForReview({ data: { storyConceptId: id } }),
    onSuccess: async () => {
      toast.success("Story Concept submitted for review.");
      await qc.invalidateQueries({ queryKey: ["own-story-concepts"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Story Concept submission failed"),
  });

  const story = pricing?.storyConcept;
  const dit = pricing?.ditAgent;
  const storyPrice = story?.amountPaise == null ? "Price not configured" : "₹" + (Number(story.amountPaise) / 100).toLocaleString("en-IN");
  const ditPrice = dit?.amountPaise == null ? "Price not configured" : "₹" + (Number(dit.amountPaise) / 100).toLocaleString("en-IN");

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Paid add-ons</p><h2 className="mt-1 font-display text-xl font-semibold">Story Concept and DIT Agent</h2><p className="mt-1 text-sm text-muted">Setup remains blocked until Razorpay capture and server-side verification are complete.</p></div>
      <div className="grid gap-3 md:grid-cols-2">
        <article className="rounded-xl border border-line p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Story Concept</h3><span className="text-sm font-semibold">{storyPrice}</span></div>
          <p className="mt-2 text-xs text-muted">{story?.available ? "Active service and rate. Pay through Razorpay to unlock setup." : story?.exists ? "Rate exists but the service is disabled or the rate is not currently active. No Razorpay order will be created." : "Service and rate are not configured."}</p>
          <Button className="mt-3" disabled={!story?.available || storyPay.isPending} onClick={() => storyPay.mutate()}>{storyPay.isPending ? "Opening Razorpay…" : "Pay Story Concept fee"}</Button>
        </article>
        {mode === "studio" ? <article className="rounded-xl border border-line p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">DIT Agent</h3><span className="text-sm font-semibold">{ditPrice}</span></div>
          <p className="mt-2 text-xs text-muted">{dit?.available ? "Active service and rate. Pay through Razorpay to unlock DIT upload." : dit?.exists ? "DIT Agent service or rate is disabled. No Razorpay order will be created." : "DIT_AGENT service code and price are not configured. Upload remains blocked."}</p>
          <Button className="mt-3" disabled={!dit?.available || ditPay.isPending} onClick={() => ditPay.mutate()}>{ditPay.isPending ? "Opening Razorpay…" : "Pay DIT Agent fee"}</Button>
        </article> : null}
      </div>

      {(paymentRecordId || payments.length > 0) ? (
        <div className="space-y-3 rounded-xl border border-line p-4">
          <h3 className="font-semibold">Paid Story Concept setup</h3>
          {!paymentRecordId ? <div className="flex flex-wrap items-center gap-2"><select value={paymentRecordId} onChange={(e) => setPaymentRecordId(e.target.value)} className="h-10 min-w-64 rounded-lg border border-line bg-bg px-3 text-sm"><option value="">Select a verified payment</option>{payments.map((p:any) => <option key={p.id} value={p.id}>₹{(Number(p.amount_paise)/100).toLocaleString("en-IN")} · {p.verified_at}</option>)}</select></div> : <p className="text-xs text-muted">Razorpay payment verified · record {paymentRecordId}</p>}
          <select value={titleId} onChange={(e) => setTitleId(e.target.value)} className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm"><option value="">Select your title preparation</option>{titles.map((t:any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <input value={logline} onChange={(e) => setLogline(e.target.value)} placeholder="Logline (minimum 10 characters)" className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm" />
          <textarea value={synopsis} onChange={(e) => setSynopsis(e.target.value)} placeholder="Story Concept synopsis (minimum 30 characters)" className="min-h-28 w-full rounded-lg border border-line bg-bg p-3 text-sm" />
          <div className="grid gap-2 sm:grid-cols-2"><input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="Genre" className="h-10 rounded-lg border border-line bg-bg px-3 text-sm" /><input value={format} onChange={(e) => setFormat(e.target.value)} placeholder="Format" className="h-10 rounded-lg border border-line bg-bg px-3 text-sm" /><input value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="Target audience (optional)" className="h-10 rounded-lg border border-line bg-bg px-3 text-sm" /><input value={estimatedBudgetRange} onChange={(e) => setEstimatedBudgetRange(e.target.value)} placeholder="Estimated budget range (optional)" className="h-10 rounded-lg border border-line bg-bg px-3 text-sm" /><input value={intendedDistribution} onChange={(e) => setIntendedDistribution(e.target.value)} placeholder="Intended distribution (optional)" className="h-10 rounded-lg border border-line bg-bg px-3 text-sm" /></div>
          <select value={rightsBasis} onChange={(e) => setRightsBasis(e.target.value as typeof rightsBasis)} className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm"><option value="ORIGINAL_AUTHOR">Original author</option><option value="ASSIGNED">Assigned</option><option value="LICENSED">Licensed</option><option value="PUBLIC_DOMAIN">Public domain</option><option value="OTHER">Other</option></select>
          <textarea value={rightsNotes} onChange={(e) => setRightsNotes(e.target.value)} placeholder="Rights notes (optional)" className="min-h-20 w-full rounded-lg border border-line bg-bg p-3 text-sm" />
          <Button disabled={!paymentRecordId || !titleId || logline.trim().length < 10 || synopsis.trim().length < 30 || genre.trim().length < 2 || createConcept.isPending} onClick={() => createConcept.mutate()}>{createConcept.isPending ? "Saving…" : "Create paid Story Concept"}</Button>
        </div>
      ) : null}

      {concepts.length ? <div className="space-y-2"><h3 className="font-semibold">Your Story Concepts</h3>{concepts.map((item:any)=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"><div><p className="text-sm font-semibold">{item.title_name}</p><p className="mt-1 text-xs text-muted">Fee: {item.fee_certified_at ? "PAID / VERIFIED" : "NOT PAID"} · Status: {item.owner_submission_status} · Legal: {item.legal_status}</p></div>{item.owner_submission_status === "DRAFT" ? <Button variant="outline" disabled={submitConcept.isPending} onClick={() => submitConcept.mutate(item.id)}>Submit for review</Button> : null}</div>)}</div> : null}
    </section>
  );
}
