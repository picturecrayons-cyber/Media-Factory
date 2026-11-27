import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getCustomerServiceCatalog } from "@/lib/bridge/service-catalog";

const CATEGORY_LABELS: Record<string, string> = {
  INGEST: "Ingest", PREPARATION: "Preparation", MASTERING: "Mastering",
  QC: "Quality Control", RIGHTS_LEGAL: "Rights & Legal", PACKAGING: "Packaging",
  LOCALIZATION: "Localization", DISTRIBUTION: "Distribution", STORAGE: "Storage",
  DELIVERY_HANDLING: "Delivery Handling", COMMERCIAL: "Commercial Support",
};

function formatMethod(value: string, unit: string) {
  return value.replaceAll("_", " ").toLowerCase() + (unit ? " · " + unit : "");
}

export function BridgeServicesPanel({ userId, organizationId }: { userId: string; organizationId?: string | null }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const catalogQ = useQuery({
    queryKey: ["bridge-customer-service-catalog", userId, organizationId],
    queryFn: () => getCustomerServiceCatalog(),
    retry: 1,
  });

  const services = catalogQ.data?.services ?? [];
  const categories = useMemo(() => [...new Set(services.map((service) => service.category))].sort(), [services]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return services.filter((service) =>
      (category === "ALL" || service.category === category) &&
      (!term || [service.name, service.description, service.why, service.code, service.category]
        .some((value) => value?.toLocaleLowerCase().includes(term))),
    );
  }, [services, search, category]);
  const groups = [...new Set(filtered.map((service) => service.category))];

  if (catalogQ.isPending) return <p className="text-sm text-muted">Loading available Bridge services…</p>;
  if (catalogQ.isError) return (
    <div role="alert" className="rounded-xl border border-line bg-surface p-4 text-sm">
      <p>Services could not be loaded. No catalogue data is being assumed.</p>
      <button type="button" className="mt-3 font-semibold text-accent underline" onClick={() => void catalogQ.refetch()}>Retry</button>
    </div>
  );

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-accent">Creator Services</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Production & distribution services</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Browse the active customer-visible services. Requests, prices and payment commitments are confirmed only through an authorised Bridge quotation.</p>
      </div>
      <span className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted">{services.length} active offerings</span>
    </div>

    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted">Search services</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search mastering, QC, delivery…" className="min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-accent" />
      </label>
      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted">Category</span>
        <select value={category} onChange={(event) => setCategory(event.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-accent">
          <option value="ALL">All categories</option>
          {categories.map((item) => <option key={item} value={item}>{CATEGORY_LABELS[item] ?? item.replaceAll("_", " ")}</option>)}
        </select>
      </label>
    </div>
    <p className="text-xs text-muted" aria-live="polite">Showing {filtered.length} of {services.length} active services across {categories.length} categories.</p>

    {groups.length === 0 ? <p className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">No services match this search. Try another term or select all categories.</p> :
      <div className="space-y-6">{groups.map((group) => <section key={group} className="space-y-3">
        <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{CATEGORY_LABELS[group] ?? group.replaceAll("_", " ")}</h3><span className="text-xs text-muted">{filtered.filter((item) => item.category === group).length} services</span></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filtered.filter((service) => service.category === group).map((service) =>
          <article key={service.code} className="flex h-full flex-col rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
            <div className="flex items-start justify-between gap-2"><h4 className="font-semibold leading-5">{service.name}</h4><span className="shrink-0 rounded-full border border-line px-2 py-1 text-[10px] font-semibold uppercase text-muted">{service.rateConfigured ? "Rate configured" : "Rate pending"}</span></div>
            {service.description ? <p className="mt-2 text-sm leading-6 text-muted">{service.description}</p> : null}
            {service.why ? <p className="mt-2 text-xs leading-5 text-muted">{service.why}</p> : null}
            <p className="mt-auto pt-4 text-xs font-medium text-muted">{formatMethod(service.pricingMethod, service.unitLabel)}</p>
          </article>)}</div>
      </section>)}</div>}

    <div className="rounded-xl border border-line bg-bg p-4 sm:p-5">
      <h3 className="font-semibold">Quotation availability</h3>
      {catalogQ.data.quoteConfigurationReady ?
        <p className="mt-1 text-sm leading-6 text-muted">Catalogue and base tax configuration are present. A title-specific quote remains subject to asset evidence, destination requirements and server-side validation.</p> :
        <p className="mt-1 text-sm leading-6 text-muted">Full catalogue quoting is not enabled because one or more active service rates or tax configuration is missing. A title-specific quote also requires every identified service to have an active rate. No prices or payment amounts are invented.</p>}
      <Link to="/workspace" className="mt-3 inline-flex text-sm font-semibold text-accent hover:underline">Open My Titles →</Link>
    </div>
  </div>;
}
