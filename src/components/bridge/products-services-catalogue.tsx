mport { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTitles } from "@/lib/bridge/titles";
import {
  createBridgeServiceRequest, listMyBridgeServiceRequests,
  markBridgeServiceNotificationRead, listBridgeServiceRequestQueue,
  createBridgeServiceRequestQuote, transitionBridgeServiceRequest,
} from "@/lib/bridge/service-requests";
import { acceptServiceQuote } from "@/lib/bridge/service-revenue";

const serviceStatusLabel = (status: string) => status.replaceAll("_", " ").toLowerCase();
const rupees = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

export function CreatorStudioServiceCentre({ actor }: { actor: { userId: string; organizationId?: string | null } }) {
  const cache = useQueryClient();
  const [titleId, setTitleId] = useState("");
  const [category, setCategory] = useState("Production & DIT");
  const [description, setDescription] = useState("");
  const titles = useQuery({ queryKey: ["bridge-titles", actor.userId, actor.organizationId], queryFn: () => listTitles() });
  const requests = useQuery({ queryKey: ["bridge-service-requests", actor.userId, actor.organizationId], queryFn: () => listMyBridgeServiceRequests() });
  const submit = useMutation({ mutationFn: () => createBridgeServiceRequest({ data: { titleId, category, description } }), onSuccess: () => { setDescription(""); void cache.invalidateQueries({ queryKey: ["bridge-service-requests"] }); } });
  const accept = useMutation({ mutationFn: (quoteId: string) => acceptServiceQuote({ data: { quoteId } }), onSuccess: () => void cache.invalidateQueries({ queryKey: ["bridge-service-requests"] }) });
  const read = useMutation({ mutationFn: (id: string) => markBridgeServiceNotificationRead({ data: { notificationId: id } }), onSuccess: () => void cache.invalidateQueries({ queryKey: ["bridge-service-requests"] }) });
  return <section id="service-centre" className="scroll-mt-24 space-y-5 rounded-2xl border border-line bg-surface p-4 sm:p-6">
    <header><p className="text-xs font-semibold uppercase tracking-widest text-accent">Creator & Studio</p><h2 className="mt-1 font-display text-2xl font-semibold">Service Centre</h2><p className="mt-2 text-sm text-muted">Request specialist services, review quotes, accept a quote and follow verified payment, assignment and delivery. This is separate from Title QC, Rights and Buyer licensing.</p></header>
    <div className="grid gap-4 lg:grid-cols-2">
      <form className="space-y-3 rounded-xl border border-line p-4" onSubmit={e => { e.preventDefault(); submit.mutate(); }}>
        <h3 className="font-semibold">Request a service</h3>
        <label className="block text-sm">Finished-film title<select required value={titleId} onChange={e => setTitleId(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-bg px-3"><option value="">Choose title</option>{(titles.data?.titles ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="block text-sm">Category<select value={category} onChange={e => setCategory(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-bg px-3">{serviceGroups.map(([name]) => <option key={name}>{name}</option>)}</select></label>
        <label className="block text-sm">Scope & requirements<textarea required minLength={10} maxLength={4000} value={description} onChange={e => setDescription(e.target.value)} className="mt-1 min-h-28 w-full rounded-lg border border-line bg-bg p-3" placeholder="Describe the work, files and expected delivery." /></label>
        <button disabled={!titleId || description.trim().length < 10 || submit.isPending} className="min-h-11 rounded-full bg-accent px-5 text-sm font-semibold text-bg disabled:opacity-50">{submit.isPending ? "Submitting…" : "Submit request"}</button>
        {submit.isError ? <p role="alert" className="text-sm text-red-600">{submit.error.message}</p> : null}
        {submit.isSuccess ? <p role="status" className="text-sm text-muted">Request submitted to Founder Centre.</p> : null}
        {titles.isError ? <p role="alert" className="text-sm text-muted">Title list unavailable; retry before submitting.</p> : null}
      </form>
      <div className="rounded-xl border border-line p-4"><h3 className="font-semibold">What happens next?</h3><ol className="mt-3 space-y-3 text-sm text-muted"><li><b className="text-fg">1. Review</b> — Super Admin reviews scope and provider availability.</li><li><b className="text-fg">2. Quote</b> — tax-calculated quote is sent for your approval.</li><li><b className="text-fg">3. Payment</b> — accepted quote creates a service order; payment is verified server-side.</li><li><b className="text-fg">4. Delivery</b> — assignment, progress, delivery evidence and invoice are recorded.</li></ol><p className="mt-4 text-xs text-muted">Service charges are separate from title licensing revenue and owner settlements. Story Concepts use their separate submission workflow.</p></div>
    </div>
    <div className="space-y-3"><h3 className="font-semibold">My service requests</h3>{requests.isPending ? <p className="text-sm text-muted">Loading…</p> : null}{requests.isError ? <p role="alert" className="text-sm text-muted">Requests unavailable.</p> : null}
      {(requests.data?.requests ?? []).map(r => <article key={r.id} className="rounded-xl border border-line p-4"><div className="flex flex-wrap justify-between gap-2"><div><b>{r.titleName}</b><p className="text-sm text-muted">{r.category} · {r.description}</p><p className="text-xs text-muted">Request {r.id.slice(0,8)}</p></div><span className="rounded-full border border-line px-3 py-1 text-xs">{serviceStatusLabel(r.status)}</span></div>
        {r.quote ? <div className="mt-3 rounded-lg bg-bg p-3"><b className="text-sm">Quote {r.quote.number ?? ""} · {rupees(r.quote.totalPaise)}</b><p className="text-xs text-muted">Tax included · {serviceStatusLabel(r.quote.status ?? "unknown")}</p>{r.quote.status === "QUOTED" && r.status === "QUOTE_READY" ? <button type="button" disabled={accept.isPending} onClick={() => accept.mutate(r.quote!.id)} className="mt-2 min-h-10 rounded-full bg-accent px-4 text-sm font-semibold text-bg">Accept quote</button> : null}</div> : null}
        {r.deliveryEvidenceUrl ? <a href={r.deliveryEvidenceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-accent underline">Delivery evidence</a> : null}
        {r.invoice ? <p className="mt-2 text-xs text-muted">Invoice {r.invoice.number} · {serviceStatusLabel(r.invoice.status ?? "unknown")}</p> : null}
        <ol className="mt-2 flex flex-wrap gap-2">{r.events.map(e => <li key={e.id} className="rounded border border-line px-2 py-1 text-xs text-muted">{serviceStatusLabel(e.toStatus)}</li>)}</ol>
      </article>)}
      {!requests.isPending && !requests.isError && !(requests.data?.requests ?? []).length ? <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No service requests yet.</p> : null}
    </div>
    <div className="space-y-2"><h3 className="font-semibold">Notifications</h3>{(requests.data?.notifications ?? []).map(n => <div key={n.id} className="flex justify-between gap-3 rounded-lg border border-line p-3"><div><b className="text-sm">{n.title}</b><p className="text-sm text-muted">{n.message}</p></div>{!n.readAt ? <button type="button" onClick={() => read.mutate(n.id)} className="text-xs text-accent underline">Mark read</button> : <span className="text-xs text-muted">Read</span>}</div>)}</div>
    {accept.isError ? <p role="alert" className="text-sm text-red-600">{accept.error.message}</p> : null}
  </section>;
}

export function FounderServiceQueue() {
  const cache = useQueryClient();
  const queue = useQuery({ queryKey: ["bridge-founder-service-queue"], queryFn: () => listBridgeServiceRequestQueue() });
  const [drafts, setDrafts] = useState<Record<string, { code: string; amount: string; description: string }>>({});
  const [providers, setProviders] = useState<Record<string, string>>({});
  const quote = useMutation({ mutationFn: (d: { requestId: string; serviceCode: string; description: string; subtotalPaise: number }) => createBridgeServiceRequestQuote({ data: d }), onSuccess: () => void cache.invalidateQueries({ queryKey: ["bridge-founder-service-queue"] }) });
  const move = useMutation({ mutationFn: (d: { requestId: string; toStatus: "UNDER_REVIEW" | "ASSIGNED" | "IN_PROGRESS" | "REVIEW" | "COMPLETED" | "CANCELLED"; provider?: string }) => transitionBridgeServiceRequest({ data: d }), onSuccess: () => void cache.invalidateQueries({ queryKey: ["bridge-founder-service-queue"] }) });
  const options = queue.data?.serviceOptions ?? [];
  return <section className="rounded-2xl border border-line bg-surface p-4 sm:p-6"><p className="text-xs font-semibold uppercase tracking-widest text-accent">Super Admin · Founder Centre</p><h2 className="mt-1 font-display text-2xl font-semibold">Service request queue</h2><p className="mt-2 text-sm text-muted">Review scope, create quotes from active catalogue items, assign providers and monitor fulfilment. Server-side Super Admin permission is required.</p>
    {queue.isPending ? <p className="mt-3 text-sm text-muted">Loading queue…</p> : null}{queue.isError ? <p role="alert" className="mt-3 text-sm text-muted">Queue unavailable.</p> : null}
    <div className="mt-4 space-y-3">{(queue.data?.requests ?? []).map(r => { const d = drafts[r.id] ?? { code: options[0]?.code ?? "", amount: "", description: r.category + " service" }; return <article key={r.id} className="rounded-xl border border-line p-4"><div className="flex flex-wrap justify-between gap-2"><div><b>{r.titleName}</b><p className="text-sm text-muted">{r.requesterAccountType} · {r.category}</p><p className="text-sm text-muted">{r.description}</p></div><span className="rounded-full border border-line px-3 py-1 text-xs">{serviceStatusLabel(r.status)}</span></div>
      {r.status === "SUBMITTED" ? <button type="button" onClick={() => move.mutate({ requestId: r.id, toStatus: "UNDER_REVIEW" })} className="mt-3 rounded-full border border-line px-3 py-2 text-sm">Start review</button> : null}
      {["SUBMITTED","UNDER_REVIEW"].includes(r.status) && !r.quote ? <div className="mt-3 grid gap-2 rounded-lg bg-bg p-3 sm:grid-cols-2"><label className="text-xs">Service<select value={d.code} onChange={e => setDrafts(p => ({ ...p, [r.id]: { ...d, code: e.target.value } }))} className="mt-1 min-h-10 w-full rounded border border-line bg-surface px-2">{options.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}</select></label><label className="text-xs">Quote amount (₹)<input value={d.amount} onChange={e => setDrafts(p => ({ ...p, [r.id]: { ...d, amount: e.target.value } }))} inputMode="decimal" className="mt-1 min-h-10 w-full rounded border border-line bg-surface px-2" /></label><label className="text-xs sm:col-span-2">Quote scope<input value={d.description} onChange={e => setDrafts(p => ({ ...p, [r.id]: { ...d, description: e.target.value } }))} className="mt-1 min-h-10 w-full rounded border border-line bg-surface px-2" /></label><button type="button" disabled={!d.code || !d.description.trim() || !Number.isFinite(Number(d.amount)) || Number(d.amount) <= 0 || quote.isPending} onClick={() => quote.mutate({ requestId: r.id, serviceCode: d.code, description: d.description, subtotalPaise: Math.round(Number(d.amount) * 100) })} className="min-h-10 rounded-full bg-accent px-4 text-sm font-semibold text-bg disabled:opacity-50 sm:col-span-2">Create quote</button></div> : null}
      {r.status === "PAID" ? <div className="mt-3 flex gap-2"><input value={providers[r.id] ?? ""} onChange={e => setProviders(p => ({ ...p, [r.id]: e.target.value }))} placeholder="Provider name" className="min-h-10 rounded border border-line bg-bg px-3 text-sm" /><button type="button" disabled={!providers[r.id]?.trim()} onClick={() => move.mutate({ requestId: r.id, toStatus: "ASSIGNED", provider: providers[r.id] })} className="rounded-full border border-line px-3 text-sm">Assign</button></div> : null}
      {r.status === "ASSIGNED" ? <button type="button" onClick={() => move.mutate({ requestId: r.id, toStatus: "IN_PROGRESS" })} className="mt-3 rounded-full border border-line px-3 py-2 text-sm">Start work</button> : null}
      {r.status === "IN_PROGRESS" ? <button type="button" onClick={() => move.mutate({ requestId: r.id, toStatus: "REVIEW" })} className="mt-3 rounded-full border border-line px-3 py-2 text-sm">Submit for review</button> : null}
      {r.status === "REVIEW" ? <p className="mt-3 text-sm text-muted">Completion requires paid invoice and HTTPS delivery evidence. Final completion remains blocked until both are verified.</p> : null}
    </article>; })}</div>
    {quote.isError ? <p role="alert" className="mt-3 text-sm text-red-600">{quote.error.message}</p> : null}{move.isError ? <p role="alert" className="mt-3 text-sm text-red-600">{move.error.message}</p> : null}
  </section>;
}

const productGroups = [
  { title: "Finished Film Distribution", description: "Prepare completed films for authorized licensing and distribution.", items: ["Crayons Loop publication pathway", "Other OTT / non-linear platforms", "Linear television", "Satellite and ancillary buyers", "International distribution"] },
  { title: "Story & Concept", description: "Submit stories, screenplays and early-stage projects for review.", items: ["Story submission", "Screenplay / script submission", "Concept registration", "Project development enquiries", "Studio / buyer mapping with permission controls"] },
  { title: "DIT Agent — Production Media Vault", description: "Manage production media intake, verification and handover.", items: ["Camera-card ingest", "Audio ingest", "Media verification and SHA-256 checksums", "Primary and Recovery copy workflow", "Proxy / ProRes preparation", "Clap Assistant", "Post-house handover", "Archive and restore"] },
];

const serviceGroups = [
  ["Production & DIT", "Camera ingest, audio ingest, RAW video handling, stills management, checksum verification, backup and proxy creation."],
  ["Post-production", "Media conversion, ProRes preparation, post-house delivery, archive and restore."],
  ["QC & Technical", "Video QC, audio QC, subtitle checks, format validation and delivery QC."],
  ["Rights & Legal Support", "Ownership documentation, chain-of-title evidence, music-rights evidence and agreement management."],
  ["Distribution & Licensing", "OTT distribution enquiries, TV licensing, satellite licensing and international sales support."],
  ["Localization", "Dubbing, subtitling, translation and language adaptation."],
  ["Accessibility", "Captions, subtitles and accessibility preparation."],
  ["Finishing", "Final master preparation, artwork preparation and technical finishing."],
  ["Marketing Support", "Posters, stills, promotional materials and title presentation."],
  ["Media Protection", "Secure storage workflow, recovery copies and archive management."],
];

export function ProductsServicesCatalogue({ audience }: { audience: "Creator" | "Studio" }) {
  return (
    <section id="products-services" className="scroll-mt-24 space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Bridge catalogue</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Products & Services</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Products describe the main Bridge offerings. Services describe specialist work that {audience === "Creator" ? "Creators" : "Studios"} may enquire about for their authorized projects.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {productGroups.map((product, index) => (
          <article key={product.title} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-accent">Product 0{index + 1}</p>
            <h3 className="mt-2 font-display text-lg font-semibold">{product.title}</h3>
            <p className="mt-2 text-sm text-muted">{product.description}</p>
            <ul className="mt-4 space-y-2 text-sm">
              {product.items.map((item) => <li key={item} className="flex gap-2"><span className="text-accent" aria-hidden="true">•</span><span>{item}</span></li>)}
            </ul>
          </article>
        ))}
      </div>
      <div>
        <div className="mb-3">
          <h3 className="font-display text-xl font-semibold">Service categories</h3>
          <p className="mt-1 text-sm text-muted">Service listing is informational; provider availability, price and delivery SLA are not verified here.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {serviceGroups.map(([name, description]) => (
            <article key={name} className="rounded-xl border border-line bg-surface p-4">
              <h4 className="font-semibold">{name}</h4>
              <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
            </article>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
        <div>
          <p className="font-semibold">Need a service?</p>
          <p className="mt-1 text-sm text-muted">Submit a separate service request for Super Admin review. A quote and payment are never implied by browsing the catalogue.</p>
        </div>
        <a href="#service-centre" className="inline-flex min-h-10 items-center rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg hover:opacity-90">Request a service ↗</a>
      </div>
    </section>
  );
}
