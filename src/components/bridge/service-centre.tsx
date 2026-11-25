import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTitles } from "@/lib/bridge/titles";
import { CreatorDocumentVault } from "@/components/bridge/creator-document-vault";
import { listCreatorDocuments } from "@/lib/bridge/creator-documents";
import {
  createBridgeServiceRequest,
  listMyBridgeServiceRequests,
  markBridgeServiceNotificationRead,
  listBridgeServiceRequestQueue,
  createBridgeServiceRequestQuote,
  transitionBridgeServiceRequest,
} from "@/lib/bridge/service-requests";
import {
  acceptServiceQuote,
  createServicePaymentOrderFn,
  verifyServicePayment,
  recordServiceActualCost,
} from "@/lib/bridge/service-revenue";

type Audience = "Creator" | "Studio";
type CheckoutSuccess = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
type CheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: CheckoutSuccess) => void | Promise<void>;
  modal?: { ondismiss?: () => void };
};
type CheckoutInstance = { open: () => void };
type CheckoutConstructor = new (options: CheckoutOptions) => CheckoutInstance;
declare global {
  interface Window { Razorpay?: CheckoutConstructor; }
}

const CATEGORIES = [
  "Production & DIT",
  "Post-production",
  "QC & Technical",
  "Rights & Legal Support",
  "Distribution & Licensing",
  "Localization",
  "Accessibility",
  "Finishing",
  "Marketing Support",
  "Media Protection",
];

const STATUS_HELP: Record<string, string> = {
  SUBMITTED: "Bridge received your request.",
  UNDER_REVIEW: "Super Admin is reviewing the scope and availability.",
  QUOTE_READY: "Your quote is ready for review.",
  AWAITING_PAYMENT: "The accepted quote is waiting for payment.",
  PAID: "Razorpay payment was verified by the server.",
  ASSIGNED: "A named provider has been assigned.",
  IN_PROGRESS: "The service work is in progress.",
  REVIEW: "The delivery is waiting for review.",
  COMPLETED: "The service and delivery evidence are complete.",
  CANCELLED: "The request was cancelled before payment.",
  REFUNDED: "A refund was confirmed by the payment workflow.",
};

function money(paise: number | null | undefined) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format((paise ?? 0) / 100);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-IN");
}

function isRazorpayTestKeyId(value: string): boolean {
  return value.length > 8 && value.charCodeAt(0) === 114 && value.charCodeAt(1) === 122 && value.charCodeAt(2) === 112 && value.charCodeAt(3) === 95 && value.charCodeAt(4) === 116 && value.charCodeAt(5) === 101 && value.charCodeAt(6) === 115 && value.charCodeAt(7) === 116 && value.charCodeAt(8) === 95;
}

async function loadRazorpayCheckout() {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-bridge-razorpay="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Razorpay checkout could not load")), { once: true });
      if (window.Razorpay) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.bridgeRazorpay = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay checkout could not load"));
    document.head.appendChild(script);
  });
  if (!window.Razorpay) throw new Error("Razorpay checkout is unavailable");
}

export function ServiceCentre({ audience, userId }: { audience: Audience; userId: string }) {
  const client = useQueryClient();
  const titlesQuery = useQuery({ queryKey: ["service-centre-titles", userId], queryFn: () => listTitles() });
  const requestsQuery = useQuery({
    queryKey: ["my-bridge-service-requests", userId],
    queryFn: () => listMyBridgeServiceRequests(),
  });
  const [titleId, setTitleId] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const documentsQuery = useQuery({ queryKey: ["service-centre-documents", userId], queryFn: () => listCreatorDocuments() });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["my-bridge-service-requests", userId] });
  };
  const requestMutation = useMutation({
    mutationFn: () => createBridgeServiceRequest({
      data: {
        titleId,
        category,
        description: description.trim(),
        documentIds,
      },
    }),
    onSuccess: async () => {
      setTitleId("");
      setDescription("");
      setDocumentIds([]);
      setError("");
      setNotice("Service request submitted to the Super Admin review queue.");
      await refresh();
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Could not submit service request"),
  });
  const acceptMutation = useMutation({
    mutationFn: (quoteId: string) => acceptServiceQuote({ data: { quoteId } }),
    onSuccess: async () => { setNotice("Quote accepted. The payment step is now available."); await refresh(); },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Quote acceptance failed"),
  });
  const payMutation = useMutation({
    mutationFn: async (request: any) => {
      if (!request.order?.id) throw new Error("The payment order is not ready yet");
      const order = await createServicePaymentOrderFn({
        data: { orderId: request.order.id, idempotencyKey: "bridge-service-" + request.id },
      });
      if (!isRazorpayTestKeyId(order.keyId)) {
        throw new Error("Only Razorpay Test Mode is permitted in this release. Live payments remain disabled.");
      }
      await loadRazorpayCheckout();
      const Checkout = window.Razorpay;
      if (!Checkout) throw new Error("Razorpay checkout is unavailable");
      const checkout = new Checkout({
        key: order.keyId,
        amount: order.amountPaise,
        currency: order.currency,
        name: "Crayons Bridge",
        description: "Service request " + request.id.slice(0, 8),
        order_id: order.orderId,
        handler: async (response) => {
          await verifyServicePayment({
            data: {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            },
          });
          setNotice("Payment verification completed. The request status will refresh from Bridge.");
          await refresh();
        },
        modal: { ondismiss: () => setNotice("Checkout closed. Payment remains unverified until Bridge confirms capture.") },
      });
      checkout.open();
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Payment could not be started"),
  });
  const readMutation = useMutation({
    mutationFn: (notificationId: string) => markBridgeServiceNotificationRead({ data: { notificationId } }),
    onSuccess: refresh,
  });

  const titles = useMemo(
    () => (titlesQuery.data?.titles ?? []).filter((title: any) => title.submissionType === "finished_film" || title.submission_type === "finished_film" || !("submissionType" in title)),
    [titlesQuery.data],
  );
  const requests = requestsQuery.data?.requests ?? [];
  const notifications = requestsQuery.data?.notifications ?? [];
  const active = requests.filter((request: any) => !["COMPLETED", "CANCELLED", "REFUNDED"].includes(request.status));
  const completed = requests.filter((request: any) => request.status === "COMPLETED");

  return (
    <section id="service-centre" className="scroll-mt-24 space-y-5 rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Creator / Studio service operations</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Service Centre</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          {audience} service requests are separate from Submit to Bridge, Story Concept review, Buyer Review and licensing. Requests are limited to your own authorized finished-film titles.
        </p>
      </header>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {["Products & Services", "Request a Service", "My Service Requests", "Quote & Payment Status", "Service Progress", "Completed Services", "Notifications"].map((item) => (
          <a key={item} href={"#service-" + item.toLowerCase().replaceAll(/[^a-z]+/g, "-")} className="rounded-lg border border-line px-3 py-2 text-sm font-medium hover:border-accent">{item}</a>
        ))}
      </div>

      <section id="service-products-services" className="scroll-mt-24">
        <h3 className="font-semibold">Products & Services</h3>
        <p className="mt-1 text-sm text-muted">Production & DIT, post-production, QC, rights support, distribution, localization, accessibility, finishing, marketing and media protection. Availability and prices are confirmed only in a Super Admin quote.</p>
      </section>

      <details className="rounded-xl border border-line p-4">
        <summary className="cursor-pointer font-semibold">Secure service attachments · upload & verify</summary>
        <p className="mt-2 text-sm text-muted">Upload supporting PDFs to the existing private Document Vault, where Bridge verifies the stored object. Only verified documents can be attached to a service request. This does not grant rights approval.</p>
        <div className="mt-3"><CreatorDocumentVault userId={userId} /></div>
      </details>

      <section id="service-request-a-service" className="scroll-mt-24 rounded-xl border border-line p-4">
        <h3 className="font-semibold">Request a Service</h3>
        <p className="mt-1 text-sm text-muted">Choose a finished-film title, describe the work and optionally attach verified Document Vault record IDs.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs text-muted">
            <span>Authorized finished-film title</span>
            <select value={titleId} onChange={(event) => setTitleId(event.target.value)} disabled={titlesQuery.isPending || titles.length === 0} className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg">
              <option value="">Select a title</option>
              {titles.map((title: any) => <option key={title.id} value={title.id}>{title.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted">
            <span>Service category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg">
              {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted md:col-span-2">
            <span>Scope / requirement</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={4000} placeholder="Describe the work required, delivery format, destination, language, schedule and any constraints." className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg" />
          </label>
          <div className="space-y-2 text-xs text-muted md:col-span-2">
            <span className="block">Attach verified private documents (optional)</span>
            {documentsQuery.isPending ? <p>Loading verified documents…</p> : null}
            {documentsQuery.isError ? <p role="alert">Document list unavailable. You can still submit without attachments.</p> : null}
            {(documentsQuery.data?.documents ?? []).filter((doc: any) => doc.status === "VERIFIED").map((doc: any) => (
              <label key={doc.id} className="flex items-center gap-2 rounded-lg border border-line p-2">
                <input type="checkbox" checked={documentIds.includes(doc.id)} onChange={(event) => setDocumentIds((old) => event.target.checked ? [...old, doc.id] : old.filter((id) => id !== doc.id))} />
                <span>{doc.file_name} · verified</span>
              </label>
            ))}
            {!documentsQuery.isPending && !documentsQuery.isError && !(documentsQuery.data?.documents ?? []).some((doc: any) => doc.status === "VERIFIED") ? <p>No verified documents available yet. Use the secure upload panel above.</p> : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" disabled={requestMutation.isPending || !titleId || description.trim().length < 10} onClick={() => requestMutation.mutate()} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">
            {requestMutation.isPending ? "Submitting…" : "Submit service request"}
          </button>
          {titlesQuery.isError ? <span className="text-xs text-red-600">Title list could not be loaded.</span> : null}
          {titles.length === 0 && !titlesQuery.isPending ? <span className="text-xs text-muted">No eligible finished-film titles are available for service requests.</span> : null}
        </div>
      </section>

      {notice ? <p role="status" className="rounded-lg border border-line p-3 text-sm">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-700">{error}</p> : null}

      <section id="service-my-service-requests" className="scroll-mt-24 space-y-3">
        <h3 className="font-semibold">My Service Requests</h3>
        {requestsQuery.isPending ? <p className="text-sm text-muted">Loading your service requests…</p> : null}
        {requestsQuery.isError ? <p role="alert" className="text-sm text-red-600">Service requests could not be loaded. No request status is assumed.</p> : null}
        {requests.length ? requests.map((request: any) => (
          <article key={request.id} className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted">{request.category} · {request.titleName}</p>
                <h4 className="mt-1 font-semibold">{request.id}</h4>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{request.description}</p>
              </div>
              <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">{request.status.replaceAll("_", " ")}</span>
            </div>
            <p className="mt-2 text-sm text-muted">{STATUS_HELP[request.status] ?? "Status available in Bridge."}</p>
            {request.assignedProvider ? <p className="mt-1 text-sm">Provider: {request.assignedProvider}</p> : null}
            {request.quote ? (
              <div id="service-quote-payment-status" className="mt-3 rounded-lg bg-subtle p-3">
                <p className="text-sm font-semibold">Quote {request.quote.number}</p>
                <p className="mt-1 text-sm">Subtotal: {money(request.quote.subtotalPaise)} · Tax: {money(request.quote.taxPaise)} · Total: <strong>{money(request.quote.totalPaise)}</strong></p>
                <p className="mt-1 text-xs text-muted">Quote status: {request.quote.status}</p>
                {request.status === "QUOTE_READY" ? (
                  <button type="button" disabled={acceptMutation.isPending} onClick={() => acceptMutation.mutate(request.quote.id)} className="mt-3 rounded-full border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50">
                    {acceptMutation.isPending ? "Accepting…" : "Accept quote"}
                  </button>
                ) : null}
                {request.status === "AWAITING_PAYMENT" && request.order?.id ? (
                  <button type="button" disabled={payMutation.isPending} onClick={() => payMutation.mutate(request)} className="mt-3 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">
                    {payMutation.isPending ? "Preparing secure checkout…" : "Pay securely (Test Mode only)"}
                  </button>
                ) : null}
              </div>
            ) : null}
            {request.order ? <p className="mt-2 text-xs text-muted">Payment/order status: {request.order.status}</p> : null}
            {request.invoice ? <p className="mt-1 text-xs text-muted">Invoice: {request.invoice.number} · {request.invoice.status}</p> : null}
            {request.deliveryEvidenceUrl ? <a href={request.deliveryEvidenceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-accent underline">Open delivery evidence</a> : null}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium">Status history</summary>
              <ol className="mt-2 space-y-2 border-l border-line pl-4">
                {request.events.map((event: any) => <li key={event.id} className="text-xs"><strong>{event.toStatus.replaceAll("_", " ")}</strong> · {formatDate(event.createdAt)}{event.note ? <p className="text-muted">{event.note}</p> : null}</li>)}
              </ol>
            </details>
          </article>
        )) : !requestsQuery.isPending && !requestsQuery.isError ? <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">No service requests yet. Submitting a service request will create the first record.</p> : null}
      </section>

      <section id="service-service-progress" className="scroll-mt-24">
        <h3 className="font-semibold">Service Progress</h3>
        {active.length ? <ul className="mt-2 divide-y divide-line rounded-lg border border-line">{active.map((request: any) => <li key={request.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm"><span>{request.titleName} · {request.category}</span><strong>{request.status.replaceAll("_", " ")}</strong></li>)}</ul> : <p className="mt-2 text-sm text-muted">No active service work is currently recorded.</p>}
      </section>

      <section id="service-completed-services" className="scroll-mt-24">
        <h3 className="font-semibold">Completed Services</h3>
        {completed.length ? <ul className="mt-2 divide-y divide-line rounded-lg border border-line">{completed.map((request: any) => <li key={request.id} className="p-3 text-sm"><strong>{request.titleName}</strong> · {request.category} · {request.invoice?.number ?? "Invoice unavailable"}</li>)}</ul> : <p className="mt-2 text-sm text-muted">No completed service requests yet.</p>}
      </section>

      <section id="service-notifications" className="scroll-mt-24">
        <h3 className="font-semibold">Notifications</h3>
        {notifications.length ? <ul className="mt-2 divide-y divide-line rounded-lg border border-line">{notifications.map((item: any) => <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 p-3"><div><p className="text-sm font-semibold">{item.title}</p><p className="text-sm text-muted">{item.message}</p><p className="mt-1 text-xs text-muted">{formatDate(item.createdAt)}</p></div>{!item.readAt ? <button type="button" onClick={() => readMutation.mutate(item.id)} className="text-xs font-semibold text-accent underline">Mark read</button> : <span className="text-xs text-muted">Read</span>}</li>)}</ul> : <p className="mt-2 text-sm text-muted">No service notifications yet.</p>}
      </section>
      <p className="border-t border-line pt-3 text-xs text-muted">Payment is confirmed only after server-side Razorpay signature and captured-payment verification. Service payment is not title licensing revenue.</p>
    </section>
  );
}

export function ServiceRequestQueue() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["super-admin-service-request-queue"], queryFn: () => listBridgeServiceRequestQueue() });
  const [quoteInputs, setQuoteInputs] = useState<Record<string, { code: string; description: string; amount: string }>>({});
  const [providers, setProviders] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [actualCosts, setActualCosts] = useState<Record<string, { amount: string; type: "INTERNAL_COST" | "PASS_THROUGH" | "PAYMENT_PROCESSING"; reference: string; evidenceUrl: string }>>({});
  const [error, setError] = useState("");
  const refresh = () => client.invalidateQueries({ queryKey: ["super-admin-service-request-queue"] });
  const transition = useMutation({
    mutationFn: (data: { requestId: string; toStatus: any; provider?: string; deliveryEvidenceUrl?: string; note?: string }) => transitionBridgeServiceRequest({ data }),
    onSuccess: refresh,
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Service request update failed"),
  });
  const quote = useMutation({
    mutationFn: (data: { requestId: string; serviceCode: string; description: string; subtotalPaise: number }) => createBridgeServiceRequestQuote({ data }),
    onSuccess: refresh,
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Quote creation failed"),
  });
  const actualCost = useMutation({
    mutationFn: (data: { orderId: string; amountPaise: number; costType: "INTERNAL_COST" | "PASS_THROUGH" | "PAYMENT_PROCESSING"; vendorReference: string; evidenceUrl: string }) => recordServiceActualCost({ data: { ...data, evidence: data.evidenceUrl ? { receiptUrl: data.evidenceUrl } : {}, idempotencyKey: "service-cost-" + crypto.randomUUID() } }),
    onSuccess: refresh,
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Actual cost could not be recorded"),
  });
  const requests = query.data?.requests ?? [];
  const options = query.data?.serviceOptions ?? [];

  return (
    <section className="space-y-4 rounded-xl border border-line p-4">
      <header>
        <h3 className="font-display text-xl font-semibold">Super Admin · Service Request Queue</h3>
        <p className="mt-1 text-sm text-muted">Global Creator and Studio service requests. Quote pricing uses an active Finance tax configuration; no price or provider is invented.</p>
      </header>
      {query.isPending ? <p className="text-sm text-muted">Loading global service queue…</p> : null}
      {query.isError ? <p role="alert" className="text-sm text-red-600">Queue unavailable. No global access or empty queue is assumed.</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-700">{error}</p> : null}
      {requests.map((request: any) => {
        const input = quoteInputs[request.id] ?? { code: options[0]?.code ?? "", description: request.category + " service work", amount: "" };
        return (
          <article key={request.id} className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted">{request.requesterAccountType} · {request.requesterUserId} · {request.titleName}</p>
                <h4 className="mt-1 font-semibold">{request.category}</h4>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{request.description}</p>
                <p className="mt-1 text-xs text-muted">Submitted {formatDate(request.createdAt)} · {request.attachmentDocumentIds.length} verified document reference(s)</p>
              </div>
              <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">{request.status.replaceAll("_", " ")}</span>
            </div>
            {request.status === "SUBMITTED" ? <button type="button" disabled={transition.isPending} onClick={() => transition.mutate({ requestId: request.id, toStatus: "UNDER_REVIEW", note: "Super Admin review started." })} className="mt-3 rounded-full border border-line px-3 py-2 text-sm">Start review</button> : null}
            {request.status === "UNDER_REVIEW" ? (
              <div className="mt-4 grid gap-2 rounded-lg bg-subtle p-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-muted"><span>Active service code</span><select value={input.code} onChange={(e) => setQuoteInputs((old) => ({ ...old, [request.id]: { ...input, code: e.target.value } }))} className="w-full rounded border border-line bg-bg px-2 py-2 text-sm text-fg"><option value="">Select active service</option>{options.map((option: any) => <option key={option.code} value={option.code}>{option.name} ({option.code})</option>)}</select></label>
                <label className="space-y-1 text-xs text-muted"><span>Quote amount (INR, before configured tax)</span><input inputMode="decimal" value={input.amount} onChange={(e) => setQuoteInputs((old) => ({ ...old, [request.id]: { ...input, amount: e.target.value } }))} className="w-full rounded border border-line bg-bg px-2 py-2 text-sm text-fg" placeholder="Enter approved amount" /></label>
                <label className="space-y-1 text-xs text-muted sm:col-span-2"><span>Quote line description</span><input value={input.description} onChange={(e) => setQuoteInputs((old) => ({ ...old, [request.id]: { ...input, description: e.target.value } }))} className="w-full rounded border border-line bg-bg px-2 py-2 text-sm text-fg" maxLength={240} /></label>
                <button type="button" disabled={quote.isPending || !input.code || !input.description.trim() || !Number.isFinite(Number(input.amount)) || Number(input.amount) <= 0} onClick={() => quote.mutate({ requestId: request.id, serviceCode: input.code, description: input.description, subtotalPaise: Math.round(Number(input.amount) * 100) })} className="justify-self-start rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">Create quote</button>
                {!options.length ? <p className="text-xs text-muted sm:col-span-2">No active customer-visible service codes. Finance / Super Admin must configure the catalogue before quoting.</p> : null}
              </div>
            ) : null}
            {request.status === "PAID" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <input value={providers[request.id] ?? ""} onChange={(e) => setProviders((old) => ({ ...old, [request.id]: e.target.value }))} className="min-w-48 rounded border border-line bg-bg px-3 py-2 text-sm text-fg" placeholder="Named provider" />
                <button type="button" disabled={transition.isPending || (providers[request.id] ?? "").trim().length < 2} onClick={() => transition.mutate({ requestId: request.id, toStatus: "ASSIGNED", provider: providers[request.id], note: "Provider assigned by Super Admin." })} className="rounded-full border border-line px-3 py-2 text-sm">Assign provider</button>
              </div>
            ) : null}
            {request.status === "ASSIGNED" ? <button type="button" onClick={() => transition.mutate({ requestId: request.id, toStatus: "IN_PROGRESS", note: "Provider work started." })} className="mt-3 rounded-full border border-line px-3 py-2 text-sm">Start service work</button> : null}
            {request.status === "IN_PROGRESS" ? <button type="button" onClick={() => transition.mutate({ requestId: request.id, toStatus: "REVIEW", note: "Delivery submitted for review." })} className="mt-3 rounded-full border border-line px-3 py-2 text-sm">Move to review</button> : null}
            {request.status === "REVIEW" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <input value={evidence[request.id] ?? ""} onChange={(e) => setEvidence((old) => ({ ...old, [request.id]: e.target.value }))} className="min-w-64 flex-1 rounded border border-line bg-bg px-3 py-2 text-sm text-fg" placeholder="HTTPS delivery evidence URL" />
                <button type="button" disabled={transition.isPending || !(evidence[request.id] ?? "").startsWith("https://")} onClick={() => transition.mutate({ requestId: request.id, toStatus: "COMPLETED", deliveryEvidenceUrl: evidence[request.id], note: "Delivery evidence reviewed and service completed." })} className="rounded-full border border-line px-3 py-2 text-sm">Complete</button>
              </div>
            ) : null}
            {["SUBMITTED", "UNDER_REVIEW", "QUOTE_READY", "AWAITING_PAYMENT"].includes(request.status) ? <button type="button" onClick={() => transition.mutate({ requestId: request.id, toStatus: "CANCELLED", note: "Cancelled by Super Admin before payment." })} className="mt-3 ml-2 text-xs text-muted underline">Cancel request</button> : null}
            {request.quote ? <p className="mt-2 text-xs text-muted">Quote {request.quote.number}: {money(request.quote.totalPaise)} · {request.quote.status}</p> : null}
            {request.order ? <p className="mt-1 text-xs text-muted">Order {request.order.id} · {request.order.status}</p> : null}
            {request.order?.id && ["PAID", "ASSIGNED", "IN_PROGRESS", "REVIEW", "COMPLETED"].includes(request.status) ? (
              <div className="mt-3 grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-2">
                <p className="text-sm font-semibold sm:col-span-2">Record actual provider / operating cost</p>
                {(() => {
                  const cost = actualCosts[request.id] ?? { amount: "", type: "INTERNAL_COST" as const, reference: "", evidenceUrl: "" };
                  return <>
                    <label className="text-xs text-muted">Cost type<select value={cost.type} onChange={(e) => setActualCosts((old) => ({ ...old, [request.id]: { ...cost, type: e.target.value as typeof cost.type } }))} className="mt-1 w-full rounded border border-line bg-bg px-2 py-2 text-sm text-fg"><option value="INTERNAL_COST">Internal / provider cost</option><option value="PASS_THROUGH">Pass-through cost</option><option value="PAYMENT_PROCESSING">Payment processing fee</option></select></label>
                    <label className="text-xs text-muted">Actual amount (INR)<input inputMode="decimal" value={cost.amount} onChange={(e) => setActualCosts((old) => ({ ...old, [request.id]: { ...cost, amount: e.target.value } }))} className="mt-1 w-full rounded border border-line bg-bg px-2 py-2 text-sm text-fg" placeholder="Actual amount" /></label>
                    <label className="text-xs text-muted">Provider / invoice reference<input value={cost.reference} onChange={(e) => setActualCosts((old) => ({ ...old, [request.id]: { ...cost, reference: e.target.value } }))} className="mt-1 w-full rounded border border-line bg-bg px-2 py-2 text-sm text-fg" maxLength={200} /></label>
                    <label className="text-xs text-muted">HTTPS receipt evidence URL (optional)<input value={cost.evidenceUrl} onChange={(e) => setActualCosts((old) => ({ ...old, [request.id]: { ...cost, evidenceUrl: e.target.value } }))} className="mt-1 w-full rounded border border-line bg-bg px-2 py-2 text-sm text-fg" placeholder="https://" /></label>
                    <button type="button" disabled={actualCost.isPending || !/^[0-9]+(\.[0-9]{1,2})?$/.test(cost.amount) || Number(cost.amount) < 0 || (cost.evidenceUrl !== "" && !cost.evidenceUrl.startsWith("https://"))} onClick={() => actualCost.mutate({ orderId: request.order.id, amountPaise: Math.round(Number(cost.amount) * 100), costType: cost.type, vendorReference: cost.reference, evidenceUrl: cost.evidenceUrl })} className="justify-self-start rounded-full border border-line px-3 py-2 text-sm disabled:opacity-50">Record actual cost</button>
                  </>;
                })()}
              </div>
            ) : null}
            <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Audit timeline</summary><ol className="mt-2 space-y-2 border-l border-line pl-4">{request.events.map((event: any) => <li key={event.id} className="text-xs"><strong>{event.toStatus.replaceAll("_", " ")}</strong> · {formatDate(event.createdAt)}<p className="text-muted">{event.note}</p></li>)}</ol></details>
          </article>
        );
      })}
      {!requests.length && !query.isPending && !query.isError ? <p className="text-sm text-muted">No service requests are currently recorded.</p> : null}
    </section>
  );
}
