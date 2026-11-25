const productGroups = [
  {
    title: "Store & Protect Your Film Files",
    description: "A secure workspace for organising production footage and project files, checking copies and preparing approved handovers.",
    items: [
      "Camera, audio and stills intake",
      "File verification and checksum reports",
      "Primary and recovery-copy tracking",
      "Proxy and post-production preparation",
      "Secure archive and restore workflow",
      "Controlled handover to authorised post-production teams",
    ],
  },
];

const serviceGroups = [
  ["Film Production Support", "Planning and production coordination support for your film project, based on an agreed scope."],
  ["Editing & Post-Production", "Editing support, media preparation, post-house coordination and delivery of finished versions."],
  ["Film Quality Check", "Checks for picture, sound, subtitles, file formats and delivery requirements before handover."],
  ["Film Rights & Legal Support", "Help organising ownership records, agreements and rights evidence. This is support, not a legal clearance or ownership approval."],
  ["OTT & Distribution Opportunities", "Explore suitable OTT, television and other distribution opportunities. Submission does not guarantee a deal or release."],
  ["Subtitles & Language Translation", "Subtitle creation, translation, dubbing coordination and language adaptation."],
  ["Accessibility Support", "Captions and other accessibility preparation to help more audiences enjoy your film."],
  ["Colour & Sound Finishing", "Final picture and sound preparation for the agreed delivery format."],
  ["Film Marketing & Promotion", "Support with posters, stills, promotional materials and presenting your film to audiences."],
  ["Film Backup & Archiving", "Secure backup planning, recovery copies and long-term media archive support."],
];

export function ProductsServicesCatalogue({ audience }: { audience: "Creator" | "Studio" }) {
  return (
    <section id="products-services" className="scroll-mt-24 space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Crayons Bridge catalogue</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Products & Services</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Simple ways to understand how Bridge can support your film journey. {audience === "Creator" ? "Creators" : "Studios"} can explore the catalogue and request support for their own authorised projects.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Digital product</p>
        <div className="mt-3 rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h3 className="font-display text-xl font-semibold">{productGroups[0].title}</h3>
          <p className="mt-2 max-w-3xl text-sm text-muted">{productGroups[0].description}</p>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {productGroups[0].items.map((item) => (
              <li key={item} className="flex gap-2"><span className="text-accent" aria-hidden="true">•</span><span>{item}</span></li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Film services</p>
          <h3 className="mt-1 font-display text-xl font-semibold">Support at every stage of your film</h3>
          <p className="mt-1 text-sm text-muted">Choose the kind of help you need. The team will confirm whether it is available, the scope, price and timeline before any work is agreed.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {serviceGroups.map(([name, description], index) => (
            <article key={name} className="rounded-xl border border-line bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-accent">Service {String(index + 1).padStart(2, "0")}</p>
              <h4 className="mt-1 font-semibold">{name}</h4>
              <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
              <p className="mt-3 text-xs text-muted">Availability: confirmed after review · Pricing: quote required</p>
            </article>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
        <div>
          <p className="font-semibold">Need help with your film?</p>
          <p className="mt-1 text-sm text-muted">Send a service request for review. Browsing or submitting a request does not confirm availability, create a contract, or start a payment.</p>
        </div>
        <a href="#service-centre" className="inline-flex min-h-10 items-center rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg hover:opacity-90">Request a service ↗</a>
      </div>
    </section>
  );
}
