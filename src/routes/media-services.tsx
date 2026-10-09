import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/media-services")({
  component: MediaServices,
});

const services = [
  {
    number: "01",
    title: "Rights & licensing operations",
    description:
      "Organise title records, ownership evidence, territory and term restrictions, licensing discussions, and delivery approvals in the Bridge workflow.",
    status: "Bridge workflow",
  },
  {
    number: "02",
    title: "Content preparation & delivery",
    description:
      "Coordinate metadata, artwork, subtitles, technical QC requests, and delivery requirements with a clear record of what has and has not been verified.",
    status: "Service coordination",
  },
  {
    number: "03",
    title: "Media insurance readiness",
    description:
      "Prepare an organised evidence pack for discussion with a licensed insurance broker or insurer, including available rights records, contracts, production information, and technology-risk documents.",
    status: "Broker-led assessment",
  },
];

function MediaServices() {
  return (
    <main className="min-h-screen bg-white text-fg">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link to="/" className="font-display text-lg font-semibold">
            Crayons Bridge
          </Link>
          <Link
            to="/contact"
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold"
          >
            Talk to our team
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Media operations for rights holders
        </p>
        <h1 className="mt-5 max-w-4xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          One bridge from content to market.
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-8 text-muted sm:text-lg">
          Prepare, protect, license, and deliver audiovisual content with
          workflows designed for producers, studios, distributors, and buyers.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/signup"
            className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-[#041018]"
          >
            Create a Bridge account
          </Link>
          <Link
            to="/contact"
            className="rounded-full border border-line px-6 py-3 text-sm font-semibold"
          >
            Discuss a business requirement
          </Link>
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-px sm:grid-cols-3">
          {services.map((service) => (
            <article key={service.number} className="bg-white p-6 sm:p-8">
              <p className="text-sm font-semibold text-accent">{service.number}</p>
              <h2 className="mt-5 font-display text-2xl font-semibold">
                {service.title}
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted">
                {service.description}
              </p>
              <p className="mt-6 inline-flex rounded-full border border-line px-3 py-1 text-xs font-medium text-muted">
                {service.status}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-start">
          <div>
            <h2 className="font-display text-3xl font-semibold">
              A clear boundary between readiness and approval
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
              Bridge can help organise records and supporting documents. It
              does not itself verify that an insurer will accept a risk, issue
              a policy, or guarantee coverage. A licensed insurance professional
              must assess the risk, advise on suitable cover, and arrange
              insurance where appropriate.
            </p>
          </div>
          <aside className="rounded-2xl border border-line p-6">
            <h3 className="font-semibold">How the ecosystem fits together</h3>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-muted">
              <li><strong className="text-fg">Bridge</strong> — rights, preparation, licensing, and publication authorisation.</li>
              <li><strong className="text-fg">Loop</strong> — consumer streaming and monetisation of content authorised by Bridge.</li>
              <li><strong className="text-fg">StreamVista OPC Pvt Ltd</strong> — contracting and operations only where supported by the applicable legal and commercial arrangements.</li>
            </ol>
          </aside>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-xs leading-6 text-muted sm:px-8">
          <p>
            Insurance-readiness support is documentation and workflow support,
            not insurance advice, underwriting, brokerage, or a promise of cover.
            Any insurance placement or regulated activity must be handled by
            appropriately authorised professionals.
          </p>
          <p>Crayons Bridge · Operated by StreamVista OPC Pvt Ltd, subject to applicable contracts.</p>
        </div>
      </footer>
    </main>
  );
}
