import { Link } from "@tanstack/react-router";

const coverageAreas = [
  {
    title: "Media E&O and intellectual property",
    description: "Third-party film distribution, copyright and music rights, underlying works, defamation, privacy/publicity claims, rights-clearance disputes, and takedown costs.",
  },
  {
    title: "Cyber, privacy and incident response",
    description: "Account compromise, personal-data exposure, ransomware, forensic response, data restoration, notification, and regulatory defence where insurable.",
  },
  {
    title: "Technology professional liability",
    description: "Entitlement errors, payment or API integration failures, platform defects, delivery errors, and eligible financial-loss claims.",
  },
  {
    title: "Crime and funds-transfer fraud",
    description: "Social engineering, impersonated rights holders, fraudulent beneficiary changes, employee dishonesty, and creator or supplier settlement diversion.",
  },
  {
    title: "D&O governance",
    description: "Management and board decisions, investor or governance disputes, defence costs, and entity coverage where appropriate to the legal structure.",
  },
  {
    title: "Business interruption and vendors",
    description: "Cloud, media storage, CDN, identity, email or payment-provider outages; recovery costs, dependent-system triggers and indemnity periods.",
  },
];

const evidenceGroups = [
  {
    title: "Business and territories",
    description: "Legal entities, ownership, jurisdictions, revenue streams, distribution territories, existing policies, claims and known disputes.",
  },
  {
    title: "Rights and content",
    description: "Chain of title, territory/term schedules, licence agreements, music and talent clearances, QC/legal records and takedown procedures.",
  },
  {
    title: "Technology and security",
    description: "Shared-service dependency map, data flows, privileged access/MFA, cloud/vendor contracts, incident response, and backup/restore evidence.",
  },
  {
    title: "Payments and continuity",
    description: "Checkout and settlement flows, dual approvals, beneficiary-change verification, revenue/contribution-margin model, and outage scenarios.",
  },
];

export function InsuranceReadinessPanel({ audience }: { audience: "Creator" | "Studio" }) {
  return (
    <section className="rounded-sm border border-line p-5 sm:p-6" aria-labelledby="insurance-readiness-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-widest text-muted">Optional business service</p>
          <h2 id="insurance-readiness-title" className="mt-2 font-display text-2xl font-semibold">
            Global Media Insurance Readiness
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Organise the operational and documentary evidence a broker or insurer may request for film distribution, licensing, streaming and technology risks.
            Bridge prepares the evidence trail; an appropriately authorised insurance professional assesses coverage.
          </p>
        </div>
        <span className="rounded-sm border border-line px-3 py-1.5 text-xs text-muted">Proposed service</span>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold">Coverage areas to prepare</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {coverageAreas.map((area) => (
            <article key={area.title} className="rounded-sm border border-line bg-elevated p-3.5">
              <h4 className="text-sm font-medium">{area.title}</h4>
              <p className="mt-1.5 text-xs leading-5 text-muted">{area.description}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold">Broker evidence-pack starter list</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {evidenceGroups.map((group) => (
            <div key={group.title} className="border-l-2 border-line pl-3">
              <h4 className="text-sm font-medium">{group.title}</h4>
              <p className="mt-1 text-xs leading-5 text-muted">{group.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <a
          href={`mailto:contact@streamvista.com?subject=${encodeURIComponent("Crayons Bridge Insurance Readiness enquiry")}&body=${encodeURIComponent("Hello Crayons Bridge,\n\nI would like to enquire about the proposed Global Media Insurance Readiness documentation service.\n\nCustomer type: " + audience + "\nProject title or details (non-confidential): \nPreferred timeframe: \n\nPlease share the confirmed scope, fee and terms.\n")}`}
          className="inline-flex rounded-sm bg-accent px-4 py-2.5 text-sm font-semibold text-[#041018]"
        >
          Enquire about readiness
        </a>
        <Link to="/contact" className="text-sm text-muted underline underline-offset-4">
          Contact Bridge
        </Link>
      </div>
      <p className="mt-4 text-xs leading-5 text-muted">
        Bridge does not underwrite, broker, recommend or select insurance policies, issue coverage decisions, or guarantee insurability.
        Limits, sublimits, premiums, legal treatment and placement must be reviewed by the broker/insurer and qualified advisers.
        Scope, availability and fees must be confirmed before work starts. Do not email confidential policy, identity, payment or security documents; no secure evidence upload or persistent case workspace is provided by this proposed panel.
      </p>
    </section>
  );
}
