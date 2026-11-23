import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({ component: Privacy });

const CONTACT = "abijithasokan@crayonspictures.com";

function Privacy() {
  return (
    <main className="min-h-screen bg-white px-5 py-12 text-fg sm:px-6">
      <article className="mx-auto max-w-3xl space-y-7 rounded-3xl border border-line bg-surface p-7 sm:p-10">
        <Link to="/" className="text-sm font-semibold text-accent">← Crayons Bridge</Link>
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">StreamVista OPC Pvt Ltd · India</p>
          <h1 className="mt-2 font-display text-4xl font-semibold">Privacy Policy</h1>
          <p className="mt-3 text-sm text-muted">Effective publication: 23 November 2026 · Crayons Bridge and related services</p>
        </header>
        <section className="space-y-4 text-sm leading-7 text-muted">
          <h2 className="font-semibold text-fg">1. Who operates the service</h2>
          <p>Crayons Bridge is operated by StreamVista OPC Pvt Ltd (the Company). This notice explains how the Company handles personal data when people visit the website, request access, create an account, use production workspaces, submit titles, license content or contact the Company.</p>
          <h2 className="font-semibold text-fg">2. Data we handle</h2>
          <p>Depending on the service used, data may include identity and contact details, organization and role information, authentication and security events, title metadata, ownership and rights evidence, communications, support requests, usage records, transaction references and payment status. Media files and technical metadata are handled only where a user submits or is authorized to access them.</p>
          <h2 className="font-semibold text-fg">3. Purposes and lawful basis</h2>
          <p>We use data to create and secure accounts, provide requested services, verify identity and authority, operate title and rights workflows, administer licences and delivery, prevent fraud, meet legal obligations, resolve disputes and respond to enquiries. Processing is based on consent where required, steps requested before a contract, performance of contracts, legal obligations and legitimate uses permitted by applicable law.</p>
          <h2 className="font-semibold text-fg">4. Media, rights and legal documents</h2>
          <p>Title records, ownership documents, licence terms and media metadata may be processed to provide secure services and establish rights and authorization. Uploading a document is not a legal verification or approval. Access is restricted by account, organization, role and title permissions. We do not make private master assets publicly accessible through this privacy notice.</p>
          <h2 className="font-semibold text-fg">5. Payments and service providers</h2>
          <p>Payment processing may be supported by Razorpay or other authorized providers. The Company receives relevant transaction references and status information; payment credentials are handled by the payment provider. Cloud hosting, storage, authentication, email and monitoring providers may process information only as needed to provide their services under applicable safeguards.</p>
          <h2 className="font-semibold text-fg">6. Sharing and international processing</h2>
          <p>We do not sell personal data. Information may be shared with authorized service providers, counterparties where a user requests a transaction, professional advisers, regulators or law-enforcement authorities where legally required. Some providers may process data outside India; appropriate contractual and security safeguards will be applied as required by law.</p>
          <h2 className="font-semibold text-fg">7. Retention and security</h2>
          <p>We retain information only for as long as reasonably needed for the stated purposes, contractual records, legal compliance, security and dispute resolution. Retention periods depend on record type and applicable law. We use access controls and security measures designed to protect data, but no internet service can guarantee absolute security.</p>
          <h2 className="font-semibold text-fg">8. Your choices and rights</h2>
          <p>Subject to applicable law, you may request access to information, correction or updating, erasure where retention is no longer necessary or legally required, and grievance redressal. You may withdraw consent where processing is based on consent; withdrawal does not affect prior lawful processing or other lawful bases. We may need to verify your identity and authority before acting.</p>
          <h2 className="font-semibold text-fg">9. Children</h2>
          <p>The platform is intended for business and professional use, not for children. Do not submit another person's personal information unless you are authorized to do so.</p>
          <h2 className="font-semibold text-fg">10. Cookies and technical data</h2>
          <p>Essential session, security and preference technologies may be used to operate the website. Security logs and basic diagnostic data may be collected to protect the service and troubleshoot errors. Optional analytics or non-essential technologies should be controlled through applicable consent settings.</p>
          <h2 className="font-semibold text-fg">11. Grievance and contact</h2>
          <p>For privacy requests, data correction or deletion enquiries, contact <a className="font-semibold text-accent underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> or use the <Link to="/contact" className="font-semibold text-accent underline">Contact page</Link>. The Company will respond within the period required by applicable law.</p>
          <h2 className="font-semibold text-fg">12. Updates</h2>
          <p>We may revise this notice to reflect service or legal changes. The latest version and effective date will be published on this page.</p>
        </section>
        <p className="border-t border-line pt-5 text-xs text-muted">This policy is operational information and is not legal advice. The Company should obtain Indian counsel review before treating it as a final statutory notice.</p>
      </article>
    </main>
  );
}
