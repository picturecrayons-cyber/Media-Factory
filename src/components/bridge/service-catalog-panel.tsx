import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getCustomerServiceCatalog } from "@/lib/bridge/service-catalog";

const CATEGORY_LABELS: Record<string, string> = {
  INGEST: "Ingest",
  PREPARATION: "Preparation",
  MASTERING: "Mastering",
  QC: "Quality Control",
  RIGHTS_LEGAL: "Rights & Legal",
  PACKAGING: "Packaging",
  LOCALIZATION: "Localization",
  DISTRIBUTION: "Distribution",
  STORAGE: "Storage",
  DELIVERY_HANDLING: "Delivery Handling",
  COMMERCIAL: "Commercial Support",
};

function formatMethod(value: string, unit: string) {
  return value.replaceAll("_", " ").toLowerCase() + (unit ? " · " + unit : "");
}

export function BridgeServicesPanel() {
  const catalogQ = useQuery({
    queryKey: ["bridge-customer-service-catalog"],
    queryFn: () => getCustomerServiceCatalog(),
    retry: 1,
  });

  if (catalogQ.isPending) {
    return <p className="text-sm text-muted">Loading available Bridge services…</p>;
  }

  if (catalogQ.isError) {
    return (
      <div role="alert" className="rounded-xl border border-line bg-surface p-4 text-sm">
        <p>Services could not be loaded. No catalogue data is being assumed.</p>
        <button type="button" className="mt-3 font-semibold text-accent underline" onClick={() => void catalogQ.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const services = catalogQ.data.services;
  const groups = [...new Set(services.map((service) => service.category))];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Creator Services</p>
          <h2 className="mt-1 font-display text-2xl font-semibold">Production & distribution services</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
            Browse active services available to customers. Service requests, prices and payment commitments are confirmed only through an authorised Bridge quotation.
          </p>
        </div>
        <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">
          {services.length} active offerings
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
          No active customer-visible services are currently published.
        </p>
      ) : (
        <div className="space-y-5">
          {groups.map((category) => (
            <section key={category} className="space-y-3">
              <h3 className="font-semibold">{CATEGORY_LABELS[category] ?? category.replaceAll("_", " ")}</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {services.filter((service) => service.category === category).map((service) => (
                  <article key={service.code} className="rounded-xl border border-line bg-surface p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold">{service.name}</h4>
                      <span className="shrink-0 rounded-full border border-line px-2 py-1 text-[10px] font-semibold uppercase text-muted">
                        {service.rateConfigured ? "Rate configured" : "Rate pending"}
                      </span>
                    </div>
                    {service.description ? <p className="mt-2 text-sm text-muted">{service.description}</p> : null}
                    {service.why ? <p className="mt-2 text-xs text-muted">{service.why}</p> : null}
                    <p className="mt-3 text-xs text-muted">{formatMethod(service.pricingMethod, service.unitLabel)}</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-line bg-bg p-4">
        <h3 className="font-semibold">Quotation availability</h3>
        {catalogQ.data.quoteConfigurationReady ? (
          <p className="mt-1 text-sm text-muted">The catalogue and base tax configuration are present. A title-specific quote is still subject to asset evidence, destination requirements and server-side validation.</p>
        ) : (
          <p className="mt-1 text-sm text-muted">
            Full catalogue quoting is not enabled. One or more active service rates or tax configuration is missing. A title-specific quote also requires every service identified for that title to have an active rate. No prices or payment amounts are invented.
          </p>
        )}
        <Link to="/workspace" className="mt-3 inline-flex text-sm font-semibold text-accent hover:underline">
          Open My Titles →
        </Link>
      </div>
    </div>
  );
}
