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
