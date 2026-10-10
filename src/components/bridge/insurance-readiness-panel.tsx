import { Link } from "@tanstack/react-router";

const included = [
  "Project and business document inventory",
  "Rights, contracts and operational evidence checklist",
  "Missing or inconsistent evidence register",
  "Customer-approved handoff pack for an independent insurance professional",
];

export function InsuranceReadinessPanel({ audience }: { audience: "Creator" | "Studio" }) {
  return (
    <section className="rounded-sm border border-line p-5 sm:p-6" aria-labelledby="insurance-readiness-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-widest text-muted">Optional business service</p>
          <h2 id="insurance-readiness-title" className="mt-2 font-display text-2xl font-semibold">
            Insurance Readiness
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Prepare your production or studio documentation for review by an independent, appropriately authorized insurance professional.
            Bridge organizes the evidence; it does not decide coverage.
          </p>
        </div>
        <span className="rounded-sm border border-line px-3 py-1.5 text-xs text-muted">Proposed service</span>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {included.map((item) => (
          <li key={item} className="flex gap-2 text-sm">
            <span aria-hidden="true" className="text-accent">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <a
          href={`mailto:contact@streamvista.com?subject=${encodeURIComponent("Crayons Bridge Insurance Readiness enquiry")}&body=${encodeURIComponent("Hello Crayons Bridge,\n\nI would like to enquire about the proposed Insurance Readiness documentation service.\n\nCustomer type: " + audience + "\nProject title or details (non-confidential): \nPreferred timeframe: \n\nPlease share the confirmed scope, fee and terms.\n")}`}
          className="inline-flex rounded-sm bg-accent px-4 py-2.5 text-sm font-semibold text-[#041018]"
        >
          Enquire about readiness
        </a>
        <Link to="/contact" className="text-sm text-muted underline underline-offset-4">
          Contact Bridge
        </Link>
      </div>
      <p className="mt-4 text-xs leading-5 text-muted">
        This is a documentation-preparation service, not insurance advice, a coverage assessment, a policy, a guarantee of insurability or a regulatory certification.
        Scope, availability and fees must be confirmed before work starts. Do not email confidential documents; use an approved secure workspace if the service is accepted.
      </p>
    </section>
  );
}
